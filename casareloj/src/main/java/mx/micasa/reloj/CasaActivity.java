package mx.micasa.reloj;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.BitmapFactory;
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
 * y manda las órdenes: prender/apagar cuartos, portón, alarma, modo, "Llegando" y "Me voy".
 * La pantalla de cámaras baja una foto por segundo de la Raspberry solo mientras se está viendo.
 */
public class CasaActivity extends Activity {

    static final String BASE = "https://micasa-jl.jl-aguilarch83.workers.dev/api/";
    static final long CADA_MS = 15000;

    final Handler main = new Handler(Looper.getMainLooper());
    final ExecutorService red = Executors.newSingleThreadExecutor();
    final ExecutorService camRed = Executors.newSingleThreadExecutor();
    volatile boolean bajandoFoto = false;
    CasaView vista;
    SharedPreferences prefs;
    boolean activa = false;
    boolean vibroAlarma = false;
    // Smart Life (Tuya) se lee una sola vez al abrir el reloj: cada lectura gasta cuota de la cuenta de prueba
    boolean leerTuya = true;

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
        leerTuya = true;
        vista.requestFocus();
        main.removeCallbacks(ciclo);
        main.post(ciclo);
        main.removeCallbacks(camCiclo);
        main.post(camCiclo);
    }

    // El bisel manda sus giros aquí aunque la vista no tenga el foco
    @Override
    public boolean dispatchGenericMotionEvent(android.view.MotionEvent e) {
        if (vista != null && vista.girarBisel(e)) return true;
        return super.dispatchGenericMotionEvent(e);
    }

    @Override
    protected void onPause() {
        super.onPause();
        activa = false;
        main.removeCallbacks(ciclo);
        main.removeCallbacks(camCiclo);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        red.shutdownNow();
        camRed.shutdownNow();
    }

    String pin() { return prefs.getString("pin", ""); }

    void guardarPin(String p) {
        prefs.edit().putString("pin", p).apply();
        leerTuya = true;
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
        final boolean conTuya = leerTuya;
        leerTuya = false;
        red.execute(() -> {
            Resp r = http("GET", "estado?lite=1" + (conTuya ? "&tuya=1" : ""), null, p);
            main.post(() -> {
                if (r.code == 401) { if (conTuya) leerTuya = true; prefs.edit().remove("pin").apply(); vista.pinMalo(); return; }
                if (r.json == null || !r.json.optBoolean("ok")) { if (conTuya) leerTuya = true; vista.sinConexion(r.error); return; }
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

    // Cámaras: solo baja fotos mientras se ve esa pantalla (una por segundo, sin hacer fila)
    final Runnable camCiclo = new Runnable() {
        @Override public void run() {
            if (!activa) return;
            if (vista.pagina == CasaView.P_CAM && vista.arrastre == 0) pedirFoto();
            if (vista.pagina == CasaView.P_MODO && System.currentTimeMillis() - vista.modoLeido > 20000) leerModo();
            main.postDelayed(this, 900);
        }
    };

    void pedirFoto() {
        if (bajandoFoto || pin().isEmpty()) return;
        bajandoFoto = true;
        final String p = pin(), src = CasaView.CAMS[vista.cam][0];
        final int cual = vista.cam;
        camRed.execute(() -> {
            Bin r = httpBytes("cam/foto?src=" + src, p);
            android.graphics.Bitmap b = null;
            if (r.bytes != null && r.code == 200) {
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inPreferredConfig = android.graphics.Bitmap.Config.RGB_565;
                o.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(r.bytes, 0, r.bytes.length, o);
                int s = 1;
                while (o.outWidth / (s * 2) >= 480) s *= 2;
                o.inJustDecodeBounds = false;
                o.inSampleSize = s;
                b = BitmapFactory.decodeByteArray(r.bytes, 0, r.bytes.length, o);
            }
            final android.graphics.Bitmap bf = b;
            main.post(() -> {
                bajandoFoto = false;
                if (cual != vista.cam) return;            // ya cambió de cámara
                if (bf != null) vista.ponerFoto(bf);
                else vista.errorFoto(r.code == 404 ? "La Raspberry no está conectada" : r.code == 401 ? "PIN incorrecto" : "La cámara no contestó");
            });
        });
    }

    void leerModo() {
        if (pin().isEmpty()) return;
        vista.modoLeido = System.currentTimeMillis();
        final String p = pin();
        red.execute(() -> {
            Resp r = http("GET", "camara?action=funciones", null, p);
            main.post(() -> {
                if (r.json != null && r.json.optBoolean("ok")) {
                    String sel = r.json.optString("modoSel", "auto");
                    if (r.json.optLong("dnd") > System.currentTimeMillis()) sel = "nomolestar";
                    vista.ponerModo(sel, r.json.optString("modoNom", null), r.json.optString("modoPor", null));
                }
            });
        });
    }

    void mandarModo(final String modo) {
        final String p = pin();
        vibrar(new long[]{0, 30});
        red.execute(() -> {
            Resp r = http("POST", "camara?action=funciones", "{\"modo\":\"" + modo + "\",\"dnd\":0}", p);
            main.post(() -> {
                if (r.json != null && r.json.optBoolean("ok")) vista.ponerModo(r.json.optString("modoSel", modo), r.json.optString("modoNom", null), r.json.optString("modoPor", null));
                else vista.aviso(r.json != null ? r.json.optString("error", "No respondió") : r.error);
            });
        });
    }

    void llegando() {
        final String p = pin();
        vibrar(new long[]{0, 40, 80, 40});
        red.execute(() -> {
            Resp r = http("POST", "casa?action=llegando", "{\"who\":\"Reloj\"}", p);
            main.post(() -> {
                if (r.json != null && r.json.optBoolean("ok")) {
                    int n = r.json.optInt("luces");
                    boolean pt = r.json.optBoolean("porton");
                    vista.aviso("Bienvenido: " + (pt ? "portón abierto" : "portón ya abierto") + (n > 0 ? ", " + n + (n == 1 ? " luz" : " luces") : ""));
                } else vista.aviso(r.json != null ? r.json.optString("error", "No respondió") : r.error);
                main.postDelayed(this::leerEstado, 4000);
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
    static class Bin { int code; byte[] bytes; }

    static Bin httpBytes(String ruta, String pin) {
        Bin r = new Bin();
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(BASE + ruta).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(10000);
            c.setRequestProperty("X-Casa-Pin", pin);
            r.code = c.getResponseCode();
            if (r.code == 200) {
                try (InputStream in = c.getInputStream()) {
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                    r.bytes = bo.toByteArray();
                }
            }
        } catch (Exception e) {
            r.code = -1;
        } finally {
            if (c != null) c.disconnect();
        }
        return r;
    }

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
