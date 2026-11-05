package mx.micasa.reloj;

import android.animation.ValueAnimator;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.animation.DecelerateInterpolator;

import java.io.InputStream;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Pantallas del reloj, una por página; se cambia deslizando de lado o girando el bisel:
 *   0      la casita 3D con lo que está prendido (tocar un cuarto lo prende/apaga)
 *   1..n   una tarjeta por cuarto con su foto (tocar = prender/apagar, abrir/cerrar)
 *   n+1    alarma (dos toques para armar o desarmar)
 *   n+2    "Me voy" (dos toques)
 */
public class CasaView extends View {

    // zona, nombre, x, y, ancho, alto (en % de la casa, igual que la app de la tableta)
    static final Object[][] CUARTOS = {
        {"sala", "Sala", 36.3, 42, 23.9, 30},
        {"porton", "Portón", 0.5, 33, 6.2, 52},
        {"puerta", "Puerta", 9.3, 25, 4.2, 32},
        {"spots", "Spots de la fachada", 0, 0, 0, 0},
        {"cocina_focos", "Cocina", 29.5, 3, 11, 17},
        {"cochera", "Cochera", 7, 50, 29, 36},
        {"sala_focos", "Focos de la sala", 36.3, 72, 23.9, 13},
        {"lampara", "Lámpara", 60.2, 45, 3.6, 14},
        {"cocina_tira", "Tira LED cocina", 27.5, 20, 12.5, 22},
        {"bano", "Baño", 44.7, 5, 8.3, 26},
        {"pasillo", "Pasillo", 44.5, 31, 4.9, 17},
        {"arbotantes", "Arbotantes", 49.4, 30, 10, 12},
        {"terraza", "Terraza", 13.5, 6, 14, 43},
        {"patio", "Patio", 80, 5, 19, 80},
        {"rec_principal", "Recámara principal", 64.5, 41, 15.5, 43},
        {"rec_rosa", "Recámara rosa", 53, 4, 9, 26},
        {"rec_azul", "Cuarto azul", 62.2, 4, 13.8, 35},
    };
    static final int N = CUARTOS.length;
    // Orden: casa 3D, fachada y alarma primero; luego los cuartos y al final Me voy
    static final int P_CASA = 0, P_FACHADA = 1, P_ALARMA = 2, P_CUARTO1 = 3, P_MEVOY = N + 3, PAGINAS = N + 4;

    static final int AMBAR = 0xFFFFC15E, VERDE = 0xFF6FDCA6, NARANJA = 0xFFFF8F48, ROJO = 0xFFFF3B3B, GRIS = 0xFF8AA0C2, TINTA = 0xFFE7EEFA;

    final CasaActivity act;
    final Map<String, Boolean> estado = new HashMap<>();
    final Map<String, Long> esperando = new HashMap<>();
    String alarma = "";
    boolean sonando = false, enLinea = false, primera = true;
    String error = null, avisoTxt = null;
    long avisoHasta = 0, confirmarHasta = 0;
    int confirmarPagina = -1;

    int pagina = 0;
    float arrastre = 0, xIni = 0, yIni = 0;
    boolean moviendo = false;
    VelocityTracker vt;
    ValueAnimator anim;
    float giro = 0;

    // PIN
    boolean pidiendoPin = false;
    String pinTxt = "";
    final RectF[] teclas = new RectF[12];

    final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    final Paint suma = new Paint(Paint.FILTER_BITMAP_FLAG);
    final Paint img = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
    final LinkedHashMap<String, Bitmap> fotos = new LinkedHashMap<String, Bitmap>(16, .75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Bitmap> e) { return size() > 10; }
    };
    Bitmap casaBase, casaHecha;
    final Map<String, Bitmap> capas = new HashMap<>();
    boolean casaSucia = true;
    final RectF casaRect = new RectF();

    public CasaView(CasaActivity a) {
        super(a);
        act = a;
        setFocusable(true);
        setFocusableInTouchMode(true);
        suma.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.ADD));
        casaBase = cargar("casa/base.jpg");
        for (Object[] c : CUARTOS) {
            String z = (String) c[0];
            Bitmap b = cargar(z.equals("porton") || z.equals("puerta") ? "casa/g_" + z + ".png" : "casa/l_" + z + ".jpg");
            if (b != null) capas.put(z, b);
        }
    }

    Bitmap cargar(String ruta) {
        try (InputStream in = getContext().getAssets().open(ruta)) {
            return BitmapFactory.decodeStream(in);
        } catch (Exception e) { return null; }
    }

    Bitmap foto(String zona, boolean on) {
        String k = zona + (on ? "_prendido" : "_apagado");
        Bitmap b = fotos.get(k);
        if (b == null) {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inPreferredConfig = Bitmap.Config.RGB_565;
            try (InputStream in = getContext().getAssets().open("cuartos/" + k + ".jpg")) { b = BitmapFactory.decodeStream(in, null, o); } catch (Exception ignored) { }
            if (b != null) fotos.put(k, b);
        }
        return b;
    }

    // ---------------- datos que llegan de la actividad ----------------
    void ponerEstado(String zona, boolean on) {
        Long t = esperando.get(zona);
        if (t != null && System.currentTimeMillis() < t) return;   // acaba de cambiar desde aquí
        Boolean antes = estado.put(zona, on);
        if (antes == null || antes != on) casaSucia = true;
        invalidate();
    }

    void ponerAlarma(String modo, boolean suena) {
        alarma = modo == null ? "" : modo;
        if (suena && !sonando && !pidiendoPin) irA(P_ALARMA);
        sonando = suena;
        invalidate();
    }

    void conectado() { enLinea = true; error = null; primera = false; invalidate(); }
    void sinConexion(String e) { enLinea = false; error = e; primera = false; invalidate(); }
    void aviso(String t) { avisoTxt = t; avisoHasta = System.currentTimeMillis() + 3500; invalidate(); postInvalidateDelayed(3600); }
    void listo(String zona, boolean on) { esperando.put(zona, System.currentTimeMillis() + 8000); estado.put(zona, on); casaSucia = true; invalidate(); }
    void fallo(String zona, String e) { esperando.remove(zona); aviso(e); }
    void pedirPin() { if (!pidiendoPin) { pidiendoPin = true; pinTxt = ""; invalidate(); } }
    void pinMalo() { pidiendoPin = true; pinTxt = ""; aviso("PIN incorrecto"); }
    void meVoyListo() {
        long t = System.currentTimeMillis() + 15000;
        for (Object[] c : CUARTOS) { String z = (String) c[0]; if (Boolean.TRUE.equals(estado.get(z)) && !z.equals("puerta")) { estado.put(z, false); esperando.put(z, t); } }
        alarma = "away"; casaSucia = true; invalidate();
    }

    void alternar(String zona) {
        Boolean cur = estado.get(zona);
        if (cur == null) { aviso("Ese cuarto no tiene aparato"); return; }
        boolean nuevo = !cur;
        estado.put(zona, nuevo);
        esperando.put(zona, System.currentTimeMillis() + 8000);
        casaSucia = true;
        invalidate();
        act.mandarCuarto(zona, nuevo);
    }

    // ---------------- dibujo ----------------
    @Override
    protected void onDraw(Canvas c) {
        int w = getWidth(), h = getHeight();
        c.drawColor(Color.BLACK);
        if (pidiendoPin) { dibujarPin(c, w, h); dibujarAviso(c, w, h); return; }
        c.save();
        c.translate(arrastre, 0);
        dibujarPagina(c, pagina, w, h);
        if (arrastre < 0 && pagina < PAGINAS - 1) { c.translate(w, 0); dibujarPagina(c, pagina + 1, w, h); }
        if (arrastre > 0 && pagina > 0) { c.translate(-w, 0); dibujarPagina(c, pagina - 1, w, h); }
        c.restore();
        // puntitos de página
        p.setStyle(Paint.Style.FILL);
        p.setTextAlign(Paint.Align.CENTER);
        p.setTypeface(Typeface.DEFAULT_BOLD);
        p.setTextSize(h * .042f);
        p.setColor(0x99FFFFFF);
        c.drawText((pagina + 1) + " / " + PAGINAS, w / 2f, h * .085f, p);
        if (sonando) {
            boolean on = (System.currentTimeMillis() / 400) % 2 == 0;
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(w * .04f);
            p.setColor(on ? ROJO : 0x66FF3B3B);
            c.drawCircle(w / 2f, h / 2f, w / 2f - w * .02f, p);
            postInvalidateDelayed(400);
        }
        dibujarAviso(c, w, h);
    }

    void dibujarPagina(Canvas c, int i, int w, int h) {
        if (i == P_CASA) dibujarCasa(c, w, h);
        else if (i == P_FACHADA) dibujarFachada(c, w, h);
        else if (i == P_ALARMA) dibujarAlarma(c, w, h);
        else if (i == P_MEVOY) dibujarMeVoy(c, w, h);
        else dibujarCuarto(c, i - P_CUARTO1, w, h);
    }

    void texto(Canvas c, String t, float x, float y, float tam, int color, boolean negrita) {
        p.setStyle(Paint.Style.FILL);
        p.setTextAlign(Paint.Align.CENTER);
        p.setTypeface(negrita ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        p.setTextSize(tam);
        p.setColor(color);
        c.drawText(t, x, y, p);
    }

    void pastilla(Canvas c, String t, float cx, float cy, float tam, int fondo, int tinta) {
        p.setTypeface(Typeface.DEFAULT_BOLD);
        p.setTextSize(tam);
        float tw = p.measureText(t);
        RectF r = new RectF(cx - tw / 2 - tam * .9f, cy - tam * 1.05f, cx + tw / 2 + tam * .9f, cy + tam * .55f);
        p.setStyle(Paint.Style.FILL);
        p.setColor(fondo);
        c.drawRoundRect(r, tam, tam, p);
        texto(c, t, cx, cy, tam, tinta, true);
    }

    void componerCasa() {
        if (casaBase == null) return;
        if (casaHecha == null) casaHecha = Bitmap.createBitmap(casaBase.getWidth(), casaBase.getHeight(), Bitmap.Config.ARGB_8888);
        Canvas k = new Canvas(casaHecha);
        k.drawBitmap(casaBase, 0, 0, null);
        for (Object[] cu : CUARTOS) {
            String z = (String) cu[0];
            Bitmap capa = capas.get(z);
            if (capa == null || !Boolean.TRUE.equals(estado.get(z))) continue;
            k.drawBitmap(capa, 0, 0, z.equals("porton") || z.equals("puerta") ? null : suma);
        }
        casaSucia = false;
    }

    int lucesPrendidas() {
        int n = 0;
        for (Object[] cu : CUARTOS) { String z = (String) cu[0]; if (!z.equals("porton") && !z.equals("puerta") && Boolean.TRUE.equals(estado.get(z))) n++; }
        return n;
    }

    void dibujarCasa(Canvas c, int w, int h) {
        if (casaSucia) componerCasa();
        texto(c, "Mi Casa", w / 2f, h * .2f, h * .07f, TINTA, true);
        if (casaHecha != null) {
            float cw = w * .94f, ch = cw * casaHecha.getHeight() / casaHecha.getWidth();
            casaRect.set((w - cw) / 2f, h * .44f - ch / 2f, (w + cw) / 2f, h * .44f + ch / 2f);
            c.drawBitmap(casaHecha, null, casaRect, img);
        }
        int n = lucesPrendidas();
        texto(c, n == 0 ? "Luces apagadas" : n == 1 ? "1 luz prendida" : n + " luces prendidas", w / 2f, h * .66f, h * .058f, n > 0 ? AMBAR : GRIS, true);
        Boolean pt = estado.get("porton");
        texto(c, "Portón " + (pt == null ? "--" : pt ? "abierto" : "cerrado") + " · Alarma " + nombreAlarma(), w / 2f, h * .745f, h * .043f, Boolean.TRUE.equals(pt) ? NARANJA : GRIS, false);
        String pie = primera ? "Conectando…" : !enLinea ? (error != null ? error : "Sin conexión") : "Toca un cuarto · desliza ›";
        texto(c, pie, w / 2f, h * .84f, h * .04f, enLinea ? 0x88FFFFFF : NARANJA, false);
    }

    String nombreAlarma() {
        if (sonando) return "¡sonando!";
        switch (alarma) {
            case "away": return "armada";
            case "stay": return "en casa";
            case "disarm": return "desarmada";
            default: return "--";
        }
    }

    void dibujarCuarto(Canvas c, int idx, int w, int h) {
        String z = (String) CUARTOS[idx][0], nombre = (String) CUARTOS[idx][1];
        Boolean on = estado.get(z);
        boolean prendido = Boolean.TRUE.equals(on);
        Bitmap b = foto(z, prendido);
        if (b != null) c.drawBitmap(b, null, new Rect(0, 0, w, h), img);
        p.setStyle(Paint.Style.FILL);
        p.setShader(new LinearGradient(0, h * .35f, 0, h, 0x00000000, 0xF0000000, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        p.setShader(null);
        if (!prendido) { p.setColor(0x55000000); c.drawRect(0, 0, w, h, p); }
        boolean puerta = z.equals("porton") || z.equals("puerta");
        if (prendido) {
            p.setStyle(Paint.Style.STROKE);
            p.setColor(puerta ? NARANJA : AMBAR);
            p.setStrokeWidth(w * .025f);
            c.drawCircle(w / 2f, h / 2f, w / 2f - w * .015f, p);
            p.setStrokeWidth(w * .06f);
            p.setAlpha(60);
            c.drawCircle(w / 2f, h / 2f, w / 2f - w * .035f, p);
            p.setAlpha(255);
        }
        float tam = nombre.length() > 14 ? h * .075f : h * .095f;
        texto(c, nombre, w / 2f, h * .7f, tam, Color.WHITE, true);
        String est;
        if (on == null) est = "SIN APARATO";
        else if (z.equals("porton")) est = prendido ? "ABIERTO" : "CERRADO";
        else if (z.equals("puerta")) est = prendido ? "ABIERTA" : "CERRADA";
        else if (z.equals("spots")) est = prendido ? "PRENDIDOS" : "APAGADOS";
        else est = prendido ? "PRENDIDA" : "APAGADA";
        int fondo = on == null ? 0x33FFFFFF : prendido ? (puerta ? NARANJA : AMBAR) : 0x44FFFFFF;
        pastilla(c, est, w / 2f, h * .82f, h * .045f, fondo, prendido ? 0xFF2A1D0C : Color.WHITE);
    }

    int colorAlarma() {
        if (sonando) return ROJO;
        switch (alarma) { case "away": return NARANJA; case "stay": return AMBAR; case "disarm": return VERDE; default: return GRIS; }
    }

    void dibujarAlarma(Canvas c, int w, int h) {
        int col = colorAlarma();
        p.setStyle(Paint.Style.FILL);
        p.setColor(col);
        p.setAlpha(40);
        c.drawCircle(w / 2f, h * .4f, w * .2f, p);
        p.setAlpha(255);
        // escudo
        float cx = w / 2f, cy = h * .4f, s = w * .13f;
        android.graphics.Path esc = new android.graphics.Path();
        esc.moveTo(cx, cy - s);
        esc.lineTo(cx + s * .85f, cy - s * .65f);
        esc.lineTo(cx + s * .85f, cy + s * .05f);
        esc.quadTo(cx + s * .75f, cy + s * .8f, cx, cy + s * 1.05f);
        esc.quadTo(cx - s * .75f, cy + s * .8f, cx - s * .85f, cy + s * .05f);
        esc.lineTo(cx - s * .85f, cy - s * .65f);
        esc.close();
        c.drawPath(esc, p);
        texto(c, "Alarma", w / 2f, h * .17f, h * .055f, GRIS, true);
        String est = sonando ? "¡SONANDO!" : alarma.equals("away") ? "Armada · Fuera" : alarma.equals("stay") ? "Armada · En casa" : alarma.equals("disarm") ? "Desarmada" : "Sin dato";
        texto(c, est, w / 2f, h * .68f, h * .075f, col, true);
        boolean armada = sonando || alarma.equals("away") || alarma.equals("stay");
        String pie = confirmando(P_ALARMA) ? (armada ? "Toca otra vez para DESARMAR" : "Toca otra vez para ARMAR") : (armada ? "Dos toques: desarmar" : "Dos toques: armar (Fuera)");
        texto(c, pie, w / 2f, h * .8f, h * .045f, confirmando(P_ALARMA) ? Color.WHITE : 0x99FFFFFF, confirmando(P_ALARMA));
    }

    void dibujarMeVoy(Canvas c, int w, int h) {
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xFFFF8F70);
        c.drawCircle(w / 2f, h * .42f, w * .2f, p);
        // puerta con flecha
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(w * .02f);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(0xFF2A0F06);
        float cx = w / 2f, cy = h * .42f, s = w * .08f;
        c.drawLine(cx + s * .2f, cy - s, cx + s, cy - s, p);
        c.drawLine(cx + s, cy - s, cx + s, cy + s, p);
        c.drawLine(cx + s, cy + s, cx + s * .2f, cy + s, p);
        c.drawLine(cx - s, cy, cx + s * .45f, cy, p);
        c.drawLine(cx - s, cy, cx - s * .5f, cy - s * .5f, p);
        c.drawLine(cx - s, cy, cx - s * .5f, cy + s * .5f, p);
        texto(c, "Me voy", w / 2f, h * .76f, h * .085f, Color.WHITE, true);
        texto(c, confirmando(P_MEVOY) ? "Toca otra vez para confirmar" : "Apaga luces, cierra y arma", w / 2f, h * .84f, h * .043f, confirmando(P_MEVOY) ? Color.WHITE : 0x99FFFFFF, confirmando(P_MEVOY));
    }

    // ---------------- fachada: foto de día o de noche, con el portón como esté ----------------
    final RectF fachRect = new RectF();
    Bitmap fotoFachada(String n) {
        String k = "f_" + n;
        Bitmap b = fotos.get(k);
        if (b == null) {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inPreferredConfig = Bitmap.Config.RGB_565;
            try (InputStream in = getContext().getAssets().open("fachada/" + n + ".jpg")) { b = BitmapFactory.decodeStream(in, null, o); } catch (Exception ignored) { }
            if (b != null) fotos.put(k, b);
        }
        return b;
    }

    void dibujarFachada(Canvas c, int w, int h) {
        int hora = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY);
        boolean dia = hora >= 7 && hora < 18;
        boolean abierto = Boolean.TRUE.equals(estado.get("porton"));
        boolean spots = Boolean.TRUE.equals(estado.get("spots"));
        String n = (dia ? "dia" : "noche") + (abierto ? "_a" : "") + (!dia && !spots ? "_off" : "");
        Bitmap b = fotoFachada(n);
        texto(c, "Fachada", w / 2f, h * .2f, h * .06f, TINTA, true);
        if (b != null) {
            float fw = w * .96f, fh = fw * b.getHeight() / b.getWidth();
            fachRect.set((w - fw) / 2f, h * .47f - fh / 2f, (w + fw) / 2f, h * .47f + fh / 2f);
            c.drawBitmap(b, null, fachRect, img);
        }
        texto(c, "Portón " + (abierto ? "abierto" : "cerrado") + " · Spots " + (spots ? "prendidos" : "apagados"), w / 2f, h * .8f, h * .042f, abierto ? NARANJA : GRIS, true);
        texto(c, "Toca el portón, la puerta o el muro", w / 2f, h * .87f, h * .038f, 0x88FFFFFF, false);
    }

    void dibujarAviso(Canvas c, int w, int h) {
        if (avisoTxt == null || System.currentTimeMillis() > avisoHasta) return;
        p.setTextSize(h * .045f);
        p.setTypeface(Typeface.DEFAULT_BOLD);
        float tw = Math.min(w * .8f, p.measureText(avisoTxt));
        RectF r = new RectF(w / 2f - tw / 2 - 18, h * .5f - h * .06f, w / 2f + tw / 2 + 18, h * .5f + h * .04f);
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xEE0B1424);
        c.drawRoundRect(r, 30, 30, p);
        texto(c, avisoTxt, w / 2f, h * .5f + h * .005f, h * .045f, Color.WHITE, true);
    }

    void dibujarPin(Canvas c, int w, int h) {
        texto(c, "PIN de Mi Casa", w / 2f, h * .17f, h * .05f, GRIS, true);
        StringBuilder pts = new StringBuilder();
        for (int i = 0; i < pinTxt.length(); i++) pts.append("● ");
        texto(c, pinTxt.isEmpty() ? "—" : pts.toString().trim(), w / 2f, h * .27f, h * .06f, TINTA, true);
        String[] et = {"1", "2", "3", "4", "5", "6", "7", "8", "9", "←", "0", "OK"};
        float cw = w * .2f, ch = h * .135f, x0 = w / 2f - cw * 1.5f, y0 = h * .32f;
        for (int i = 0; i < 12; i++) {
            float x = x0 + (i % 3) * cw, y = y0 + (i / 3) * ch;
            teclas[i] = new RectF(x + 4, y + 4, x + cw - 4, y + ch - 4);
            p.setStyle(Paint.Style.FILL);
            p.setColor(i == 11 ? 0xFF5AA2FF : 0xFF15243E);
            c.drawRoundRect(teclas[i], 22, 22, p);
            texto(c, et[i], teclas[i].centerX(), teclas[i].centerY() + h * .02f, h * .055f, i == 11 ? 0xFF071226 : TINTA, true);
        }
    }

    // ---------------- toques, deslizar y bisel ----------------
    boolean confirmando(int pag) { return confirmarPagina == pag && System.currentTimeMillis() < confirmarHasta; }

    void irA(int nueva) {
        nueva = Math.max(0, Math.min(PAGINAS - 1, nueva));
        if (anim != null) anim.cancel();
        pagina = nueva;
        arrastre = 0;
        invalidate();
    }

    void animarA(int dir) {
        final int destino = Math.max(0, Math.min(PAGINAS - 1, pagina + dir));
        if (destino == pagina) dir = 0;
        final float desde = arrastre, hasta = dir == 0 ? 0 : -dir * getWidth();
        final int d = dir;
        if (anim != null) anim.cancel();
        anim = ValueAnimator.ofFloat(0, 1);
        anim.setDuration(220);
        anim.setInterpolator(new DecelerateInterpolator());
        anim.addUpdateListener(a -> {
            float f = (float) a.getAnimatedValue();
            arrastre = desde + (hasta - desde) * f;
            if (f >= 1f) { if (d != 0) pagina = destino; arrastre = 0; }
            invalidate();
        });
        anim.start();
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        if (pidiendoPin) { if (e.getAction() == MotionEvent.ACTION_UP) tocarPin(e.getX(), e.getY()); return true; }
        if (vt == null) vt = VelocityTracker.obtain();
        vt.addMovement(e);
        int slop = ViewConfiguration.get(getContext()).getScaledTouchSlop();
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                if (anim != null) anim.cancel();
                arrastre = 0; xIni = e.getX(); yIni = e.getY(); moviendo = false;
                return true;
            case MotionEvent.ACTION_MOVE:
                float dx = e.getX() - xIni;
                if (!moviendo && Math.abs(dx) > slop) moviendo = true;
                if (moviendo) {
                    if ((pagina == 0 && dx > 0) || (pagina == PAGINAS - 1 && dx < 0)) dx *= .3f;
                    arrastre = dx;
                    invalidate();
                }
                return true;
            case MotionEvent.ACTION_UP:
                vt.computeCurrentVelocity(1000);
                float v = vt.getXVelocity();
                vt.recycle(); vt = null;
                if (moviendo) {
                    int dir = 0;
                    if (arrastre < -getWidth() * .22f || v < -900) dir = 1;
                    else if (arrastre > getWidth() * .22f || v > 900) dir = -1;
                    animarA(dir);
                } else tocar(e.getX(), e.getY());
                return true;
            case MotionEvent.ACTION_CANCEL:
                if (vt != null) { vt.recycle(); vt = null; }
                animarA(0);
                return true;
        }
        return super.onTouchEvent(e);
    }

    void tocar(float x, float y) {
        if (pagina == P_CASA) {
            if (casaHecha != null && casaRect.contains(x, y)) {
                float px = (x - casaRect.left) / casaRect.width() * 100f, py = (y - casaRect.top) / casaRect.height() * 100f;
                String mejor = null; double area = 1e9;
                for (Object[] cu : CUARTOS) {
                    double zx = ((Number) cu[2]).doubleValue(), zy = ((Number) cu[3]).doubleValue(), zw = ((Number) cu[4]).doubleValue(), zh = ((Number) cu[5]).doubleValue();
                    if (px >= zx && px <= zx + zw && py >= zy && py <= zy + zh && zw * zh < area) { area = zw * zh; mejor = (String) cu[0]; }
                }
                if (mejor != null) { alternar(mejor); return; }
            }
            animarA(1);
            return;
        }
        if (pagina == P_FACHADA) {
            if (fachRect.contains(x, y)) {
                float px = (x - fachRect.left) / fachRect.width() * 100f, py = (y - fachRect.top) / fachRect.height() * 100f;
                if (px >= 55 && px <= 92 && py >= 40 && py <= 78) { alternar("porton"); return; }
                if (px >= 40 && px <= 51 && py >= 39 && py <= 78) { alternar("puerta"); return; }
                if (px >= 5 && px <= 34 && py >= 34 && py <= 73) { alternar("spots"); return; }
            }
            return;
        }
        if (pagina == P_ALARMA) {
            boolean armada = sonando || alarma.equals("away") || alarma.equals("stay");
            if (confirmando(P_ALARMA)) { confirmarPagina = -1; act.mandarAlarma(armada ? "disarm" : "away"); }
            else { confirmarPagina = P_ALARMA; confirmarHasta = System.currentTimeMillis() + 3000; postInvalidateDelayed(3100); }
            invalidate();
            return;
        }
        if (pagina == P_MEVOY) {
            if (confirmando(P_MEVOY)) { confirmarPagina = -1; act.meVoy(); }
            else { confirmarPagina = P_MEVOY; confirmarHasta = System.currentTimeMillis() + 3000; postInvalidateDelayed(3100); }
            invalidate();
            return;
        }
        alternar((String) CUARTOS[pagina - P_CUARTO1][0]);
    }

    void tocarPin(float x, float y) {
        for (int i = 0; i < 12; i++) {
            if (teclas[i] == null || !teclas[i].contains(x, y)) continue;
            if (i == 9) { if (!pinTxt.isEmpty()) pinTxt = pinTxt.substring(0, pinTxt.length() - 1); }
            else if (i == 11) { if (!pinTxt.isEmpty()) { pidiendoPin = false; act.guardarPin(pinTxt); aviso("Conectando…"); } }
            else if (pinTxt.length() < 12) pinTxt += (i == 10 ? "0" : String.valueOf(i + 1));
            invalidate();
            return;
        }
    }

    // Bisel táctil del Galaxy Watch (girar el dedo en la orilla) o corona: pasa de pantalla en pantalla
    boolean girarBisel(MotionEvent e) {
        if (e.getAction() != MotionEvent.ACTION_SCROLL || !e.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER) || pidiendoPin) return false;
        float v = -e.getAxisValue(MotionEvent.AXIS_SCROLL);
        if (Math.abs(v) < 0.001f) v = -e.getAxisValue(MotionEvent.AXIS_VSCROLL);
        giro += v;
        if (Math.abs(giro) >= 0.5f) {
            int dir = giro > 0 ? 1 : -1;
            giro = 0;
            int destino = Math.max(0, Math.min(PAGINAS - 1, pagina + dir));
            if (destino != pagina) { performHapticFeedback(android.view.HapticFeedbackConstants.CLOCK_TICK); irA(destino); }
        }
        return true;
    }

    @Override
    public boolean onGenericMotionEvent(MotionEvent e) {
        // Bisel o corona del reloj
        if (girarBisel(e)) return true;
        return super.onGenericMotionEvent(e);
    }
}
