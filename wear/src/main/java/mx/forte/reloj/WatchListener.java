package mx.forte.reloj;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.wear.tiles.TileService;

import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

import java.nio.charset.StandardCharsets;

/** Recibe los datos y las alertas del teléfono, aunque la app del reloj esté cerrada. */
public class WatchListener extends WearableListenerService {

    private static long lastTile = 0;

    @Override
    public void onDataChanged(DataEventBuffer events) {
        WatchData.load(this);
        for (DataEvent e : events) {
            if (e.getType() == DataEvent.TYPE_CHANGED && "/forte/datos".equals(e.getDataItem().getUri().getPath())) {
                WatchData.update(this, DataMapItem.fromDataItem(e.getDataItem()).getDataMap());
            }
        }
        long now = System.currentTimeMillis();
        if (now - lastTile > 10000) {
            lastTile = now;
            TileService.getUpdater(this).requestUpdate(DashTile.class);
        }
    }

    @Override
    public void onMessageReceived(MessageEvent m) {
        if (!"/forte/alerta".equals(m.getPath())) return;
        String text = new String(m.getData(), StandardCharsets.UTF_8);
        WatchData.load(this);
        WatchData.setAlerta(this, text);

        Vibrator vib = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vib != null) vib.vibrate(VibrationEffect.createWaveform(new long[]{0, 350, 150, 350, 150, 350}, -1));

        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.createNotificationChannel(new NotificationChannel("alertas", "Alertas del auto", NotificationManager.IMPORTANCE_HIGH));
        Intent open = new Intent(this, WatchActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, "alertas")
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle("Tablero Forte")
                .setContentText(text)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        nm.notify(2, n);
        TileService.getUpdater(this).requestUpdate(DashTile.class);
    }
}
