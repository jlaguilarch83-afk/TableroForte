package mx.forte.tablero;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Looper;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Tablero Forte: muestra el tablero web (assets/) en pantalla completa y lee el auto
 * por Bluetooth clásico con un adaptador ELM327. También da a la página GPS, voz,
 * cámara, controles de música, compartir y guardado de fotos y videos.
 *
 * La página se sirve desde https://forte.app/ (interceptado, no sale a internet) para
 * que la cámara funcione como en un sitio seguro.
 */
public class MainActivity extends Activity implements ObdService.Listener {

    private static final String HOST = "forte.app";
    private static final int REQ_BT = 7, REQ_LOC = 8, REQ_CAM = 9, REQ_VOZ = 10, REQ_MIC = 11;

    private WebView web;
    private BluetoothAdapter adapter;

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private LocationManager locMgr;
    private LocationListener locListener;
    private PermissionRequest pendingCam;
    private final Map<Integer, Object[]> files = new HashMap<>();
    private int nextFile = 1;

    // sensor de luz: activa el modo noche y los faros en pantalla
    private SensorManager sensores;
    private long lastLux = 0;
    private final SensorEventListener luz = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent e) {
            long now = System.currentTimeMillis();
            if (now - lastLux < 2000) return;
            lastLux = now;
            js("window.forteDash&&forteDash.light&&forteDash.light(" + e.values[0] + ")");
        }

        @Override
        public void onAccuracyChanged(Sensor s, int a) {
        }
    };

    @Override
    protected void onResume() {
        super.onResume();
        sensores = (SensorManager) getSystemService(SENSOR_SERVICE);
        Sensor l = sensores != null ? sensores.getDefaultSensor(Sensor.TYPE_LIGHT) : null;
        if (l != null) sensores.registerListener(luz, l, SensorManager.SENSOR_DELAY_NORMAL);
    }

    @Override
    protected void onPause() {
        if (sensores != null) sensores.unregisterListener(luz);
        super.onPause();
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(0xFF02040A);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.addJavascriptInterface(new Bridge(), "OBD");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                status(ObdService.statusText, ObdService.statusKind);
                if (ObdService.isConnected()) {
                    JSONObject o = new JSONObject();
                    try {
                        synchronized (ObdService.last) {
                            for (Map.Entry<String, Double> e : ObdService.last.entrySet()) o.put(e.getKey(), e.getValue());
                        }
                    } catch (Exception ignored) {
                    }
                    js("window.forteDash&&forteDash.setData(" + o + ")");
                }
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath() == null || u.getPath().equals("/") ? "index.html" : u.getPath().substring(1);
                try {
                    InputStream in = getAssets().open(path);
                    WebResourceResponse r = new WebResourceResponse(mime(path), "UTF-8", in);
                    Map<String, String> h = new HashMap<>();
                    h.put("Cache-Control", "no-cache");
                    r.setResponseHeaders(h);
                    return r;
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "UTF-8", 404, "No encontrado", null, null);
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (has(Manifest.permission.CAMERA)) {
                        request.grant(request.getResources());
                    } else {
                        pendingCam = request;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM);
                    }
                });
            }
        });
        setContentView(web);

        BluetoothManager bm = (BluetoothManager) getSystemService(BLUETOOTH_SERVICE);
        adapter = bm != null ? bm.getAdapter() : null;
        List<String> pedir = new java.util.ArrayList<>();
        if (Build.VERSION.SDK_INT >= 31 && !has(Manifest.permission.BLUETOOTH_CONNECT)) pedir.add(Manifest.permission.BLUETOOTH_CONNECT);
        if (Build.VERSION.SDK_INT >= 33 && !has(Manifest.permission.POST_NOTIFICATIONS)) pedir.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!pedir.isEmpty()) requestPermissions(pedir.toArray(new String[0]), REQ_BT);
        ObdService.listeners.add(this);
        tts = new TextToSpeech(this, st -> {
            if (st == TextToSpeech.SUCCESS) {
                tts.setLanguage(new Locale("es", "MX"));
                ttsReady = true;
            }
        });
        web.loadUrl("https://" + HOST + "/index.html");
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    private boolean has(String perm) {
        return checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_VOZ) return;
        String txt = "";
        if (res == RESULT_OK && data != null) {
            java.util.ArrayList<String> r = data.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
            if (r != null && !r.isEmpty()) txt = r.get(0);
        }
        js("window.forteDash&&forteDash.heard&&forteDash.heard(" + JSONObject.quote(txt) + ")");
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
        if (code == REQ_LOC && ok) startGpsInternal();
        if (code == REQ_CAM && pendingCam != null) {
            if (ok) pendingCam.grant(pendingCam.getResources()); else pendingCam.deny();
            pendingCam = null;
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    protected void onDestroy() {
        ObdService.listeners.remove(this);
        stopGps();
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }

    // ---------- Comunicación con la página ----------

    private void js(final String code) {
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(code, null);
        });
    }

    private void status(String text, String kind) {
        js("window.forteDash&&forteDash.status(" + JSONObject.quote(text) + "," + JSONObject.quote(kind) + ")");
    }

    @Override
    public void onData(JSONObject data) {
        js("window.forteDash&&forteDash.setData(" + data + ")");
    }

    @Override
    public void onStatus(String text, String kind) {
        status(text, kind);
    }

    @Override
    public void onCodes(List<String> codes) {
        if (codes == null) {
            status("Conecta el OBD para leer fallas", "off");
            js("window.forteDash&&forteDash.codes(null)");
            return;
        }
        JSONArray a = new JSONArray();
        for (String c : codes) a.put(c);
        js("window.forteDash&&forteDash.codes(" + a + ")");
    }

    @Override
    public void onCleared(boolean ok) {
        js("window.forteDash&&forteDash.cleared(" + ok + ")");
    }

    private boolean hasBtPermission() {
        return Build.VERSION.SDK_INT < 31 || has(Manifest.permission.BLUETOOTH_CONNECT);
    }

    // ---------- GPS ----------

    private void startGpsInternal() {
        if (locListener != null) return;
        if (!has(Manifest.permission.ACCESS_FINE_LOCATION)) return;
        locMgr = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (locMgr == null) return;
        locListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location l) {
                try {
                    JSONObject o = new JSONObject();
                    o.put("lat", l.getLatitude());
                    o.put("lon", l.getLongitude());
                    if (l.hasSpeed()) o.put("speed", (double) l.getSpeed());
                    if (l.hasBearing()) o.put("bearing", (double) l.getBearing());
                    if (l.hasAltitude()) o.put("alt", l.getAltitude());
                    if (l.hasAccuracy()) o.put("acc", (double) l.getAccuracy());
                    js("window.forteDash&&forteDash.gps(" + o + ")");
                } catch (Exception ignored) {
                }
            }

            @Override
            public void onStatusChanged(String p, int s, Bundle b) {
            }

            @Override
            public void onProviderEnabled(String p) {
            }

            @Override
            public void onProviderDisabled(String p) {
            }
        };
        try {
            locMgr.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, locListener, Looper.getMainLooper());
        } catch (SecurityException | IllegalArgumentException e) {
            locListener = null;
        }
    }

    private void stopGps() {
        try {
            if (locMgr != null && locListener != null) locMgr.removeUpdates(locListener);
        } catch (Exception ignored) {
        }
        locListener = null;
    }

    // ---------- Guardar fotos y videos ----------

    private int beginFile(String kind, String name, String mimeType) throws Exception {
        boolean video = "video".equals(kind);
        Uri uri = null;
        File file = null;
        OutputStream out;
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            cv.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            cv.put(MediaStore.MediaColumns.RELATIVE_PATH, (video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES) + "/TableroForte");
            cv.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri col = video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            uri = getContentResolver().insert(col, cv);
            if (uri == null) throw new Exception("sin acceso al almacenamiento");
            out = getContentResolver().openOutputStream(uri);
        } else {
            File dir = new File(getExternalFilesDir(video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES), "TableroForte");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("no se pudo crear la carpeta");
            file = new File(dir, name);
            out = new FileOutputStream(file);
        }
        if (out == null) throw new Exception("sin acceso al archivo");
        synchronized (files) {
            int id = nextFile++;
            files.put(id, new Object[]{out, uri, file, kind, name});
            return id;
        }
    }

    private void endFile(int id, int keep) throws Exception {
        Object[] f;
        synchronized (files) {
            f = files.remove(id);
        }
        if (f == null) return;
        ((OutputStream) f[0]).close();
        Uri uri = (Uri) f[1];
        File file = (File) f[2];
        String kind = (String) f[3];
        if (uri != null && Build.VERSION.SDK_INT >= 29) {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.MediaColumns.IS_PENDING, 0);
            getContentResolver().update(uri, cv, null, null);
        }
        if ("video".equals(kind) && keep > 0) {
            // grabación en ciclo: se borran los videos más viejos que guardó esta app
            SharedPreferences sp = getSharedPreferences("forte", MODE_PRIVATE);
            JSONArray list = new JSONArray(sp.getString("videos", "[]"));
            list.put(uri != null ? uri.toString() : file.getAbsolutePath());
            while (list.length() > keep) {
                String old = list.getString(0);
                try {
                    if (old.startsWith("content:")) getContentResolver().delete(Uri.parse(old), null, null);
                    else new File(old).delete();
                } catch (Exception ignored) {
                }
                JSONArray rest = new JSONArray();
                for (int i = 1; i < list.length(); i++) rest.put(list.get(i));
                list = rest;
            }
            sp.edit().putString("videos", list.toString()).apply();
        }
        js("window.forteDash&&forteDash.saved(" + JSONObject.quote(kind) + "," + JSONObject.quote((String) f[4]) + ")");
    }

    // ---------- Puente con la página ----------

    public class Bridge {
        @JavascriptInterface
        public String state() {
            if (adapter == null) return "nobt";
            if (!hasBtPermission()) return "noperm";
            if (!adapter.isEnabled()) return "off";
            return "ok";
        }

        @SuppressLint("MissingPermission")
        @JavascriptInterface
        public String devices() {
            JSONArray arr = new JSONArray();
            try {
                if (adapter == null || !hasBtPermission()) return arr.toString();
                Set<BluetoothDevice> set = adapter.getBondedDevices();
                if (set == null) return arr.toString();
                for (BluetoothDevice d : set) {
                    JSONObject o = new JSONObject();
                    String n = d.getName();
                    o.put("name", n == null ? "(sin nombre)" : n);
                    o.put("address", d.getAddress());
                    arr.put(o);
                }
            } catch (Exception ignored) {
            }
            return arr.toString();
        }

        @JavascriptInterface
        public void askPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 31) {
                    requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, REQ_BT);
                }
            });
        }

        @JavascriptInterface
        public void connect(final String address) {
            // si el servicio ya está conectado a ese adaptador, solo se avisa el estado
            if (ObdService.instance != null && address.equals(ObdService.savedAddress(MainActivity.this)) && !"off".equals(ObdService.statusKind)) {
                status(ObdService.statusText, ObdService.statusKind);
                return;
            }
            runOnUiThread(() -> ObdService.connect(MainActivity.this, address));
        }

        @JavascriptInterface
        public void disconnect() {
            ObdService.disconnect(MainActivity.this);
        }

        @JavascriptInterface
        public void readCodes() {
            ObdService.requestCodes();
        }

        @JavascriptInterface
        public void clearCodes() {
            ObdService.requestClear();
        }

        @JavascriptInterface
        public void speak(String text) {
            if (text == null) return;
            if (ObdService.instance != null) ObdService.speakNow(text);
            else if (ttsReady) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "forte");
        }

        /** Ajustes de alertas que usa el servicio (también con la pantalla apagada o en Android Auto). */
        @JavascriptInterface
        public void config(String json) {
            try {
                JSONObject o = new JSONObject(json);
                ObdService.prefs(MainActivity.this).edit()
                        .putInt("limite", o.optInt("limite", 0))
                        .putInt("gas_aviso", o.optInt("gasAviso", 15))
                        .putInt("estacionado_min", o.optInt("estacionadoMin", 5))
                        .putBoolean("voz", o.optBoolean("voz", true))
                        .apply();
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public String oilGet() {
            SharedPreferences p = ObdService.prefs(MainActivity.this);
            return "{\"km\":" + p.getFloat("oil_km", 0) + ",\"intervalo\":" + p.getInt("oil_int", 5000) + ",\"set\":" + p.contains("oil_int") + "}";
        }

        @JavascriptInterface
        public void oilSet(double km, int intervalo) {
            ObdService.prefs(MainActivity.this).edit().putFloat("oil_km", (float) km).putInt("oil_int", intervalo).apply();
        }

        @JavascriptInterface
        public String batteryLog() {
            return ObdService.prefs(MainActivity.this).getString("bat_log", "[]");
        }

        @JavascriptInterface
        public void media(String action) {
            int key = "next".equals(action) ? KeyEvent.KEYCODE_MEDIA_NEXT
                    : "prev".equals(action) ? KeyEvent.KEYCODE_MEDIA_PREVIOUS
                    : KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
            AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
            if (am == null) return;
            am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, key));
            am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, key));
        }

        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                i.setPackage("com.whatsapp");
                try {
                    startActivity(i);
                } catch (ActivityNotFoundException e) {
                    i.setPackage(null);
                    startActivity(Intent.createChooser(i, "Compartir viaje"));
                }
            });
        }

        /** Escucha un comando de voz con el reconocedor de Google. */
        @JavascriptInterface
        public void listen() {
            runOnUiThread(() -> {
                Intent i = new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "es-MX");
                i.putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "¿Qué necesitas?");
                try {
                    startActivityForResult(i, REQ_VOZ);
                } catch (Exception e) {
                    js("window.forteDash&&forteDash.heard&&forteDash.heard('')");
                }
            });
        }

        /** Abre un enlace (mapas, navegación) en la app que corresponda. */
        @JavascriptInterface
        public void openUrl(final String url) {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception ignored) {
                }
            });
        }

        /** Manda al reloj dónde quedó estacionado el auto. */
        @JavascriptInterface
        public void parked(double lat, double lon) {
            try {
                com.google.android.gms.wearable.PutDataMapRequest r = com.google.android.gms.wearable.PutDataMapRequest.create("/forte/estacionado");
                r.getDataMap().putDouble("lat", lat);
                r.getDataMap().putDouble("lon", lon);
                r.getDataMap().putLong("t", System.currentTimeMillis());
                com.google.android.gms.wearable.Wearable.getDataClient(MainActivity.this).putDataItem(r.asPutDataRequest().setUrgent());
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void startGps() {
            runOnUiThread(() -> {
                if (has(Manifest.permission.ACCESS_FINE_LOCATION)) startGpsInternal();
                else requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOC);
            });
        }

        @JavascriptInterface
        public boolean hasCamera() {
            return has(Manifest.permission.CAMERA);
        }

        @JavascriptInterface
        public void askCamera() {
            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM));
        }

        @JavascriptInterface
        public int fileBegin(String kind, String name, String mimeType) {
            try {
                return beginFile(kind, name, mimeType);
            } catch (Exception e) {
                js("window.forteDash&&forteDash.camError(" + JSONObject.quote(String.valueOf(e.getMessage())) + ")");
                return -1;
            }
        }

        @JavascriptInterface
        public void fileAppend(int id, String b64) {
            Object[] f;
            synchronized (files) {
                f = files.get(id);
            }
            if (f == null) return;
            try {
                ((OutputStream) f[0]).write(Base64.decode(b64, Base64.DEFAULT));
            } catch (Exception e) {
                js("window.forteDash&&forteDash.camError(" + JSONObject.quote(String.valueOf(e.getMessage())) + ")");
            }
        }

        @JavascriptInterface
        public void fileEnd(int id, int keep) {
            try {
                endFile(id, keep);
            } catch (Exception e) {
                js("window.forteDash&&forteDash.camError(" + JSONObject.quote(String.valueOf(e.getMessage())) + ")");
            }
        }
    }
}
