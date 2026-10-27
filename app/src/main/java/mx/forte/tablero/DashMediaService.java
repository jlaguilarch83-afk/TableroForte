package mx.forte.tablero;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.media.MediaDescription;
import android.media.MediaMetadata;
import android.media.browse.MediaBrowser;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.media.MediaBrowserService;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Tablero en la pantalla de Android Auto, presentado como "app de música".
 * Android Auto deja instalar a mano este tipo de app. No reproduce sonido:
 * la portada es el tablero dibujado y los textos de la canción son los datos del auto.
 */
public class DashMediaService extends MediaBrowserService {

    private static final String ROOT = "raiz", ITEM = "tablero";
    private static final int SIZE = 640;

    private MediaSession session;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean activo = false;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (!activo) return;
            actualizar();
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        session = new MediaSession(this, "TableroForte");
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                iniciar();
            }

            @Override
            public void onPlayFromMediaId(String mediaId, Bundle extras) {
                iniciar();
            }

            @Override
            public void onPause() {
                detener(PlaybackState.STATE_PAUSED);
            }

            @Override
            public void onStop() {
                detener(PlaybackState.STATE_STOPPED);
            }
        });
        session.setPlaybackState(estado(PlaybackState.STATE_PAUSED));
        setSessionToken(session.getSessionToken());
    }

    @Override
    public void onDestroy() {
        activo = false;
        handler.removeCallbacks(tick);
        if (session != null) session.release();
        super.onDestroy();
    }

    @Override
    public BrowserRoot onGetRoot(String clientPackageName, int clientUid, Bundle rootHints) {
        return new BrowserRoot(ROOT, null);
    }

    @Override
    public void onLoadChildren(String parentId, Result<List<MediaBrowser.MediaItem>> result) {
        List<MediaBrowser.MediaItem> items = new ArrayList<>();
        if (ROOT.equals(parentId)) {
            MediaDescription d = new MediaDescription.Builder()
                    .setMediaId(ITEM)
                    .setTitle("Tablero en vivo")
                    .setSubtitle("Velocidad, motor, batería y gasolina")
                    .setIconBitmap(dibujar())
                    .build();
            items.add(new MediaBrowser.MediaItem(d, MediaBrowser.MediaItem.FLAG_PLAYABLE));
        }
        result.sendResult(items);
    }

    private void iniciar() {
        // si no hay conexión y ya se eligió un adaptador, se intenta conectar
        if (ObdService.instance == null && ObdService.savedAddress(this) != null) {
            try {
                ObdService.connect(this, ObdService.savedAddress(this));
            } catch (Exception ignored) {
                // Android puede impedirlo en segundo plano; se conecta desde la app del teléfono
            }
        }
        session.setActive(true);
        activo = true;
        session.setPlaybackState(estado(PlaybackState.STATE_PLAYING));
        handler.removeCallbacks(tick);
        handler.post(tick);
    }

    private void detener(int st) {
        activo = false;
        handler.removeCallbacks(tick);
        session.setPlaybackState(estado(st));
    }

    private PlaybackState estado(int st) {
        return new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_PLAY_FROM_MEDIA_ID | PlaybackState.ACTION_STOP)
                .setState(st, PlaybackState.PLAYBACK_POSITION_UNKNOWN, st == PlaybackState.STATE_PLAYING ? 1f : 0f)
                .build();
    }

    private static String n(Double v, int dec) {
        if (v == null) return "—";
        return dec == 0 ? String.valueOf(Math.round(v)) : String.format(Locale.US, "%." + dec + "f", v);
    }

    private String alertaReciente() {
        String a = ObdService.alertText;
        return a != null && System.currentTimeMillis() - ObdService.alertAt < 20000 ? a : null;
    }

    private void actualizar() {
        Double speed = ObdService.get("speed"), rpm = ObdService.get("rpm"), cool = ObdService.get("coolant"),
                volt = ObdService.get("volt"), fuel = ObdService.get("fuel"), maf = ObdService.get("maf");
        boolean con = ObdService.isConnected();
        String alerta = alertaReciente();
        String titulo = alerta != null ? alerta
                : con ? n(speed, 0) + " km/h · " + n(rpm, 0) + " rpm" : ObdService.statusText;
        String linea2 = "Motor " + n(cool, 0) + " °C · Batería " + n(volt, 1) + " V";
        String rend = "";
        if (speed != null && speed > 3 && maf != null && maf > 0) rend = String.format(Locale.US, " · %.1f km/L", speed / (maf * 3600 / (14.7 * 745)));
        String linea3 = "Gasolina " + n(fuel, 0) + " %" + rend;
        Bitmap art = dibujar();
        session.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_MEDIA_ID, ITEM)
                .putString(MediaMetadata.METADATA_KEY_TITLE, titulo)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, linea2)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, linea3)
                .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, titulo)
                .putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, linea2)
                .putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art)
                .putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, art)
                .build());
    }

    /** Dibuja el tablero: arco de RPM, velocidad grande y datos abajo. */
    private Bitmap dibujar() {
        Bitmap b = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        c.drawColor(Color.rgb(6, 12, 28));
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        Double speed = ObdService.get("speed"), rpm = ObdService.get("rpm"), cool = ObdService.get("coolant"),
                volt = ObdService.get("volt"), fuel = ObdService.get("fuel");
        boolean con = ObdService.isConnected();

        RectF arc = new RectF(70, 60, SIZE - 70, SIZE - 80);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(34);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(Color.rgb(24, 38, 72));
        c.drawArc(arc, 135, 270, false, p);
        p.setColor(Color.rgb(255, 59, 69));
        p.setStrokeWidth(10);
        p.setStrokeCap(Paint.Cap.BUTT);
        RectF red = new RectF(arc.left - 26, arc.top - 26, arc.right + 26, arc.bottom + 26);
        c.drawArc(red, 135 + 270 * 6500f / 8000f, 270 * 1500f / 8000f, false, p);
        if (rpm != null && rpm > 50) {
            float f = (float) Math.min(1, rpm / 8000);
            p.setStrokeWidth(34);
            p.setStrokeCap(Paint.Cap.ROUND);
            p.setColor(rpm > 6000 ? Color.rgb(255, 59, 69) : Color.rgb(47, 123, 255));
            c.drawArc(arc, 135, 270 * f, false, p);
        }

        p.setStyle(Paint.Style.FILL);
        p.setTextAlign(Paint.Align.CENTER);
        p.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
        p.setColor(Color.WHITE);
        float cx = SIZE / 2f;
        if (con) {
            p.setTextSize(200);
            c.drawText(n(speed, 0), cx, 330, p);
            p.setTextSize(36);
            p.setColor(Color.rgb(143, 176, 230));
            c.drawText("km/h", cx, 385, p);
            p.setTextSize(34);
            p.setColor(Color.WHITE);
            c.drawText(n(rpm, 0) + " rpm", cx, 440, p);
        } else {
            p.setTextSize(56);
            c.drawText("Sin conexión", cx, 300, p);
            p.setTextSize(30);
            p.setColor(Color.rgb(143, 176, 230));
            c.drawText("Conecta el OBD desde la app", cx, 350, p);
            c.drawText("del teléfono", cx, 390, p);
        }

        // fila inferior: motor, batería, gasolina
        String[][] fila = {
                {"MOTOR", n(cool, 0) + "°"},
                {"BATERÍA", n(volt, 1) + "V"},
                {"GAS", n(fuel, 0) + "%"}};
        for (int i = 0; i < 3; i++) {
            float x = SIZE * (i + 0.5f) / 3f;
            p.setTextSize(24);
            p.setColor(Color.rgb(143, 176, 230));
            c.drawText(fila[i][0], x, 560, p);
            p.setTextSize(44);
            int col = Color.WHITE;
            if (i == 0 && cool != null && cool >= 108) col = Color.rgb(255, 59, 69);
            if (i == 1 && volt != null && volt < 12.2) col = Color.rgb(255, 176, 46);
            if (i == 2 && fuel != null && fuel < 15) col = Color.rgb(255, 59, 69);
            p.setColor(col);
            c.drawText(fila[i][1], x, 610, p);
        }

        String alerta = alertaReciente();
        if (alerta != null) {
            p.setColor(Color.rgb(120, 20, 28));
            c.drawRect(0, 0, SIZE, 64, p);
            p.setColor(Color.WHITE);
            p.setTextSize(28);
            String t = alerta.length() > 38 ? alerta.substring(0, 37) + "…" : alerta;
            c.drawText(t, cx, 43, p);
        }
        return b;
    }
}
