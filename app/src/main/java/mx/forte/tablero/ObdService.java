package mx.forte.tablero;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.speech.tts.TextToSpeech;

import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Mantiene la conexión con el ELM327 aunque la pantalla esté apagada o se use Android Auto.
 * Reparte los datos a quien escuche (la app y la pantalla del auto) y habla las alertas.
 */
public class ObdService extends Service {

    public interface Listener {
        void onData(JSONObject data);
        void onStatus(String text, String kind);
        void onCodes(List<String> codes);
        void onCleared(boolean ok);
    }

    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String CHANNEL = "conexion";
    private static final int NOTIF = 1;

    static final List<Listener> listeners = new CopyOnWriteArrayList<>();
    static volatile ObdService instance;

    // último estado conocido, para quien se conecte después
    static volatile String statusText = "Sin conectar · toca aquí";
    static volatile String statusKind = "off";
    static final Map<String, Double> last = new HashMap<>();
    static volatile String alertText = null;
    static volatile long alertAt = 0;

    private BluetoothAdapter adapter;
    private volatile BluetoothSocket socket;
    private volatile boolean running = false;
    private volatile boolean wantCodes = false, wantClear = false;
    private volatile String connectedTo = null;
    private volatile boolean isCan = true;
    private Thread worker;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private SharedPreferences sp;

    // ---------- arranque desde fuera ----------

    static void connect(Context c, String address) {
        prefs(c).edit().putString("obd_addr", address).apply();
        Intent i = new Intent(c, ObdService.class).putExtra("addr", address);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    static void disconnect(Context c) {
        ObdService s = instance;
        if (s != null) s.shutdown();
        setStatus("Desconectado", "off");
    }

    static String savedAddress(Context c) {
        return prefs(c).getString("obd_addr", null);
    }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("forte", MODE_PRIVATE);
    }

    static boolean isConnected() {
        ObdService s = instance;
        return s != null && s.connectedTo != null;
    }

    static void requestCodes() {
        ObdService s = instance;
        if (s != null && s.connectedTo != null) s.wantCodes = true;
        else for (Listener l : listeners) l.onCodes(null);
    }

    static void requestClear() {
        ObdService s = instance;
        if (s != null && s.connectedTo != null) s.wantClear = true;
        else for (Listener l : listeners) l.onCleared(false);
    }

    static void speakNow(String text) {
        ObdService s = instance;
        if (s != null) s.speak(text);
    }

    private static void setStatus(String text, String kind) {
        statusText = text;
        statusKind = kind;
        for (Listener l : listeners) l.onStatus(text, kind);
        ObdService s = instance;
        if (s != null) s.sendWear(true);
    }

    // ---------- reloj (Wear OS) ----------

    private long lastWear = 0;

    /** Manda los datos al reloj. Si no hay reloj con la app, no pasa nada. */
    void sendWear(boolean force) {
        long now = System.currentTimeMillis();
        if (!force && now - lastWear < 1500) return;
        lastWear = now;
        try {
            PutDataMapRequest r = PutDataMapRequest.create("/forte/datos");
            DataMap m = r.getDataMap();
            synchronized (last) {
                for (Map.Entry<String, Double> e : last.entrySet()) m.putDouble(e.getKey(), e.getValue());
            }
            m.putString("estado", statusText);
            m.putString("tipo", statusKind);
            m.putBoolean("conectado", connectedTo != null);
            m.putLong("t", now);
            m.putDouble("trip", tripKm);
            m.putDouble("oil_km", sp.getFloat("oil_km", 0));
            m.putDouble("oil_int", sp.getInt("oil_int", 5000));
            Wearable.getDataClient(this).putDataItem(r.asPutDataRequest().setUrgent());
        } catch (Exception ignored) {
        }
    }

    private void sendWearAlert(final String text) {
        try {
            Wearable.getNodeClient(this).getConnectedNodes().addOnSuccessListener(nodes -> {
                for (Node n : nodes) {
                    Wearable.getMessageClient(this).sendMessage(n.getId(), "/forte/alerta", text.getBytes(StandardCharsets.UTF_8));
                }
            });
        } catch (Exception ignored) {
        }
    }

    // ---------- ciclo de vida ----------

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        sp = prefs(this);
        BluetoothManager bm = (BluetoothManager) getSystemService(BLUETOOTH_SERVICE);
        adapter = bm != null ? bm.getAdapter() : null;
        tts = new TextToSpeech(this, st -> {
            if (st == TextToSpeech.SUCCESS) {
                tts.setLanguage(new Locale("es", "MX"));
                ttsReady = true;
            }
        });
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null && Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Conexión con el auto", NotificationManager.IMPORTANCE_LOW));
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = notification("Conectando con el auto…");
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
        else startForeground(NOTIF, n);
        String addr = intent != null ? intent.getStringExtra("addr") : null;
        if (addr == null) addr = savedAddress(this);
        if (addr == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startWorker(addr);
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        running = false;
        closeSocket();
        if (worker != null) worker.interrupt();
        if (tts != null) tts.shutdown();
        instance = null;
        super.onDestroy();
    }

    private void shutdown() {
        running = false;
        connectedTo = null;
        closeSocket();
        if (worker != null) worker.interrupt();
        stopForeground(true);
        stopSelf();
    }

    private Notification notification(String text) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return b.setContentTitle("Tablero Forte")
                .setContentText(text)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
    }

    private long lastNotif = 0;

    private void updateNotification(String text) {
        long now = System.currentTimeMillis();
        if (now - lastNotif < 10000) return;
        lastNotif = now;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF, notification(text));
    }

    private void speak(String text) {
        if (ttsReady && text != null) tts.speak(text, TextToSpeech.QUEUE_ADD, null, "forte" + System.nanoTime());
    }

    // ---------- conexión ----------

    private synchronized void startWorker(final String address) {
        running = false;
        closeSocket();
        if (worker != null) worker.interrupt();
        running = true;
        worker = new Thread(() -> loop(address), "obd");
        worker.start();
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
                setStatus("Conectando…", "busy");
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

                setStatus("Iniciando ELM327…", "busy");
                send(in, out, "ATZ", 3000);
                for (String c : new String[]{"ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSP0"}) send(in, out, c, 1500);
                String probe = clean(send(in, out, "0100", 10000));
                if (!probe.contains("4100")) {
                    // Auto apagado: el ELM sigue leyendo el voltaje de la batería.
                    Double v = voltage(in, out);
                    if (v != null) {
                        emit(json("volt", v));
                        battery("reposo", v);
                        setStatus("Auto apagado · batería " + String.format(Locale.US, "%.1f", v) + " V", "busy");
                        updateNotification("Auto apagado · batería " + String.format(Locale.US, "%.1f", v) + " V");
                        if (v < 12.2) alert("bat_off", "Batería baja con el motor apagado: " + fmt1(v) + " voltios", 600);
                    } else {
                        setStatus("El auto no responde. Pon la llave en ON", "err");
                    }
                    closeSocket();
                    sleep(15000);
                    continue;
                }
                String dp = clean(send(in, out, "ATDPN", 1500));
                if (dp.length() == 2 && dp.charAt(0) == 'A') dp = dp.substring(1);
                isCan = dp.isEmpty() || "6789ABC".indexOf(dp.charAt(0)) >= 0;
                connectedTo = address;
                setStatus("OBD conectado", "ok");
                avisoAceiteAlConectar();
                poll(in, out);
            } catch (Exception e) {
                connectedTo = null;
                closeSocket();
                if (!running) break;
                String msg = e.getMessage() == null ? "error" : e.getMessage();
                setStatus("Sin conexión: " + msg + ". Reintentando…", "err");
                if (!sleep(4000)) break;
            }
        }
    }

    private boolean sleep(long ms) {
        try {
            Thread.sleep(ms);
            return true;
        } catch (InterruptedException e) {
            return false;
        }
    }

    private Double voltage(InputStream in, OutputStream out) throws Exception {
        String r = clean(send(in, out, "ATRV", 1200));
        try {
            double v = Double.parseDouble(r.replace("V", ""));
            return v > 5 && v < 20 ? v : null;
        } catch (Exception e) {
            return null;
        }
    }

    // ---------- lectura en ciclo ----------

    private double tripKmSinceSave = 0;
    static double tripKm = 0;
    private long lastLoop = 0;
    private Double prevRpm = null;
    private double crankMin = 99;
    // prueba de batería al arrancar
    private Double restV = null, testCrank = null, testRest = null;
    private long testAt = 0;
    private long engineOnSince = 0;
    private boolean runningLogged = false;

    private void poll(InputStream in, OutputStream out) throws Exception {
        String[] fast = {"0C", "0D", "04", "11"};
        // lentos, por turnos; los que el auto no reporta se saltan solos después de 3 intentos
        String[] slow = {"FUEL", "05", "0F", "2F", "46", "0E", "1F", "33", "06", "07", "5C", "0A", "42"};
        Map<String, Integer> fails = new HashMap<>();
        boolean mafOk = true;
        Double rpm = null, iat = null;
        int turn = 0;
        lastLoop = System.currentTimeMillis();

        while (running) {
            JSONObject o = new JSONObject();
            List<String> todo = new ArrayList<>();
            // con el motor apagado o arrancando se mide la batería seguido
            boolean engineOff = rpm == null || rpm < 400;
            if (engineOff && turn % 4 != 0) {
                // solo revoluciones y voltaje, rápido, para alcanzar a ver cuánto baja al dar marcha
                todo.add("0C");
            } else {
                for (String p : fast) todo.add(p);
                todo.add(slow[turn % slow.length]);
            }
            if (engineOff || turn % 3 == 0) todo.add("RV");
            turn++;

            for (String p : todo) {
                if (p.equals("RV")) {
                    Double v = voltage(in, out);
                    if (v != null) o.put("volt", v);
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
                    case "0E": o.put("timing", a / 2.0 - 64); break;                 // avance de encendido °
                    case "1F": o.put("runtime", a * 256 + b); break;                 // segundos desde que arrancó
                    case "33": o.put("baro", a); break;                              // presión atmosférica kPa
                    case "06": o.put("stft", (a - 128) * 100.0 / 128); break;        // ajuste de combustible corto %
                    case "07": o.put("ltft", (a - 128) * 100.0 / 128); break;        // ajuste de combustible largo %
                    case "5C": o.put("oil", a - 40); break;                          // temperatura del aceite °C
                    case "0A": o.put("fuelpress", a * 3); break;                     // presión de combustible kPa
                    case "42": o.put("ecuvolt", (a * 256 + b) / 1000.0); break;      // voltaje en la computadora
                    case "0B": {
                        // Sin sensor MAF: aire calculado con la presión del múltiple. Motor 2.0 L, eficiencia ~85 %.
                        double r = rpm == null ? 750 : rpm;
                        double tK = (iat == null ? 30 : iat) + 273.15;
                        o.put("maf", (r * a / tK) / 120.0 * 0.85 * 2.0 * 28.97 / 8.314);
                        break;
                    }
                    default: break;
                }
            }
            if (o.length() > 0) emit(o);
            check();

            if (wantClear) {
                wantClear = false;
                boolean ok = clean(send(in, out, "04", 5000)).contains("44");
                for (Listener l : listeners) l.onCleared(ok);
            }
            if (wantCodes) {
                wantCodes = false;
                List<String> codes = parseDtc(send(in, out, "03", 5000), isCan);
                for (Listener l : listeners) l.onCodes(codes);
            }
        }
    }

    private void emit(JSONObject o) {
        try {
            JSONArray names = o.names();
            if (names != null) {
                synchronized (last) {
                    for (int i = 0; i < names.length(); i++) {
                        String k = names.getString(i);
                        last.put(k, o.getDouble(k));
                    }
                }
            }
        } catch (Exception ignored) {
        }
        for (Listener l : listeners) l.onData(o);
    }

    static Double get(String k) {
        synchronized (last) {
            return last.get(k);
        }
    }

    private static JSONObject json(String k, double v) {
        JSONObject o = new JSONObject();
        try {
            o.put(k, v);
        } catch (Exception ignored) {
        }
        return o;
    }

    // ---------- alertas y batería ----------

    private final Map<String, Long> lastAlert = new HashMap<>();
    private double overSince = 0;
    private boolean gasWarned = false;
    private long idleSince = 0;
    private boolean idleWarned = false;

    private boolean alert(String id, String text, int everySec) {
        long now = System.currentTimeMillis();
        Long t = lastAlert.get(id);
        if (t != null && now - t < everySec * 1000L) return false;
        lastAlert.put(id, now);
        alertText = text;
        alertAt = now;
        sendWearAlert(text);
        if (sp.getBoolean("voz", true)) speak(text);
        return true;
    }

    private void check() {
        long now = System.currentTimeMillis();
        double dt = Math.min(2, (now - lastLoop) / 1000.0);
        lastLoop = now;
        Double speed = get("speed"), rpm = get("rpm"), fuel = get("fuel"), cool = get("coolant"), volt = get("volt");

        // kilómetros para el aceite
        if (speed != null) {
            tripKmSinceSave += speed * dt / 3600.0;
            tripKm += speed * dt / 3600.0;
            if (tripKmSinceSave > 0.5) {
                float km = sp.getFloat("oil_km", 0) + (float) tripKmSinceSave;
                sp.edit().putFloat("oil_km", km).apply();
                tripKmSinceSave = 0;
            }
        }

        // velocidad
        int limite = sp.getInt("limite", 0), limiteTxt = sp.getInt("limite_txt", limite);
        if (limite > 0 && speed != null && speed > limite) {
            overSince += dt;
            if (overSince > 1) alert("vel", "Vas a " + Math.round(speed) + ", el límite es " + limiteTxt, 15);
        } else overSince = 0;

        // gasolina
        int gasAviso = sp.getInt("gas_aviso", 15);
        if (fuel != null) {
            if (fuel < gasAviso && !gasWarned) {
                gasWarned = true;
                alert("gas", "Queda poca gasolina: " + Math.round(fuel) + " por ciento", 0);
            }
            if (fuel > gasAviso + 5) gasWarned = false;
        }

        // temperatura
        if (cool != null && cool >= 108) alert("cal", "Temperatura del motor alta: " + Math.round(cool) + " grados", 60);

        // motor encendido sin moverse
        int idleMin = sp.getInt("estacionado_min", 5);
        if (rpm != null && rpm > 300 && speed != null && speed < 1) {
            if (idleSince == 0) idleSince = now;
            if (!idleWarned && now - idleSince > idleMin * 60000L) {
                idleWarned = true;
                alert("idle", "El auto lleva " + idleMin + " minutos encendido sin moverse", 0);
            }
        } else {
            idleSince = 0;
            idleWarned = false;
        }

        // batería: caída al arrancar, carga del alternador y reposo
        if (volt != null && rpm != null) {
            boolean on = rpm >= 400;
            if (!on) {
                crankMin = Math.min(crankMin, volt);
                if (rpm < 100 && volt > 10.5) restV = volt;
                engineOnSince = 0;
                runningLogged = false;
                if (rpm < 100 && volt < 11.9) alert("bat_off", "Batería baja con el motor apagado: " + fmt1(volt) + " voltios", 600);
            } else {
                if (prevRpm != null && prevRpm < 400 && crankMin < 99) {
                    battery("arranque", crankMin);
                    // la prueba se termina cuando el alternador ya está cargando
                    testRest = restV;
                    testCrank = restV != null && crankMin < restV - 0.4 ? crankMin : (restV == null ? crankMin : null);
                    testAt = now;
                }
                crankMin = 99;
                if (engineOnSince == 0) engineOnSince = now;
                long onFor = now - engineOnSince;
                if (testAt > 0 && now - testAt > 20000) {
                    pruebaBateria(testCrank, testRest, volt);
                    testAt = 0;
                }
                if (!runningLogged && onFor > 60000) {
                    runningLogged = true;
                    battery("carga", volt);
                }
                // Kia regula el alternador y puede bajar a ~12.5 V; abajo de 12.4 por varios minutos no está cargando
                if (onFor > 120000 && volt < 12.4) alert("bat_alt", "El alternador no está cargando la batería: " + fmt1(volt) + " voltios", 900);
            }
            prevRpm = rpm;
        }

        // notificación con lo más importante
        sendWear(false);
        updateNotification((speed != null ? Math.round(speed) + " km/h · " : "") + (volt != null ? "batería " + fmt1(volt) + " V" : "conectado"));
    }

    private void avisoAceiteAlConectar() {
        float km = sp.getFloat("oil_km", 0);
        int intervalo = sp.getInt("oil_int", 5000);
        double pct = 100 - km / intervalo * 100;
        String hoy = new java.text.SimpleDateFormat("yyyyMMdd", Locale.US).format(new java.util.Date());
        if (pct <= 10 && !hoy.equals(sp.getString("oil_aviso", ""))) {
            sp.edit().putString("oil_aviso", hoy).apply();
            alert("oil", pct <= 0 ? "Ya toca cambio de aceite" : "Faltan " + Math.round(Math.max(0, intervalo - km)) + " kilómetros para el cambio de aceite", 0);
        }
    }

    /**
     * Prueba de batería al dar marcha: qué tanto bajó el voltaje (lo más confiable),
     * o si no se alcanzó a medir, el voltaje antes de arrancar. Luego revisa que cargue.
     * 0 = bien, 1 = regular, 2 = fallando.
     */
    private void pruebaBateria(Double crank, Double rest, double carga) {
        int nivel;
        String det;
        if (crank != null) {
            nivel = crank >= 10.2 ? 0 : crank >= 9.6 ? 1 : 2;
            det = "Bajó a " + fmt1(crank) + " voltios al arrancar";
        } else if (rest != null) {
            nivel = rest >= 12.4 ? 0 : rest >= 12.1 ? 1 : 2;
            det = "Tenía " + fmt1(rest) + " voltios antes de arrancar";
        } else return;
        boolean cargaBaja = carga < 12.6;
        if (cargaBaja) nivel = Math.max(nivel, 1);
        det += cargaBaja ? " y el alternador apenas carga a " + fmt1(carga) : " y carga a " + fmt1(carga);
        String[] palabra = {"bien", "regular", "está fallando"};
        String texto = "Prueba de batería: " + palabra[nivel] + ". " + det + "." + (nivel == 2 ? " Revísala pronto." : nivel == 1 ? " Vigílala." : "");
        try {
            JSONObject extra = new JSONObject();
            extra.put("estado", nivel);
            extra.put("carga", Math.round(carga * 100) / 100.0);
            if (rest != null) extra.put("reposo", Math.round(rest * 100) / 100.0);
            extra.put("medido", crank != null ? "arranque" : "reposo");
            extra.put("texto", texto);
            battery("prueba", crank != null ? crank : rest, extra);
        } catch (Exception ignored) {
        }
        if (nivel > 0 || sp.getBoolean("bat_siempre", true)) alert("bat_test", texto, 0);
    }

    private void battery(String tipo, double v) {
        battery(tipo, v, null);
    }

    /** Guarda un registro de batería: reposo, arranque (voltaje mínimo), carga (motor encendido) o prueba. */
    private void battery(String tipo, double v, JSONObject extra) {
        try {
            JSONArray a = new JSONArray(sp.getString("bat_log", "[]"));
            if (a.length() > 0) {
                JSONObject lastE = a.getJSONObject(a.length() - 1);
                if (tipo.equals(lastE.getString("tipo")) && System.currentTimeMillis() - lastE.getLong("t") < 20 * 60000L) return;
            }
            JSONObject e = new JSONObject();
            e.put("t", System.currentTimeMillis());
            e.put("tipo", tipo);
            e.put("v", Math.round(v * 100) / 100.0);
            if (extra != null) {
                JSONArray ks = extra.names();
                for (int i = 0; ks != null && i < ks.length(); i++) e.put(ks.getString(i), extra.get(ks.getString(i)));
            }
            a.put(e);
            JSONArray out = new JSONArray();
            for (int i = Math.max(0, a.length() - 60); i < a.length(); i++) out.put(a.get(i));
            sp.edit().putString("bat_log", out.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    private static String fmt1(double v) {
        return String.format(Locale.US, "%.1f", v);
    }

    // ---------- protocolo ELM327 ----------

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
            if (l.matches("^[0-9A-F]:.*")) l = l.substring(2);
            else if (l.matches("^[0-9A-F]{3}$")) continue;
            if (!l.matches("^[0-9A-F]+$")) continue;
            lines.add(l);
        }
        List<String> chunks = new ArrayList<>();
        if (can) {
            String d = String.join("", lines);
            int k = d.indexOf("43");
            if (k < 0 || d.length() < k + 4) return new ArrayList<>();
            int n = Integer.parseInt(d.substring(k + 2, k + 4), 16);
            d = d.substring(k + 4);
            for (int i = 0; i < n && (i + 1) * 4 <= d.length(); i++) chunks.add(d.substring(i * 4, i * 4 + 4));
        } else {
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
