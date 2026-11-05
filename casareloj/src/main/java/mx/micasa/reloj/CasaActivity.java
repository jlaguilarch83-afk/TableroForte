package mx.micasa.reloj;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Mi Casa en el Galaxy Watch.
 * Pregunta a la nube de Mi Casa (Netlify) cómo está la casa mientras la app está abierta,
 * y manda las órdenes: prender/apagar cuartos, portón, alarma y "Me voy".
 */
public class CasaActivity extends Activity {

    static final String BASE = "https://micasa-jl.jl-aguilarch83.workers.dev/api/";
    static final long CADA_MS = 6000;

    final Handler main = new Handler(Looper.getMainLooper());
    final ExecutorService red = Executors.newSingleThreadExecutor();
    CasaView vista;
    SharedPreferences prefs;
    boolean activa = false;
    boolean vibroAlarma = false;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("micasa", MODE_PRIVATE);
        vista = new CasaView(this);
        setContentView(vista);
        vista.requestFocus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        activa = true;
        vista.requestFocus();
        main.removeCallbacks(ciclo);
        main.post(ciclo);
    }

    @Override
    protected void onPause() {
        super.onPause();
        activa = false;
        main.removeCallbacks(ciclo);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        red.shutdownNow();
    }

    String pin() { return prefs.getString("pin", ""); }

    void guardarPin(String p) {
        prefs.edit().putString("pin", p).apply();
        main.removeCallbacks(ciclo);
        main.post(ciclo);
    }

    final Runnable ciclo = new Runnable() {
        @Override public void run() {
            if (!activa) return;
            leerEstado();
            main.postDelayed(this, CADA_MS);
        }
    };

    void leerEstado() {
        if (pin().isEmpty()) { vista.pedirPin(); return; }
        final String p = pin();
        red.execute(() -> {
            Resp r = http("GET", "estado?lite=1", null, p);
            main.post(() -> {
                if (r.code == 401) { prefs.edit().remove("pin").apply(); vista.pinMalo(); return; }
                if (r.json == null || !r.json.optBoolean("ok")) { vista.sinConexion(r.error); return; }
                JSONObject luces = r.json.optJSONObject("luces");
                if (luces != null) {
                    Iterator<String> it = luces.keys();
                    while (it.hasNext()) { String k = it.next(); vista.ponerEstado(k, luces.optBoolean(k)); }
                }
                JSONObject al = r.json.optJSONObject("alarm");
                if (al != null && al.optBoolean("ok")) {
                    boolean sonando = al.optBoolean("triggered");
                    vista.ponerAlarma(al.optString("mode", ""), sonando);
                    if (sonando && !vibroAlarma) vibrar(new long[]{0, 600, 250, 600, 250, 600});
                    vibroAlarma = sonando;
                }
                vista.conectado();
            });
        });
    }

    /** Prende o apaga un cuarto, o abre/cierra portón y puerta. */
    void mandarCuarto(final String zona, final boolean on) {
        final String p = pin();
        vibrar(new long[]{0, 30});
        red.execute(() -> {
            String body = "{\"zone\":\"" + zona + "\",\"on\":" + on + ",\"who\":\"Reloj\"}";
            Resp r = http("POST", "casa?action=set", body, p);
            main.post(() -> {
                if (r.json != null && r.json.optBoolean("ok")) vista.listo(zona, on);
                else vista.fallo(zona, r.json != null ? r.json.optString("error", "No respondió") : r.error);
            });
        });
    }

    void mandarAlarma(final String modo) {
        final String p = pin();
        vibrar(new long[]{0, 40});
        red.execute(() -> {
            Resp r = http("POST", "casa?action=alarma", "{\"mode\":\"" + modo + "\",\"who\":\"Reloj\"}", p);
            main.post(() -> {
                if (r.json != null && r.json.optBoolean("ok")) { vista.ponerAlarma(modo, false); vista.aviso("disarm".equals(modo) ? "Alarma desarmada" : "Alarma armada"); }
                else vista.aviso(r.json != null ? r.json.optString("error", "No respondió") : r.error);
            });
        });
    }

    void meVoy() {
        final String p = pin();
        vibrar(new long[]{0, 40, 80, 40});
        red.execute(() -> {
            Resp r = http("POST", "casa?action=mevoy", "{\"who\":\"Reloj\"}", p);
            main.post(() -> {
                if (r.json != null && r.json.optBoolean("ok")) {
                    vista.meVoyListo();
                    int n = r.json.optInt("luces");
                    vista.aviso("Listo: " + n + (n == 1 ? " luz apagada" : " luces apagadas") + (r.json.optBoolean("alarma") ? ", alarma armada" : ""));
                } else vista.aviso(r.json != null ? r.json.optString("error", "No respondió") : r.error);
                main.postDelayed(this::leerEstado, 6000);
            });
        });
    }

    void vibrar(long[] patron) {
        try {
            Vibrator v = getSystemService(Vibrator.class);
            if (v != null) v.vibrate(VibrationEffect.createWaveform(patron, -1));
        } catch (Exception ignored) { }
    }

    static class Resp { int code; JSONObject json; String error = "Sin conexión"; }

    static Resp http(String metodo, String ruta, String body, String pin) {
        Resp r = new Resp();
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(BASE + ruta).openConnection();
            c.setRequestMethod(metodo);
            c.setConnectTimeout(8000);
            c.setReadTimeout(12000);
            c.setRequestProperty("X-Casa-Pin", pin);
            c.setRequestProperty("Accept", "application/json");
            if (body != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                try (OutputStream os = c.getOutputStream()) { os.write(body.getBytes(StandardCharsets.UTF_8)); }
            }
            r.code = c.getResponseCode();
            InputStream in = r.code >= 400 ? c.getErrorStream() : c.getInputStream();
            if (in != null) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                in.close();
                r.json = new JSONObject(bo.toString("UTF-8"));
            }
        } catch (Exception e) {
            r.error = "Sin conexión";
        } finally {
            if (c != null) c.disconnect();
        }
        return r;
    }
}
