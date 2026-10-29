package mx.forte.reloj;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.view.View;

/** Tablero redondo: arco de RPM, velocidad grande y motor, batería y gasolina abajo. */
public class DashView extends View {

    private static final int BLUE = Color.rgb(47, 123, 255), ICE = Color.rgb(143, 176, 230),
            TRACK = Color.rgb(22, 34, 64), RED = Color.rgb(255, 59, 69), AMBER = Color.rgb(255, 176, 46),
            GREEN = Color.rgb(75, 227, 109);
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF r = new RectF();

    public DashView(Context c) {
        super(c);
        p.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
    }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight(), s = Math.min(w, h), cx = w / 2f, cy = h / 2f;
        c.drawColor(Color.BLACK);
        boolean vivo = WatchData.vivo();
        Double speed = WatchData.get("speed"), rpm = WatchData.get("rpm"), cool = WatchData.get("coolant"),
                volt = WatchData.get("volt"), fuel = WatchData.get("fuel");

        // arco de RPM por la orilla
        float m = s * 0.045f, sw = s * 0.06f;
        r.set(cx - s / 2 + m + sw / 2, cy - s / 2 + m + sw / 2, cx + s / 2 - m - sw / 2, cy + s / 2 - m - sw / 2);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeWidth(sw);
        p.setColor(TRACK);
        c.drawArc(r, 135, 270, false, p);
        if (vivo && rpm != null && rpm > 50) {
            float f = (float) Math.min(1, rpm / 8000);
            p.setColor(rpm > 6000 ? RED : BLUE);
            c.drawArc(r, 135, 270 * f, false, p);
        }
        p.setStrokeCap(Paint.Cap.BUTT);
        p.setStrokeWidth(sw * 0.3f);
        p.setColor(RED);
        c.drawArc(r, 135 + 270 * 6500f / 8000f, 270 * 1500f / 8000f, false, p);

        p.setStyle(Paint.Style.FILL);
        p.setTextAlign(Paint.Align.CENTER);

        if (vivo) {
            p.setColor(Color.WHITE);
            p.setTextSize(s * 0.30f);
            c.drawText(WatchData.n(speed, 0), cx, cy + s * 0.04f, p);
            p.setTextSize(s * 0.06f);
            p.setColor(ICE);
            c.drawText("km/h · " + WatchData.n(rpm, 0) + " rpm", cx, cy + s * 0.13f, p);
            Double kml = WatchData.kml();
            p.setTextSize(s * 0.055f);
            c.drawText(kml == null ? "Detenido" : WatchData.n(kml, 1) + " km/L", cx, cy - s * 0.25f, p);
        } else {
            p.setColor(Color.WHITE);
            p.setTextSize(s * 0.085f);
            c.drawText("Sin conexión", cx, cy - s * 0.04f, p);
            p.setTextSize(s * 0.05f);
            p.setColor(ICE);
            String e = WatchData.estado == null ? "" : WatchData.estado;
            if (e.length() > 30) e = e.substring(0, 29) + "…";
            c.drawText(e, cx, cy + s * 0.05f, p);
        }

        // motor, batería y gasolina
        String[] lbl = {"MOTOR", "BATERÍA", "GAS"};
        String[] val = {WatchData.n(cool, 0) + "°", WatchData.n(volt, 1) + "V", WatchData.n(fuel, 0) + "%"};
        int[] col = {
                cool != null && cool >= 108 ? RED : Color.WHITE,
                volt == null ? Color.WHITE : volt < 12.2 ? AMBER : volt >= 13.2 ? GREEN : Color.WHITE,
                fuel != null && fuel < 15 ? RED : Color.WHITE};
        float[] xs = {cx - s * 0.24f, cx, cx + s * 0.24f};
        for (int i = 0; i < 3; i++) {
            p.setTextSize(s * 0.04f);
            p.setColor(ICE);
            c.drawText(lbl[i], xs[i], cy + s * 0.25f, p);
            p.setTextSize(s * 0.075f);
            p.setColor(col[i]);
            c.drawText(val[i], xs[i], cy + s * 0.33f, p);
        }

        // alerta
        String a = WatchData.alertaReciente();
        if (a != null) {
            float bh = s * 0.2f;
            r.set(cx - s * 0.4f, cy - s * 0.12f - bh / 2, cx + s * 0.4f, cy - s * 0.12f + bh / 2);
            p.setColor(Color.rgb(120, 16, 24));
            c.drawRoundRect(r, bh / 3, bh / 3, p);
            p.setColor(Color.WHITE);
            p.setTextSize(s * 0.05f);
            String l1 = a, l2 = null;
            if (a.length() > 24) {
                int k = a.lastIndexOf(' ', 24);
                if (k < 8) k = 24;
                l1 = a.substring(0, k);
                l2 = a.substring(k).trim();
                if (l2.length() > 26) l2 = l2.substring(0, 25) + "…";
            }
            c.drawText(l1, cx, r.centerY() - (l2 != null ? s * 0.01f : -s * 0.018f), p);
            if (l2 != null) c.drawText(l2, cx, r.centerY() + s * 0.055f, p);
        }
    }
}
