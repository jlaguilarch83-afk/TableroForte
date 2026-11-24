package mx.micasa.reloj;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.IBinder;

import java.util.ArrayDeque;
import java.util.Calendar;

/**
 * Modo dormir (no toca la alarma):
 *  - De 10 pm a 6 am, si el reloj está puesto y no das un paso en 30 min, te dormiste: apaga las luces que quedaron prendidas.
 *  - Si ya dormido te levantas (4 pasos en un minuto), prende el pasillo 5 minutos (se apaga solo).
 */
public class ServicioDormir extends Service implements SensorEventListener {
    static ServicioDormir yo;
    static final long QUIETO = 30 * 60000L;
    SensorManager sm;
    Sensor pasos, cuerpo;
    boolean puesto = true, dormido = false, noche = false;
    long ultimoPaso = 0, ultimaLuz = 0, ultimaRevision = 0;
    final ArrayDeque<Long> recientes = new ArrayDeque<>();

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        yo = this;
        Fondo.canales(this);
        Notification n = new Notification.Builder(this, "fondo")
                .setSmallIcon(R.mipmap.ic_launcher).setContentTitle("Mi Casa · modo dormir").setContentText("Cuida las luces en la noche").setOngoing(true).build();
        try { startForeground(2, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH); }
        catch (Exception e) { stopSelf(); return; }
        sm = getSystemService(SensorManager.class);
        pasos = sm.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR, true);
        if (pasos == null) pasos = sm.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);
        cuerpo = sm.getDefaultSensor(Sensor.TYPE_LOW_LATENCY_OFFBODY_DETECT, true);
        if (cuerpo != null) sm.registerListener(this, cuerpo, SensorManager.SENSOR_DELAY_NORMAL);
        programar();
        if (enNoche()) empezarNoche();
    }

    @Override public int onStartCommand(Intent i, int f, int id) { return START_STICKY; }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (sm != null) sm.unregisterListener(this);
        cancelar("REVISA"); cancelar("INICIO"); cancelar("FIN");
        if (yo == this) yo = null;
    }

    static boolean enNoche() { int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY); return h >= 22 || h < 6; }

    PendingIntent pi(String tipo) {
        return PendingIntent.getBroadcast(this, tipo.hashCode(), new Intent(this, Receptor.class).setAction(Receptor.DORMIR).putExtra("tipo", tipo),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    void alarmaEn(String tipo, long cuando) { getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi(tipo)); }
    void cancelar(String tipo) { try { getSystemService(AlarmManager.class).cancel(pi(tipo)); } catch (Exception ignored) { } }
    static long proxima(int hora) {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, hora); c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0);
        if (c.getTimeInMillis() <= System.currentTimeMillis()) c.add(Calendar.DAY_OF_MONTH, 1);
        return c.getTimeInMillis();
    }
    void programar() { alarmaEn("INICIO", proxima(22)); alarmaEn("FIN", proxima(6)); }

    void empezarNoche() {
        if (noche) return;
        noche = true; dormido = false; ultimoPaso = System.currentTimeMillis();
        if (pasos != null) sm.registerListener(this, pasos, SensorManager.SENSOR_DELAY_NORMAL);
        alarmaEn("REVISA", ultimoPaso + QUIETO);
    }
    void terminarNoche() {
        noche = false; dormido = false;
        if (pasos != null) sm.unregisterListener(this, pasos);
        cancelar("REVISA");
    }

    void alarma(String tipo) {
        if ("INICIO".equals(tipo)) { empezarNoche(); programar(); }
        else if ("FIN".equals(tipo)) { terminarNoche(); programar(); }
        else if ("REVISA".equals(tipo)) {
            if (!noche || dormido) return;
            long quieto = System.currentTimeMillis() - ultimoPaso;
            if (puesto && quieto >= QUIETO - 60000) { dormido = true; mandar("casa?action=dormir", "{\"who\":\"Reloj\"}"); }
            else alarmaEn("REVISA", ultimoPaso + QUIETO);
        }
    }

    void mandar(final String ruta, final String cuerpo) {
        final String pin = Fondo.prefs(this).getString("pin", "");
        new Thread(() -> CasaActivity.http("POST", ruta, cuerpo, pin)).start();
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        long ahora = System.currentTimeMillis();
        if (e.sensor.getType() == Sensor.TYPE_LOW_LATENCY_OFFBODY_DETECT) { puesto = e.values[0] >= 1f; return; }
        if (e.sensor.getType() != Sensor.TYPE_STEP_DETECTOR || !noche) return;
        ultimoPaso = ahora;
        if (dormido) {
            recientes.addLast(ahora);
            while (!recientes.isEmpty() && ahora - recientes.peekFirst() > 60000) recientes.pollFirst();
            if (recientes.size() >= 4 && ahora - ultimaLuz > 10 * 60000) {
                ultimaLuz = ahora; recientes.clear();
                mandar("casa?action=nocheluz", "{\"who\":\"Reloj\"}");
            }
        } else if (ahora - ultimaRevision > 60000) {
            ultimaRevision = ahora;
            alarmaEn("REVISA", ahora + QUIETO);
        }
    }

    @Override public void onAccuracyChanged(Sensor s, int a) { }
}
