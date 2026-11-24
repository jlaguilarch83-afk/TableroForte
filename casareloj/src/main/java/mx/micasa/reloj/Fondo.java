package mx.micasa.reloj;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.CancellationSignal;

import java.util.concurrent.Executors;
import java.util.function.Consumer;

/** Lo que el reloj hace aunque la app esté cerrada: aviso al llegar a la casa (GPS) y modo dormir. */
public class Fondo {

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("micasa", Context.MODE_PRIVATE); }

    static boolean tiene(Context c, String p) { return c.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }

    static void canales(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel ll = new NotificationChannel("llegada", "Llegando a casa", NotificationManager.IMPORTANCE_HIGH);
        ll.enableVibration(true); ll.setVibrationPattern(new long[]{0, 300, 150, 300, 150, 600});
        nm.createNotificationChannel(ll);
        NotificationChannel f = new NotificationChannel("fondo", "Mi Casa trabajando", NotificationManager.IMPORTANCE_MIN);
        f.setShowBadge(false);
        nm.createNotificationChannel(f);
        NotificationChannel d = new NotificationChannel("dormir", "Modo dormir", NotificationManager.IMPORTANCE_LOW);
        nm.createNotificationChannel(d);
    }

    /** Prende o apaga lo de fondo según lo que esté escogido en "Funciones del reloj". */
    static void aplicar(Context c) {
        canales(c);
        SharedPreferences p = prefs(c);
        // Aviso al llegar: alerta de cercanía que vigila el propio reloj (sin app abierta)
        LocationManager lm = c.getSystemService(LocationManager.class);
        PendingIntent pi = PendingIntent.getBroadcast(c, 1, new Intent(c, Receptor.class).setAction(Receptor.CERCA),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        try { lm.removeProximityAlert(pi); } catch (Exception ignored) { }
        if (p.getBoolean("f_llegada", false) && p.contains("casa_lat") && tiene(c, android.Manifest.permission.ACCESS_FINE_LOCATION)) {
            try { lm.addProximityAlert(p.getFloat("casa_lat", 0), p.getFloat("casa_lon", 0), 250f, -1, pi); } catch (Exception ignored) { }
        }
        // Modo dormir: servicio que cuenta pasos de noche
        Intent s = new Intent(c, ServicioDormir.class);
        if (p.getBoolean("f_dormir", false) && tiene(c, android.Manifest.permission.ACTIVITY_RECOGNITION)) {
            try { c.startForegroundService(s); } catch (Exception ignored) { }
        } else {
            try { c.stopService(s); } catch (Exception ignored) { }
        }
    }

    /** Ubicación de ahorita (o la última conocida). */
    static void ubicacion(Context c, Consumer<Location> listo) {
        LocationManager lm = c.getSystemService(LocationManager.class);
        Location mejor = null;
        try {
            for (String pr : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(pr);
                if (l != null && (mejor == null || l.getTime() > mejor.getTime())) mejor = l;
            }
        } catch (SecurityException ignored) { }
        final Location ultima = mejor;
        String pr = null;
        try {
            java.util.List<String> ps = lm.getProviders(true);
            if (ps.contains("fused")) pr = "fused"; else if (ps.contains(LocationManager.GPS_PROVIDER)) pr = LocationManager.GPS_PROVIDER;
            else if (ps.contains(LocationManager.NETWORK_PROVIDER)) pr = LocationManager.NETWORK_PROVIDER;
        } catch (Exception ignored) { }
        if (pr == null) { listo.accept(ultima); return; }
        final boolean[] hecho = {false};
        CancellationSignal cs = new CancellationSignal();
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            synchronized (hecho) { if (hecho[0]) return; hecho[0] = true; }
            cs.cancel(); listo.accept(ultima);
        }, 30000);
        try {
            lm.getCurrentLocation(pr, cs, Executors.newSingleThreadExecutor(), l -> {
                synchronized (hecho) { if (hecho[0]) return; hecho[0] = true; }
                listo.accept(l != null ? l : ultima);
            });
        } catch (SecurityException e) { listo.accept(ultima); }
    }
}
