package mx.forte.tablero;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.Toast;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Mi Casa: aviso "Vas llegando, ¿abro el portón?" con botón.
 * La notificación también sale en el Galaxy Watch, con el mismo botón.
 */
public class CasaReceiver extends BroadcastReceiver {

    static final String CANAL = "micasa";
    static final int ID = 7701;
    static final String ABRIR = "mx.forte.tablero.CASA_ABRIR";
    static final String URL_SET = "https://micasa-jl.netlify.app/api/casa?action=set";

    static void avisarLlegada(Context ctx, String pin, String texto) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CANAL, "Mi Casa", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Aviso al llegar a la casa");
            nm.createNotificationChannel(ch);
        }
        Intent i = new Intent(ctx, CasaReceiver.class).setAction(ABRIR).putExtra("pin", pin);
        PendingIntent abrir = PendingIntent.getBroadcast(ctx, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CANAL) : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("Vas llegando a casa")
            .setContentText(texto)
            .setStyle(new Notification.BigTextStyle().bigText(texto))
            .setAutoCancel(true)
            .setTimeoutAfter(10 * 60 * 1000)
            .setCategory(Notification.CATEGORY_REMINDER)
            .addAction(new Notification.Action.Builder(null, "Abrir portón", abrir).build());
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH);
        try { nm.notify(ID, b.build()); } catch (SecurityException ignored) { }
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!ABRIR.equals(intent.getAction())) return;
        final String pin = intent.getStringExtra("pin");
        final Context app = ctx.getApplicationContext();
        final PendingResult pr = goAsync();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ID);
        new Thread(() -> {
            boolean ok = false;
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(URL_SET).openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(8000);
                c.setReadTimeout(12000);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                c.setRequestProperty("X-Casa-Pin", pin == null ? "" : pin);
                try (OutputStream os = c.getOutputStream()) {
                    os.write("{\"zone\":\"porton\",\"on\":true,\"who\":\"Kia · Llegando\"}".getBytes(StandardCharsets.UTF_8));
                }
                ok = c.getResponseCode() == 200;
            } catch (Exception ignored) {
            } finally {
                if (c != null) c.disconnect();
            }
            final boolean listo = ok;
            new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                Toast.makeText(app, listo ? "Abriendo el portón" : "No se pudo abrir el portón", Toast.LENGTH_SHORT).show();
                pr.finish();
            });
        }).start();
    }
}
