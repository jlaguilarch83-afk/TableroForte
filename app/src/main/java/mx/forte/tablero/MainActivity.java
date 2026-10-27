package mx.forte.tablero;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Tablero Forte: muestra el tablero HTML (assets/index.html) en pantalla completa
 * y lee el auto por Bluetooth clásico con un adaptador ELM327.
 *
 * Puente con la página (window.OBD):
 *   OBD.state()          -> "ok" | "off" | "noperm" | "nobt"
 *   OBD.devices()        -> JSON con los dispositivos emparejados
 *   OBD.connect(mac)     -> conecta y empieza a leer
 *   OBD.disconnect()
 *   OBD.readCodes()      -> lee códigos de falla (modo 03)
 *   OBD.askPermission()
 * La app llama de regreso a forteDash.setData({...}), forteDash.status(texto, tipo)
 * y forteDash.codes([...]).
 */
public class MainActivity extends Activity {

    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int REQ_BT = 7;

    private WebView web;
    private BluetoothAdapter adapter;
    private volatile BluetoothSocket socket;
    private volatile boolean running = false;
    private volatile boolean wantCodes = false;
    private volatile String connectedTo = null;
    private volatile boolean isCan = true;
    private Thread worker;

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
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.addJavascriptInterface(new Bridge(), "OBD");
        setContentView(web);

        BluetoothManager bm = (BluetoothManager) getSystemService(BLUETOOTH_SERVICE);
        adapter = bm != null ? bm.getAdapter() : null;
        if (!hasPermission() && Build.VERSION.SDK_INT >= 31) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, REQ_BT);
        }
        web.loadUrl("file:///android_asset/index.html");
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
        stopWorker();
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

    private boolean hasPermission() {
        return Build.VERSION.SDK_INT < 31
                || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    public class Bridge {
        @JavascriptInterface
        public String state() {
            if (adapter == null) return "nobt";
            if (!hasPermission()) return "noperm";
            if (!adapter.isEnabled()) return "off";
            return "ok";
        }

        @SuppressLint("MissingPermission")
        @JavascriptInterface
        public String devices() {
            JSONArray arr = new JSONArray();
            try {
                if (adapter == null || !hasPermission()) return arr.toString();
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
        public void connect(String address) {
            startWorker(address);
        }

        @JavascriptInterface
        public void disconnect() {
            stopWorker();
            status("Desconectado", "off");
        }

        @JavascriptInterface
        public void readCodes() {
            if (connectedTo == null) {
                status("Conecta el OBD para leer fallas", "off");
                js("window.forteDash&&forteDash.codes(null)");
                return;
            }
            wantCodes = true;
        }
    }

    // ---------- Hilo de lectura ----------

    private synchronized void startWorker(final String address) {
        stopWorker();
        running = true;
        worker = new Thread(() -> loop(address), "obd");
        worker.start();
    }

    private synchronized void stopWorker() {
        running = false;
        connectedTo = null;
        closeSocket();
        if (worker != null) worker.interrupt();
        worker = null;
    }

    private void closeSocket() {
        try {
            if (socket != null) socket.close();
        } catch (Exception ignored) {
        }
        socket = null;
    }

    @SuppressLint("MissingPermission")
    private void loop(String address) {
        while (running) {
            try {
                if (adapter == null || !adapter.isEnabled()) throw new Exception("Bluetooth apagado");
                status("Conectando…", "busy");
                BluetoothDevice dev = adapter.getRemoteDevice(address);
                try {
                    adapter.cancelDiscovery();
                } catch (Exception ignored) {
                }
                BluetoothSocket s;
                try {
                    s = dev.createRfcommSocketToServiceRecord(SPP);
                    s.connect();
                } catch (Exception first) {
                    try {
                        s = dev.createInsecureRfcommSocketToServiceRecord(SPP);
                        s.connect();
                    } catch (Exception second) {
                        throw new Exception("el adaptador no responde");
                    }
                }
                socket = s;
                InputStream in = s.getInputStream();
                OutputStream out = s.getOutputStream();

                status("Iniciando ELM327…", "busy");
                send(in, out, "ATZ", 3000);
                for (String c : new String[]{"ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSP0"}) {
                    send(in, out, c, 1500);
                }
                // La primera consulta hace que el ELM busque el protocolo del auto.
                String probe = clean(send(in, out, "0100", 10000));
                if (!probe.contains("4100")) {
                    throw new Exception("el auto no responde, ¿está en ON?");
                }
                String dp = clean(send(in, out, "ATDPN", 1500));
                if (dp.length() == 2 && dp.charAt(0) == 'A') dp = dp.substring(1);
                isCan = dp.isEmpty() || "6789ABC".indexOf(dp.charAt(0)) >= 0;
                connectedTo = address;
                status("OBD conectado", "ok");
                poll(in, out);
            } catch (Exception e) {
                connectedTo = null;
                closeSocket();
                if (!running) break;
                String msg = e.getMessage() == null ? "error" : e.getMessage();
                status("Sin conexión: " + msg + ". Reintentando…", "err");
                try {
                    Thread.sleep(4000);
                } catch (InterruptedException ie) {
                    break;
                }
            }
        }
    }

    /** Lee los datos en ciclo: rpm y velocidad siempre, el resto por turnos. */
    private void poll(InputStream in, OutputStream out) throws Exception {
        String[] fast = {"0C", "0D", "04", "11"};
        String[] slow = {"FUEL", "05", "0F", "2F", "46", "RV"};
        Map<String, Integer> fails = new HashMap<>();
        boolean mafOk = true;
        Double rpm = null, iat = null;
        int turn = 0;

        while (running) {
            JSONObject o = new JSONObject();
            List<String> todo = new ArrayList<>();
            for (String p : fast) todo.add(p);
            todo.add(slow[turn % slow.length]);
            turn++;

            for (String p : todo) {
                if (p.equals("RV")) {
                    String r = clean(send(in, out, "ATRV", 1200));
                    try {
                        o.put("volt", Double.parseDouble(r.replace("V", "")));
                    } catch (Exception ignored) {
                    }
                    continue;
                }
                if (p.equals("FUEL")) p = mafOk ? "10" : "0B";
                Integer f = fails.get(p);
                if (f != null && f >= 3) {
                    if (p.equals("10")) mafOk = false;
                    continue;
                }
                int[] ab = pid(in, out, p);
                if (ab == null) {
                    fails.put(p, f == null ? 1 : f + 1);
                    continue;
                }
                fails.put(p, 0);
                int a = ab[0], b = ab[1];
                switch (p) {
                    case "0C": rpm = (a * 256 + b) / 4.0; o.put("rpm", rpm); break;
                    case "0D": o.put("speed", a); break;
                    case "04": o.put("load", a * 100.0 / 255); break;
                    case "11": o.put("throttle", a * 100.0 / 255); break;
                    case "05": o.put("coolant", a - 40); break;
                    case "0F": iat = (double) (a - 40); o.put("intake", a - 40); break;
                    case "2F": o.put("fuel", a * 100.0 / 255); break;
                    case "46": o.put("ambient", a - 40); break;
                    case "10": o.put("maf", (a * 256 + b) / 100.0); break;
                    case "0B": {
                        // Sin sensor MAF: se calcula el aire con la presión del múltiple (MAP).
                        // Motor 2.0 L, eficiencia volumétrica ~85 %.
                        double r = rpm == null ? 750 : rpm;
                        double tK = (iat == null ? 30 : iat) + 273.15;
                        double maf = (r * a / tK) / 120.0 * 0.85 * 2.0 * 28.97 / 8.314;
                        o.put("maf", maf);
                        break;
                    }
                    default: break;
                }
            }
            if (o.length() > 0) js("window.forteDash&&forteDash.setData(" + o + ")");

            if (wantCodes) {
                wantCodes = false;
                String raw = send(in, out, "03", 5000);
                JSONArray codes = new JSONArray();
                for (String c : parseDtc(raw, isCan)) codes.put(c);
                js("window.forteDash&&forteDash.codes(" + codes + ")");
            }
        }
    }

    /** Pide un PID del modo 01 y regresa los bytes A y B, o null si no hay respuesta. */
    private int[] pid(InputStream in, OutputStream out, String p) throws Exception {
        String r = clean(send(in, out, "01" + p, 1500));
        int k = r.indexOf("41" + p);
        if (k < 0 || r.length() < k + 6) return null;
        try {
            int a = Integer.parseInt(r.substring(k + 4, k + 6), 16);
            int b = 0;
            if (r.length() >= k + 8) {
                try {
                    b = Integer.parseInt(r.substring(k + 6, k + 8), 16);
                } catch (NumberFormatException ignored) {
                }
            }
            return new int[]{a, b};
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** Envía un comando y lee hasta el prompt '>' del ELM327. */
    private String send(InputStream in, OutputStream out, String cmd, long timeoutMs) throws Exception {
        while (in.available() > 0) in.read();
        out.write((cmd + "\r").getBytes("US-ASCII"));
        out.flush();
        StringBuilder sb = new StringBuilder();
        long end = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < end) {
            if (!running) throw new Exception("detenido");
            if (in.available() > 0) {
                int ch = in.read();
                if (ch < 0) throw new Exception("se cortó la conexión");
                if (ch == '>') break;
                sb.append((char) ch);
            } else {
                Thread.sleep(4);
            }
        }
        return sb.toString();
    }

    static String clean(String s) {
        return s.replace("SEARCHING...", "").replaceAll("\\s", "").toUpperCase();
    }

    /** Convierte la respuesta del modo 03 en códigos tipo P0420. */
    static List<String> parseDtc(String raw, boolean can) {
        List<String> lines = new ArrayList<>();
        for (String line : raw.replace("SEARCHING...", "").split("[\\r\\n]+")) {
            String l = line.replaceAll("\\s", "").toUpperCase();
            if (l.isEmpty()) continue;
            if (l.matches("^[0-9A-F]:.*")) l = l.substring(2);          // tramas CAN numeradas
            else if (l.matches("^[0-9A-F]{3}$")) continue;               // largo total del mensaje
            if (!l.matches("^[0-9A-F]+$")) continue;                     // NO DATA, errores
            lines.add(l);
        }
        List<String> chunks = new ArrayList<>();
        if (can) {
            // CAN: 43, luego la cantidad de códigos, luego 2 bytes por código.
            String d = String.join("", lines);
            int k = d.indexOf("43");
            if (k < 0 || d.length() < k + 4) return new ArrayList<>();
            int n = Integer.parseInt(d.substring(k + 2, k + 4), 16);
            d = d.substring(k + 4);
            for (int i = 0; i < n && (i + 1) * 4 <= d.length(); i++) chunks.add(d.substring(i * 4, i * 4 + 4));
        } else {
            // Protocolos viejos: cada línea empieza con 43 y trae hasta 3 códigos.
            for (String l : lines) {
                if (!l.startsWith("43")) continue;
                String d = l.substring(2);
                for (int i = 0; i + 4 <= d.length(); i += 4) chunks.add(d.substring(i, i + 4));
            }
        }
        List<String> out = new ArrayList<>();
        for (String c : chunks) {
            if (c.equals("0000")) continue;
            int first = Integer.parseInt(c.substring(0, 1), 16);
            String code = "" + "PCBU".charAt(first >> 2) + (first & 3) + c.substring(1);
            if (!out.contains(code)) out.add(code);
        }
        return out;
    }
}
