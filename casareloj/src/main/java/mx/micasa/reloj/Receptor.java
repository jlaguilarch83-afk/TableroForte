package mx.micasa.reloj;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

/** Recibe: cercanía a la casa, botones de la notificación, alarmas del modo dormir y el arranque del reloj. */
public class Receptor extends BroadcastReceiver {
    static final String CERCA = "mx.micasa.reloj.CERCA", PORTON = "mx.micasa.reloj.PORTON", LLEGANDO = "mx.micasa.reloj.LLEGANDO", DORMIR = "mx.micasa.reloj.DORMIR";

    @Override
    public void onReceive(Context c, Intent i) {
        String a = i.getAction();
        if (a == null) return;
        if (a.equals(DORMIR)) { if (ServicioDormir.yo != null) ServicioDormir.yo.alarma(i.getStringExtra("tipo")); return; }
        if (a.equals(CERCA)) {
            if (!i.getBooleanExtra(LocationManager.KEY_PROXIMITY_ENTERING, false)) return;
            android.content.SharedPreferences p = Fondo.prefs(c);
            long ahora = System.currentTimeMillis();
            if (ahora - p.getLong("llegada_aviso", 0) < 20 * 60000) return;     // ya avisó hace poco
            p.edit().putLong("llegada_aviso", ahora).apply();
            avisarLlegada(c);
            return;
        }
        if (a.equals(PORTON) || a.equals(LLEGANDO)) {
            c.getSystemService(NotificationManager.class).cancel(10);
            final PendingResult pr = goAsync();
            final String pin = Fondo.prefs(c).getString("pin", "");
            final boolean porton = a.equals(PORTON);
            new Thread(() -> {
                CasaActivity.Resp r = porton
                        ? CasaActivity.http("POST", "casa?action=set", "{\"zone\":\"porton\",\"on\":true,\"who\":\"Reloj · llegando\"}", pin)
                        : CasaActivity.http("POST", "casa?action=llegando", "{\"who\":\"Reloj · llegando\"}", pin);
                boolean ok = r.json != null && r.json.optBoolean("ok");
                try { c.getSystemService(Vibrator.class).vibrate(VibrationEffect.createWaveform(ok ? new long[]{0, 40, 80, 40} : new long[]{0, 500}, -1)); } catch (Exception ignored) { }
                pr.finish();
            }).start();
        }
    }

    static void avisarLlegada(Context c) {
        Fondo.canales(c);
        PendingIntent abrir = PendingIntent.getBroadcast(c, 2, new Intent(c, Receptor.class).setAction(PORTON), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent lleg = PendingIntent.getBroadcast(c, 3, new Intent(c, Receptor.class).setAction(LLEGANDO), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent app = PendingIntent.getActivity(c, 4, new Intent(c, CasaActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, "llegada")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Ya casi llegas 🏠")
                .setContentText("¿Abro el portón?")
                .setCategory(Notification.CATEGORY_CALL)
                .setContentIntent(app)
                .setFullScreenIntent(app, true)
                .setAutoCancel(true)
                .setTimeoutAfter(10 * 60000)
                .addAction(new Notification.Action.Builder(null, "Abrir portón", abrir).build())
                .addAction(new Notification.Action.Builder(null, "Llegando (portón + luces)", lleg).build())
                .build();
        c.getSystemService(NotificationManager.class).notify(10, n);
    }
}
