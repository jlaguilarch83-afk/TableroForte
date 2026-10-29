package mx.forte.reloj;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.view.View;

/**
 * Carátulas del reloj: 6 estilos × 9 colores = 54, más "Datos completos" (2 páginas), "Viaje" y "Mi carro".
 * Se cambian girando el bisel o deslizando hacia arriba o abajo.
 */
public class DashView extends View {

    // ---------- paletas ----------
    static final class Pal {
        final String nom;
        final int bg, fg, mute, acc, acc2, trk;

        Pal(String nom, int bg, int fg, int mute, int acc, int acc2, int trk) {
            this.nom = nom; this.bg = bg; this.fg = fg; this.mute = mute; this.acc = acc; this.acc2 = acc2; this.trk = trk;
        }
    }

    static final Pal[] PAL = {
            new Pal("Azul", 0xFF000000, 0xFFFFFFFF, 0xFF8FB0E6, 0xFF2F7BFF, 0xFF9FD8FF, 0xFF162240),
            new Pal("Rojo", 0xFF000000, 0xFFFFFFFF, 0xFFC98A84, 0xFFFF2D2D, 0xFFFF9A3C, 0xFF2A1012),
            new Pal("Verde", 0xFF000000, 0xFFE7FFF3, 0xFF78B298, 0xFF22E39A, 0xFFB6FF5A, 0xFF0F2C20),
            new Pal("Morado", 0xFF000000, 0xFFF6EAFF, 0xFFA487C9, 0xFFC45BFF, 0xFFFF5BD2, 0xFF261440),
            new Pal("Oro", 0xFF000000, 0xFFFFF6DF, 0xFFA8956A, 0xFFE8B84A, 0xFFFFF0A8, 0xFF272013),
            new Pal("Cian", 0xFF000000, 0xFFE6FBFF, 0xFF6FA8BB, 0xFF00D4FF, 0xFF00FFB2, 0xFF0B3040),
            new Pal("Naranja", 0xFF000000, 0xFFFFF3E6, 0xFFB08A6A, 0xFFFF7A1A, 0xFFFFCC33, 0xFF2C1A0E),
            new Pal("Blanco", 0xFF000000, 0xFFFFFFFF, 0xFF9AA0A8, 0xFFFFFFFF, 0xFFB8C0CC, 0xFF2A2D33),
            new Pal("Rosa", 0xFF000000, 0xFFFFEAF4, 0xFFC98AA8, 0xFFFF4FA3, 0xFFFFA8D2, 0xFF2E1020)
    };
    static final String[] ESTILOS = {"Arco", "Aguja", "Digital", "Anillos", "Minimal", "LCD"};
    static final String[] ESPECIALES = {"Datos completos 1", "Datos completos 2", "Viaje", "Mi carro"};
    static final int RED = 0xFFFF3B45, AMBER = 0xFFFFB02E, GREEN = 0xFF4BE36D;

    static int total() {
        return ESTILOS.length * PAL.length + ESPECIALES.length;
    }

    static String nombre(int i) {
        int base = ESTILOS.length * PAL.length;
        if (i >= base) return ESPECIALES[i - base];
        return ESTILOS[i / PAL.length] + " " + PAL[i % PAL.length].nom;
    }

    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF r = new RectF();
    int face = 0;
    long nameUntil = 0;
    // brújula y ubicación del reloj (para "Mi carro")
    double myLat = Double.NaN, myLon = Double.NaN;
    float azimut = Float.NaN;

    public DashView(Context c) {
        super(c);
        p.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
    }

    boolean esMiCarro() {
        return face == total() - 1;
    }

    // ---------- utilidades de dibujo ----------
    private void text(Canvas c, String s, float x, float y, float size, int color, Paint.Align a) {
        p.setStyle(Paint.Style.FILL);
        p.setTextAlign(a);
        p.setTextSize(size);
        p.setColor(color);
        c.drawText(s, x, y, p);
    }

    private void text(Canvas c, String s, float x, float y, float size, int color) {
        text(c, s, x, y, size, color, Paint.Align.CENTER);
    }

    private void arc(Canvas c, float cx, float cy, float rad, float start, float sweep, int color, float w, boolean round) {
        if (Math.abs(sweep) < .3f) return;
        r.set(cx - rad, cy - rad, cx + rad, cy + rad);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(w);
        p.setStrokeCap(round ? Paint.Cap.ROUND : Paint.Cap.BUTT);
        p.setColor(color);
        c.drawArc(r, start, sweep, false, p);
    }

    private static float f(Double v, double max) {
        return v == null ? 0 : (float) Math.max(0, Math.min(1, v / max));
    }

    private int tempCol(Double c, Pal P) {
        return c == null ? P.fg : c < 60 ? 0xFF6CC4FF : c < 108 ? P.fg : RED;
    }

    private int voltCol(Double v, Pal P) {
        return v == null ? P.fg : v < 12.2 ? AMBER : v >= 13.2 ? GREEN : P.fg;
    }

    private int gasCol(Double g, Pal P) {
        return g != null && g < 15 ? RED : P.fg;
    }

    /** Fila inferior: motor, batería y gasolina. */
    private void fila(Canvas c, float s, float cx, float y, Pal P) {
        Double cool = WatchData.get("coolant"), volt = WatchData.get("volt"), fuel = WatchData.get("fuel");
        String[] l = {"MOTOR", "BATERÍA", "GAS"};
        String[] v = {WatchData.n(cool, 0) + "°", WatchData.n(volt, 1) + "V", WatchData.n(fuel, 0) + "%"};
        int[] col = {tempCol(cool, P), voltCol(volt, P), gasCol(fuel, P)};
        float[] xs = {cx - s * .24f, cx, cx + s * .24f};
        for (int i = 0; i < 3; i++) {
            text(c, l[i], xs[i], y, s * .04f, P.mute);
            text(c, v[i], xs[i], y + s * .08f, s * .075f, col[i]);
        }
    }

    // ---------- dibujo ----------
    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight(), s = Math.min(w, h), cx = w / 2f, cy = h / 2f;
        c.drawColor(Color.BLACK);
        int base = ESTILOS.length * PAL.length;
        if (face < base) {
            Pal P = PAL[face % PAL.length];
            switch (face / PAL.length) {
                case 0: arco(c, s, cx, cy, P); break;
                case 1: aguja(c, s, cx, cy, P); break;
                case 2: digital(c, s, cx, cy, P); break;
                case 3: anillos(c, s, cx, cy, P); break;
                case 4: minimal(c, s, cx, cy, P); break;
                default: lcd(c, s, cx, cy, P); break;
            }
            if (!WatchData.vivo()) {
                text(c, "SIN CONEXIÓN", cx, cy - s * .33f, s * .045f, P.mute);
            }
        } else {
            switch (face - base) {
                case 0: datos(c, s, cx, cy, 0); break;
                case 1: datos(c, s, cx, cy, 1); break;
                case 2: viaje(c, s, cx, cy); break;
                default: miCarro(c, s, cx, cy); break;
            }
        }
        alerta(c, s, cx, cy);
        if (System.currentTimeMillis() < nameUntil) {
            p.setStyle(Paint.Style.FILL);
            p.setColor(0xCC000000);
            r.set(cx - s * .36f, cy + s * .36f, cx + s * .36f, cy + s * .46f);
            c.drawRoundRect(r, s * .05f, s * .05f, p);
            text(c, nombre(face) + "  " + (face + 1) + "/" + total(), cx, cy + s * .425f, s * .045f, Color.WHITE);
        }
    }

    // 1 · arco de rpm por la orilla
    private void arco(Canvas c, float s, float cx, float cy, Pal P) {
        float sw = s * .06f, rad = s / 2 - s * .045f - sw / 2;
        Double speed = WatchData.get("speed"), rpm = WatchData.get("rpm");
        arc(c, cx, cy, rad, 135, 270, P.trk, sw, true);
        if (WatchData.vivo()) arc(c, cx, cy, rad, 135, 270 * f(rpm, 8000), rpm != null && rpm > 6000 ? RED : P.acc, sw, true);
        arc(c, cx, cy, rad, 135 + 270 * 6500f / 8000f, 270 * 1500f / 8000f, RED, sw * .3f, false);
        text(c, WatchData.n(speed, 0), cx, cy + s * .05f, s * .3f, P.fg);
        text(c, "km/h · " + WatchData.n(rpm, 0) + " rpm", cx, cy + s * .14f, s * .055f, P.mute);
        Double k = WatchData.kml();
        text(c, k == null ? "Detenido" : WatchData.n(k, 1) + " km/L", cx, cy - s * .24f, s * .055f, P.acc2);
        fila(c, s, cx, cy + s * .25f, P);
    }

    // 2 · velocímetro con aguja
    private void aguja(Canvas c, float s, float cx, float cy, Pal P) {
        float rad = s * .43f;
        Double speed = WatchData.get("speed");
        for (int v = 0; v <= 220; v += 10) {
            double a = Math.toRadians(135 + 270.0 * v / 220);
            boolean big = v % 40 == 0;
            float r0 = rad, r1 = rad - (big ? s * .06f : s * .03f);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(big ? s * .012f : s * .006f);
            p.setColor(v >= 180 ? RED : P.fg);
            c.drawLine(cx + r0 * (float) Math.cos(a), cy + r0 * (float) Math.sin(a), cx + r1 * (float) Math.cos(a), cy + r1 * (float) Math.sin(a), p);
            if (big) text(c, String.valueOf(v), cx + (rad - s * .12f) * (float) Math.cos(a), cy + (rad - s * .12f) * (float) Math.sin(a) + s * .02f, s * .05f, P.mute);
        }
        float ang = 135 + 270 * f(speed, 220);
        double a = Math.toRadians(ang);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeWidth(s * .018f);
        p.setColor(P.acc);
        c.drawLine(cx - s * .06f * (float) Math.cos(a), cy - s * .06f * (float) Math.sin(a), cx + (rad - s * .04f) * (float) Math.cos(a), cy + (rad - s * .04f) * (float) Math.sin(a), p);
        p.setStyle(Paint.Style.FILL);
        p.setColor(P.acc2);
        c.drawCircle(cx, cy, s * .035f, p);
        text(c, WatchData.n(speed, 0) + " km/h", cx, cy + s * .2f, s * .075f, P.fg);
        Double rpm = WatchData.get("rpm"), fuel = WatchData.get("fuel"), cool = WatchData.get("coolant");
        text(c, WatchData.n(rpm, 0) + " rpm", cx, cy + s * .28f, s * .045f, P.mute);
        text(c, WatchData.n(cool, 0) + "°  ·  " + WatchData.n(fuel, 0) + "%  ·  " + WatchData.n(WatchData.get("volt"), 1) + "V", cx, cy + s * .36f, s * .045f, P.mute);
    }

    // 3 · digital con segmentos de rpm
    private void digital(Canvas c, float s, float cx, float cy, Pal P) {
        Double speed = WatchData.get("speed"), rpm = WatchData.get("rpm");
        int segs = 30, lit = Math.round(f(rpm, 8000) * segs);
        float rad = s * .44f;
        for (int i = 0; i < segs; i++) {
            float st = 150 + i * (240f / segs);
            int col = i < lit ? (i >= segs * .8 ? RED : i >= segs * .6 ? P.acc2 : P.acc) : P.trk;
            arc(c, cx, cy, rad, st, 240f / segs - 2.2f, col, s * .05f, false);
        }
        text(c, WatchData.n(speed, 0), cx, cy + s * .08f, s * .34f, P.fg);
        text(c, "KM/H", cx, cy + s * .16f, s * .05f, P.acc);
        text(c, WatchData.n(rpm, 0) + " RPM", cx, cy - s * .2f, s * .05f, P.mute);
        fila(c, s, cx, cy + s * .26f, P);
    }

    // 4 · tres anillos: rpm, gasolina y motor
    private void anillos(Canvas c, float s, float cx, float cy, Pal P) {
        Double speed = WatchData.get("speed"), rpm = WatchData.get("rpm"), fuel = WatchData.get("fuel"), cool = WatchData.get("coolant");
        float[] rr = {s * .44f, s * .37f, s * .30f};
        float[] ff = {f(rpm, 8000), f(fuel, 100), cool == null ? 0 : f(cool - 40, 90)};
        int[] cc = {P.acc, fuel != null && fuel < 15 ? RED : P.acc2, cool != null && cool >= 108 ? RED : 0xFFFFB02E};
        for (int i = 0; i < 3; i++) {
            arc(c, cx, cy, rr[i], 0, 360, P.trk, s * .05f, false);
            arc(c, cx, cy, rr[i], -90, 360 * ff[i], cc[i], s * .05f, true);
        }
        text(c, WatchData.n(speed, 0), cx, cy + s * .06f, s * .2f, P.fg);
        text(c, "km/h", cx, cy + s * .13f, s * .045f, P.mute);
        text(c, WatchData.n(WatchData.get("volt"), 1) + " V", cx, cy - s * .11f, s * .05f, voltCol(WatchData.get("volt"), P));
    }

    // 5 · minimal
    private void minimal(Canvas c, float s, float cx, float cy, Pal P) {
        Double speed = WatchData.get("speed"), rpm = WatchData.get("rpm");
        arc(c, cx, cy, s * .47f, 0, 360, P.trk, s * .012f, false);
        arc(c, cx, cy, s * .47f, -90, 360 * f(rpm, 8000), P.acc, s * .012f, true);
        p.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL));
        text(c, WatchData.n(speed, 0), cx, cy + s * .1f, s * .36f, P.fg);
        p.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
        text(c, "km/h", cx, cy + s * .19f, s * .05f, P.mute);
        Double volt = WatchData.get("volt"), fuel = WatchData.get("fuel");
        text(c, WatchData.n(fuel, 0) + "%   " + WatchData.n(volt, 1) + "V", cx, cy + s * .32f, s * .055f, P.mute);
    }

    // 6 · siete segmentos
    private void lcd(Canvas c, float s, float cx, float cy, Pal P) {
        Double speed = WatchData.get("speed"), rpm = WatchData.get("rpm");
        String t = speed == null ? "--" : String.valueOf(Math.round(speed));
        float dh = s * .3f, dw = dh * .55f, gap = dh * .2f, total = t.length() * dw + (t.length() - 1) * gap;
        float x = cx - total / 2;
        for (char ch : t.toCharArray()) {
            seg(c, ch, x, cy - dh * .6f, dw, dh, P.acc, 0x14FFFFFF);
            x += dw + gap;
        }
        text(c, "KM/H", cx, cy + dh * .55f, s * .045f, P.acc);
        int n = 20, lit = Math.round(f(rpm, 8000) * n);
        float bw = s * .55f / n;
        p.setStyle(Paint.Style.FILL);
        for (int i = 0; i < n; i++) {
            p.setColor(i < lit ? (i >= 16 ? RED : P.acc2) : 0x18FFFFFF);
            c.drawRect(cx - s * .275f + i * bw, cy - s * .33f, cx - s * .275f + i * bw + bw * .7f, cy - s * .29f, p);
        }
        fila(c, s, cx, cy + s * .27f, P);
    }

    private void seg(Canvas c, char ch, float x, float y, float w, float h, int on, int off) {
        String lit;
        switch (ch) {
            case '0': lit = "abcdef"; break;
            case '1': lit = "bc"; break;
            case '2': lit = "abged"; break;
            case '3': lit = "abgcd"; break;
            case '4': lit = "fgbc"; break;
            case '5': lit = "afgcd"; break;
            case '6': lit = "afgedc"; break;
            case '7': lit = "abc"; break;
            case '8': lit = "abcdefg"; break;
            case '9': lit = "abcdfg"; break;
            default: lit = "g"; break;
        }
        float t = h * .1f;
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeWidth(t);
        float x0 = x + t / 2, x1 = x + w - t / 2, y0 = y + t / 2, y1 = y + h / 2, y2 = y + h - t / 2, g = t * .8f;
        float[][] S = {{x0 + g, y0, x1 - g, y0}, {x1, y0 + g, x1, y1 - g}, {x1, y1 + g, x1, y2 - g}, {x0 + g, y2, x1 - g, y2},
                {x0, y1 + g, x0, y2 - g}, {x0, y0 + g, x0, y1 - g}, {x0 + g, y1, x1 - g, y1}};
        for (int i = 0; i < 7; i++) {
            p.setColor(lit.indexOf("abcdefg".charAt(i)) >= 0 ? on : off);
            c.drawLine(S[i][0], S[i][1], S[i][2], S[i][3], p);
        }
    }

    // ---------- páginas especiales ----------
    private static final String[][] DATOS = {
            {"Velocidad", "speed", "0", "km/h"}, {"RPM", "rpm", "0", ""}, {"Acelerador", "throttle", "0", "%"}, {"Carga", "load", "0", "%"},
            {"Motor", "coolant", "0", "°C"}, {"Aceite", "oil", "0", "°C"}, {"Admisión", "intake", "0", "°C"}, {"Exterior", "ambient", "0", "°C"},
            {"Batería", "volt", "2", "V"}, {"Computadora", "ecuvolt", "2", "V"}, {"Gasolina", "fuel", "0", "%"}, {"Aire MAF", "maf", "1", "g/s"},
            {"Avance", "timing", "1", "°"}, {"Ajuste corto", "stft", "1", "%"}, {"Ajuste largo", "ltft", "1", "%"}, {"Presión atm.", "baro", "0", "kPa"},
            {"Presión gas", "fuelpress", "0", "kPa"}, {"Motor encendido", "runtime", "m", ""}};

    private void datos(Canvas c, float s, float cx, float cy, int page) {
        int from = page * 9, to = Math.min(DATOS.length, from + 9);
        text(c, page == 0 ? "DATOS 1/2" : "DATOS 2/2", cx, cy - s * .36f, s * .045f, 0xFF8FB0E6);
        for (int i = from; i < to; i++) {
            int row = i - from;
            float y = cy - s * .27f + row * s * .068f;
            float half = (float) Math.sqrt(Math.max(0, (s * .47f) * (s * .47f) - (y - cy) * (y - cy)));
            String[] d = DATOS[i];
            Double v = WatchData.get(d[1]);
            String val;
            if ("m".equals(d[2])) val = v == null ? "—" : (Math.round(v) / 60) + " min";
            else val = WatchData.n(v, Integer.parseInt(d[2])) + (d[3].isEmpty() ? "" : " " + d[3]);
            text(c, d[0], cx - half + s * .06f, y, s * .045f, 0xFF8FB0E6, Paint.Align.LEFT);
            text(c, val, cx + half - s * .06f, y, s * .05f, Color.WHITE, Paint.Align.RIGHT);
        }
        if (!WatchData.vivo()) text(c, "últimos datos recibidos", cx, cy + s * .4f, s * .035f, 0xFF8FB0E6);
    }

    private void viaje(Canvas c, float s, float cx, float cy) {
        Double trip = WatchData.get("trip"), oilKm = WatchData.get("oil_km"), oilInt = WatchData.get("oil_int");
        double pct = oilKm == null || oilInt == null ? -1 : Math.max(0, 100 - oilKm / oilInt * 100);
        arc(c, cx, cy, s * .44f, 135, 270, 0xFF173070, s * .05f, true);
        if (pct >= 0) arc(c, cx, cy, s * .44f, 135, (float) (270 * pct / 100), pct > 30 ? GREEN : pct > 10 ? AMBER : RED, s * .05f, true);
        text(c, "VIAJE", cx, cy - s * .27f, s * .045f, 0xFF8FB0E6);
        text(c, WatchData.n(trip, 1) + " km", cx, cy - s * .12f, s * .12f, Color.WHITE);
        Double k = WatchData.kml(), lh = WatchData.lh();
        text(c, (k == null ? "—" : WatchData.n(k, 1) + " km/L") + " · " + (lh == null ? "—" : WatchData.n(lh, 1) + " L/h"), cx, cy - s * .03f, s * .05f, 0xFF8FB0E6);
        text(c, "ACEITE", cx, cy + s * .12f, s * .045f, 0xFF8FB0E6);
        text(c, pct < 0 ? "—" : Math.round(pct) + " %", cx, cy + s * .22f, s * .1f, Color.WHITE);
        if (oilKm != null && oilInt != null) text(c, "cambio en " + Math.max(0, Math.round(oilInt - oilKm)) + " km", cx, cy + s * .3f, s * .045f, 0xFF8FB0E6);
    }

    private void miCarro(Canvas c, float s, float cx, float cy) {
        text(c, "MI CARRO", cx, cy - s * .36f, s * .05f, 0xFF8FB0E6);
        if (Double.isNaN(WatchData.parkLat)) {
            text(c, "Sin lugar guardado", cx, cy, s * .07f, Color.WHITE);
            text(c, "Se guarda al apagar el auto", cx, cy + s * .08f, s * .045f, 0xFF8FB0E6);
            return;
        }
        if (Double.isNaN(myLat)) {
            text(c, "Buscando tu ubicación…", cx, cy, s * .06f, Color.WHITE);
            text(c, "Activa la ubicación del reloj", cx, cy + s * .08f, s * .045f, 0xFF8FB0E6);
            return;
        }
        double d = distancia(myLat, myLon, WatchData.parkLat, WatchData.parkLon);
        double b = rumbo(myLat, myLon, WatchData.parkLat, WatchData.parkLon);
        float rot = (float) (Float.isNaN(azimut) ? b : b - azimut);
        c.save();
        c.rotate(rot, cx, cy);
        Path a = new Path();
        a.moveTo(cx, cy - s * .26f);
        a.lineTo(cx + s * .12f, cy + s * .08f);
        a.lineTo(cx, cy);
        a.lineTo(cx - s * .12f, cy + s * .08f);
        a.close();
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xFF2F7BFF);
        c.drawPath(a, p);
        c.restore();
        text(c, d < 1000 ? Math.round(d / 5) * 5 + " m" : String.format(java.util.Locale.US, "%.1f km", d / 1000), cx, cy + s * .25f, s * .1f, Color.WHITE);
        if (Float.isNaN(azimut)) text(c, "rumbo " + Math.round(b) + "° (sin brújula)", cx, cy + s * .33f, s * .04f, 0xFF8FB0E6);
    }

    private void alerta(Canvas c, float s, float cx, float cy) {
        String a = WatchData.alertaReciente();
        if (a == null) return;
        float bh = s * .2f;
        r.set(cx - s * .4f, cy - s * .12f - bh / 2, cx + s * .4f, cy - s * .12f + bh / 2);
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xF0781018);
        c.drawRoundRect(r, bh / 3, bh / 3, p);
        String l1 = a, l2 = null;
        if (a.length() > 24) {
            int k = a.lastIndexOf(' ', 24);
            if (k < 8) k = 24;
            l1 = a.substring(0, k);
            l2 = a.substring(k).trim();
            if (l2.length() > 26) l2 = l2.substring(0, 25) + "…";
        }
        text(c, l1, cx, r.centerY() - (l2 != null ? s * .01f : -s * .018f), s * .05f, Color.WHITE);
        if (l2 != null) text(c, l2, cx, r.centerY() + s * .055f, s * .05f, Color.WHITE);
    }

    static double distancia(double a, double b, double c, double d) {
        double R = 6371000, x = Math.toRadians(c - a), y = Math.toRadians(d - b);
        double h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(Math.toRadians(a)) * Math.cos(Math.toRadians(c)) * Math.sin(y / 2) * Math.sin(y / 2);
        return 2 * R * Math.asin(Math.sqrt(h));
    }

    static double rumbo(double a, double b, double c, double d) {
        double y = Math.sin(Math.toRadians(d - b)) * Math.cos(Math.toRadians(c));
        double x = Math.cos(Math.toRadians(a)) * Math.sin(Math.toRadians(c)) - Math.sin(Math.toRadians(a)) * Math.cos(Math.toRadians(c)) * Math.cos(Math.toRadians(d - b));
        return (Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
    }
}
