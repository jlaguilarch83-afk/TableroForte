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
        Fondo.aplicar(this);
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
            if (vista.pagina == CasaView.P_TELE && System.currentTimeMillis() - teleLeida > 30000) leerTele();
            if (vista.pagina == CasaView.P_RADAR && System.currentTimeMillis() - radarLeido > 3500) leerRadar();
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

    // ---- Voz: el reloj dicta y Mi Casa entiende la frase (igual que el bot de Telegram) ----
    static final int VOZ = 7, PERMISOS = 8;
    void escuchar() {
        try {
            android.content.Intent i = new android.content.Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "es-MX");
            i.putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "¿Qué hago?");
            startActivityForResult(i, VOZ);
        } catch (Exception e) { vista.aviso("Este reloj no tiene dictado"); }
    }
    @Override
    protected void onActivityResult(int req, int res, android.content.Intent data) {
        super.onActivityResult(req, res, data);
        if (req != VOZ || res != RESULT_OK || data == null) return;
        java.util.ArrayList<String> r = data.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
        if (r != null && !r.isEmpty()) enviarVoz(r.get(0));
    }
    void enviarVoz(final String texto) {
        final String p = pin();
        vista.vozMandando(texto);
        red.execute(() -> {
            JSONObject b = new JSONObject();
            try { b.put("texto", texto); b.put("quien", "reloj"); } catch (Exception ignored) { }
            Resp r = http("POST", "voz", b.toString(), p);
            main.post(() -> {
                boolean ok = r.json != null && r.json.optBoolean("ok");
                vista.ponerVoz(texto, r.json != null ? r.json.optString("respuesta", "Listo") : r.error, ok);
                vibrar(ok ? new long[]{0, 30, 60, 30} : new long[]{0, 200});
                main.postDelayed(this::leerEstado, 2500);
            });
        });
    }

    // ---- Perilla de brillo ----
    void mandarBrillo(final String zona, final int pct) {
        final String p = pin();
        red.execute(() -> {
            Resp r = http("POST", "casa?action=brillo", "{\"zone\":\"" + zona + "\",\"pct\":" + pct + ",\"who\":\"Reloj\"}", p);
            main.post(() -> { if (r.json == null || !r.json.optBoolean("ok")) vista.aviso(r.json != null ? r.json.optString("error", "No se pudo") : r.error); else vista.listo(zona, true); });
        });
    }

    // ---- Radar: sensores (por la Raspberry, gratis) y personas que vio una cámara ----
    long radarLeido = 0;
    void leerRadar() {
        radarLeido = System.currentTimeMillis();
        leerEstado();
        final String p = pin();
        red.execute(() -> {
            Resp r = http("GET", "cam/estado", null, p);
            main.post(() -> {
                JSONObject a = r.json != null ? r.json.optJSONObject("aviso") : null;
                if (a != null) vista.ponerPersona(a.optString("camara", a.optString("cam", "")), a.optString("quien", ""), a.optLong("ts", System.currentTimeMillis()));
            });
        });
    }

    // ---- Funciones del reloj: aviso al llegar (GPS) y modo dormir ----
    void cambiarFuncion(String k) {
        if (k.equals("f_casa")) { guardarCasa(); return; }
        boolean on = !prefs.getBoolean(k, false);
        if (on) {
            java.util.List<String> faltan = new java.util.ArrayList<>();
            if (k.equals("f_llegada")) { faltan.add(android.Manifest.permission.ACCESS_FINE_LOCATION); faltan.add(android.Manifest.permission.ACCESS_COARSE_LOCATION); }
            if (k.equals("f_dormir")) faltan.add(android.Manifest.permission.ACTIVITY_RECOGNITION);
            if (android.os.Build.VERSION.SDK_INT >= 33) faltan.add(android.Manifest.permission.POST_NOTIFICATIONS);
            java.util.List<String> pedir = new java.util.ArrayList<>();
            for (String x : faltan) if (checkSelfPermission(x) != android.content.pm.PackageManager.PERMISSION_GRANTED) pedir.add(x);
            if (!pedir.isEmpty()) { pendiente = k; requestPermissions(pedir.toArray(new String[0]), PERMISOS); return; }
            if (k.equals("f_llegada") && checkSelfPermission(android.Manifest.permission.ACCESS_BACKGROUND_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                vista.aviso("Elige: Permitir todo el tiempo");
                requestPermissions(new String[]{android.Manifest.permission.ACCESS_BACKGROUND_LOCATION}, PERMISOS + 1);
            }
            if (k.equals("f_llegada") && !prefs.contains("casa_lat")) vista.aviso("Falta: Guardar mi casa aquí");
        }
        prefs.edit().putBoolean(k, on).apply();
        Fondo.aplicar(this);
        vibrar(new long[]{0, 25});
        vista.invalidate();
    }
    String pendiente = null;
    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req == PERMISOS && pendiente != null) {
            boolean todos = true;
            for (int x : res) if (x != android.content.pm.PackageManager.PERMISSION_GRANTED) todos = false;
            String k = pendiente; pendiente = null;
            if (todos) cambiarFuncion(k); else vista.aviso("Sin permiso no funciona");
        }
        Fondo.aplicar(this);
    }
    void guardarCasa() {
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            pendiente = null; requestPermissions(new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION}, PERMISOS + 2); return;
        }
        vista.aviso("Buscando dónde estás…");
        Fondo.ubicacion(this, loc -> main.post(() -> {
            if (loc == null) { vista.aviso("No encontré la ubicación. Sal al patio y vuelve a tocar"); return; }
            prefs.edit().putFloat("casa_lat", (float) loc.getLatitude()).putFloat("casa_lon", (float) loc.getLongitude()).apply();
            vista.aviso("Casa guardada ✓");
            Fondo.aplicar(this);
            vista.invalidate();
        }));
    }

    // ---- Tele (Samsung por SmartThings) ----
    long teleLeida = 0;
    void leerTele() {
        if (pin().isEmpty()) return;
        teleLeida = System.currentTimeMillis();
        final String p = pin();
        red.execute(() -> {
            Resp r = http("GET", "st?action=tvstatus", null, p);
            main.post(() -> { if (r.json != null && r.json.optBoolean("ok")) vista.ponerTele(r.json.optBoolean("on")); });
        });
    }
    void mandarTele(final String k) {
        final String p = pin();
        vibrar(new long[]{0, 18});
        red.execute(() -> {
            Resp r = http("POST", "st?action=tv", "{\"c\":\"" + k + "\"}", p);
            main.post(() -> {
                if (r.json == null || !r.json.optBoolean("ok")) {
                    vista.aviso(r.json != null ? r.json.optString("error", "La tele no contestó") : r.error);
                    if ("on".equals(k) || "off".equals(k)) vista.ponerTele(!"on".equals(k));
                }
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
