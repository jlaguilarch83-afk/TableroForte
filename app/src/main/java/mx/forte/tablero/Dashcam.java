package mx.forte.tablero;

import android.content.Context;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Handler;
import android.os.Looper;
import android.view.TextureView;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;

/**
 * Dashcam Pruveeo (chip Novatek, app TimaCam) por su propio Wi-Fi.
 * La cámara vive en 192.168.1.254. El video en vivo sale como MJPEG (puerto 8192)
 * o RTSP (rtsp://192.168.1.254/xxx.mov). Aquí se guarda el último cuadro en JPEG
 * y la página lo pide en https://forte.app/pruveeo/cuadro.jpg.
 *
 * Todo se habla por la red Wi-Fi de la cámara (aunque no tenga internet), así el
 * internet del teléfono sigue por datos móviles para mapas y clima.
 */
final class Dashcam {
    static final String IP = "192.168.1.254";

    private final Context ctx;
    private final ConnectivityManager cm;
    private final FrameLayout raiz;
    private final Handler main = new Handler(Looper.getMainLooper());

    volatile byte[] cuadro;
    volatile long cuadroAt;
    volatile String estado = "apagada";
    volatile String via = "";
    private volatile boolean corriendo;
    private Thread hilo, latido;

    private androidx.media3.exoplayer.ExoPlayer player;
    private TextureView tv;

    Dashcam(Context c, FrameLayout raiz) {
        this.ctx = c;
        this.raiz = raiz;
        this.cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
    }

    /** La red Wi-Fi (la de la cámara), aunque Android use datos móviles para internet. */
    Network wifi() {
        try {
            if (cm == null) return null;
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities nc = cm.getNetworkCapabilities(n);
                if (nc != null && nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return n;
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private HttpURLConnection abrir(String url, int ms) throws Exception {
        Network n = wifi();
        URL u = new URL(url);
        HttpURLConnection c = (HttpURLConnection) (n != null ? n.openConnection(u) : u.openConnection());
        c.setConnectTimeout(ms);
        c.setReadTimeout(ms);
        c.setUseCaches(false);
        return c;
    }

    /** Comando Novatek: http://192.168.1.254/?custom=1&cmd=N&par=P */
    String cmd(int cmd, String par) {
        HttpURLConnection c = null;
        try {
            c = abrir("http://" + IP + "/?custom=1&cmd=" + cmd + (par != null && !par.isEmpty() ? "&par=" + par : ""), 3000);
            int code = c.getResponseCode();
            InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
            return code + " " + (in == null ? "" : leer(in, 6000));
        } catch (Exception e) {
            return "error " + e.getClass().getSimpleName() + (e.getMessage() != null ? ": " + e.getMessage() : "");
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String leer(InputStream in, int max) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[2048];
        int n;
        while (b.size() < max && (n = in.read(buf)) > 0) b.write(buf, 0, n);
        in.close();
        return b.toString("UTF-8");
    }

    private boolean puerto(int p) {
        Socket s = null;
        try {
            Network n = wifi();
            s = n != null ? n.getSocketFactory().createSocket() : new Socket();
            s.connect(new InetSocketAddress(IP, p), 1500);
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            try {
                if (s != null) s.close();
            } catch (Exception ignored) {
            }
        }
    }

    private static String corto(String s) {
        s = s == null ? "" : s.replaceAll("\\s+", " ").trim();
        return s.length() > 160 ? s.substring(0, 160) + "…" : s;
    }

    /** Diagnóstico: qué contesta la cámara (para ajustar el programa si hace falta). */
    String probar() {
        JSONObject o = new JSONObject();
        try {
            o.put("wifi", wifi() != null);
            o.put("version", corto(cmd(3012, null)));
            o.put("estado", corto(cmd(3014, null)));
            o.put("http80", puerto(80));
            o.put("rtsp554", puerto(554));
            o.put("mjpeg8192", puerto(8192));
            o.put("p3333", puerto(3333));
            o.put("video", estado + (via.isEmpty() ? "" : " (" + via + ")"));
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    String json() {
        JSONObject o = new JSONObject();
        try {
            o.put("estado", estado);
            o.put("via", via);
            o.put("wifi", wifi() != null);
            o.put("edad", cuadroAt == 0 ? -1 : System.currentTimeMillis() - cuadroAt);
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    // ---------------- video en vivo ----------------

    synchronized void iniciar() {
        if (corriendo) return;
        corriendo = true;
        estado = "buscando la cámara";
        hilo = new Thread(this::ciclo, "pruveeo");
        hilo.start();
        // algunas cámaras cortan el Wi-Fi si nadie les habla
        latido = new Thread(() -> {
            while (corriendo) {
                if (wifi() != null) cmd(3016, null);
                dormir(10000);
            }
        }, "pruveeo-latido");
        latido.start();
    }

    synchronized void parar() {
        corriendo = false;
        if (hilo != null) hilo.interrupt();
        if (latido != null) latido.interrupt();
        main.post(this::rtspParar);
        estado = "apagada";
        via = "";
        cuadro = null;
    }

    private void ciclo() {
        while (corriendo) {
            if (wifi() == null) {
                estado = "el teléfono no está en el Wi-Fi de la cámara";
                dormir(3000);
                continue;
            }
            if (!puerto(80) && !puerto(554) && !puerto(8192)) {
                estado = "no encuentro la cámara en 192.168.1.254";
                dormir(3000);
                continue;
            }
            // 1) MJPEG directo (lo más ligero)
            if (puerto(8192)) {
                via = "mjpeg";
                mjpeg();
                if (!corriendo) break;
            }
            // 2) RTSP con el reproductor de video
            if (corriendo && puerto(554)) {
                via = "rtsp";
                estado = "conectando el video";
                long t0 = System.currentTimeMillis();
                main.post(this::rtspIniciar);
                while (corriendo && "rtsp".equals(via)) {
                    dormir(1000);
                    long sin = System.currentTimeMillis() - Math.max(cuadroAt, t0);
                    if (sin > 12000) {
                        estado = "la cámara no manda video por RTSP";
                        break;
                    }
                }
                main.post(this::rtspParar);
                if (!corriendo) break;
            }
            // pedirle que prenda la vista en vivo y volver a intentar
            via = "";
            cmd(2015, "1");
            if (!estado.startsWith("la cámara")) estado = "la cámara no manda video";
            dormir(4000);
        }
    }

    private void mjpeg() {
        HttpURLConnection c = null;
        try {
            c = abrir("http://" + IP + ":8192/", 6000);
            InputStream in = new BufferedInputStream(c.getInputStream(), 65536);
            ByteArrayOutputStream f = new ByteArrayOutputStream(250000);
            int prev = -1, b;
            boolean dentro = false;
            while (corriendo && (b = in.read()) != -1) {
                if (!dentro) {
                    if (prev == 0xFF && b == 0xD8) {
                        dentro = true;
                        f.reset();
                        f.write(0xFF);
                        f.write(0xD8);
                    }
                } else {
                    f.write(b);
                    if (prev == 0xFF && b == 0xD9) {
                        cuadro = f.toByteArray();
                        cuadroAt = System.currentTimeMillis();
                        estado = "en vivo";
                        dentro = false;
                    } else if (f.size() > 3000000) dentro = false;
                }
                prev = b;
            }
        } catch (Exception e) {
            estado = "MJPEG: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private void rtspIniciar() {
        try {
            rtspParar();
            if (tv == null) {
                // detrás de la página: no se ve, pero de aquí se sacan los cuadros
                tv = new TextureView(ctx);
                raiz.addView(tv, 0, new FrameLayout.LayoutParams(640, 360));
            }
            androidx.media3.exoplayer.rtsp.RtspMediaSource.Factory f = new androidx.media3.exoplayer.rtsp.RtspMediaSource.Factory().setTimeoutMs(8000);
            Network n = wifi();
            if (n != null) f.setSocketFactory(n.getSocketFactory());
            player = new androidx.media3.exoplayer.ExoPlayer.Builder(ctx).build();
            player.setVolume(0f);
            player.setVideoTextureView(tv);
            player.addListener(new androidx.media3.common.Player.Listener() {
                @Override
                public void onPlayerError(androidx.media3.common.PlaybackException e) {
                    estado = "RTSP: " + e.getErrorCodeName();
                    via = "";
                }
            });
            player.setMediaSource(f.createMediaSource(androidx.media3.common.MediaItem.fromUri("rtsp://" + IP + "/xxx.mov")));
            player.prepare();
            player.play();
            main.removeCallbacks(captura);
            main.postDelayed(captura, 400);
        } catch (Throwable e) {
            estado = "RTSP: " + e.getMessage();
            via = "";
        }
    }

    private final Runnable captura = new Runnable() {
        @Override
        public void run() {
            if (player == null || tv == null) return;
            try {
                if (tv.isAvailable() && player.getVideoSize().width > 0) {
                    Bitmap bm = tv.getBitmap(640, 360);
                    if (bm != null) {
                        ByteArrayOutputStream o = new ByteArrayOutputStream(80000);
                        bm.compress(Bitmap.CompressFormat.JPEG, 75, o);
                        bm.recycle();
                        cuadro = o.toByteArray();
                        cuadroAt = System.currentTimeMillis();
                        estado = "en vivo";
                    }
                }
            } catch (Throwable ignored) {
            }
            main.postDelayed(this, 120);
        }
    };

    private void rtspParar() {
        main.removeCallbacks(captura);
        if (player != null) {
            try {
                player.release();
            } catch (Throwable ignored) {
            }
            player = null;
        }
    }

    private static boolean dormir(long ms) {
        try {
            Thread.sleep(ms);
            return true;
        } catch (InterruptedException e) {
            return false;
        }
    }
}
