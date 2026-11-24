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
 *   casa 3D · fachada · cámaras en vivo · alarma · modo de la casa
 *   una tarjeta por cuarto con su foto (tocar = prender/apagar, abrir/cerrar)
 *   "Llegando" y "Me voy" (dos toques)
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
    // Orden: casa 3D, fachada, cámaras, tele, alarma y modo primero; luego los cuartos y al final Llegando y Me voy
    static final int P_CASA = 0, P_VOZ = 1, P_FACHADA = 2, P_CAM = 3, P_TELE = 4, P_RADAR = 5, P_ALARMA = 6, P_MODO = 7, P_CUARTO1 = 8,
        P_LLEGANDO = N + 8, P_MEVOY = N + 9, P_FUNC = N + 10, PAGINAS = N + 11;

    // Voz
    String vozDije = null, vozResp = null;
    boolean vozOk = true, vozEsperando = false;

    // Radar: sensores (mismas posiciones que en la app, en % de la casa) y cuándo detectaron algo
    static final Object[][] SENS = {
        {"sen_puerta", "Puerta", 11.4f, 41f, true}, {"sen_patio", "Patio", 76.5f, 44f, true},
        {"mov_bano", "Baño", 47f, 32.5f, false}, {"mov_pasillo", "Pasillo", 57f, 33.5f, false}};
    final Map<String, Long> movT = new HashMap<>();
    String personaCam = null; long personaT = 0; String personaQuien = "";

    // Perilla: mantener presionado un cuarto y girar el bisel para el brillo
    String perilla = null; int perillaPct = 50; long perillaT = 0;
    final Map<String, Integer> brillo = new HashMap<>();
    final Runnable largo = new Runnable() { @Override public void run() {
        if (moviendo || pagina < P_CUARTO1 || pagina >= P_LLEGANDO) return;
        String z = (String) CUARTOS[pagina - P_CUARTO1][0];
        if (z.equals("porton") || z.equals("puerta")) return;
        perilla = z; perillaPct = brillo.containsKey(z) ? brillo.get(z) : 50; perillaT = System.currentTimeMillis(); largoUsado = true;
        act.vibrar(new long[]{0, 40}); invalidate(); postDelayed(cierraPerilla, 4500);
    } };
    boolean largoUsado = false;
    final Runnable cierraPerilla = new Runnable() { @Override public void run() {
        if (perilla == null) return;
        if (System.currentTimeMillis() - perillaT >= 4000) { perilla = null; invalidate(); } else postDelayed(this, 600);
    } };
    final Runnable mandaPerilla = new Runnable() { @Override public void run() { if (perilla != null) { brillo.put(perilla, perillaPct); act.mandarBrillo(perilla, perillaPct); } } };

    // Funciones del reloj (se guardan en el reloj)
    static final String[][] FUNCS = {{"f_llegada", "Aviso al llegar (GPS)"}, {"f_casa", "Guardar mi casa aquí"}, {"f_dormir", "Modo dormir"}};

    // Control de la tele (Samsung por SmartThings): botón -> comando, y dónde está en la pantalla (en % del reloj)
    static final Object[][] TELE = {
        {"pow", "", .50f, .40f, .135f}, {"vol_up", "+", .19f, .40f, .095f}, {"vol_down", "−", .19f, .63f, .095f},
        {"ch_up", "▲", .81f, .40f, .095f}, {"ch_down", "▼", .81f, .63f, .095f}, {"MUTE", "Mudo", .50f, .66f, .085f},
        {"HOME", "Inicio", .36f, .84f, .075f}, {"BACK", "Atrás", .64f, .84f, .075f}};
    boolean teleOn = false;
    int teleToque = -1;
    long teleToqueT = 0;

    // Cámaras que se ven en el reloj (nombre del stream en la Raspberry, nombre bonito)
    static final String[][] CAMS = {{"cam1", "Derecha"}, {"cochera", "Cochera"}};
    int cam = 0;
    Bitmap camFoto;
    long camHora = 0;
    String camError = null;

    // Modo de la casa (lo mismo que en la app)
    static final String[] MODOS_ID = {"auto", "casa", "fuera", "noche", "vacaciones", "nomolestar"};
    static final String[] MODOS_NOM = {"Automático", "En casa", "Fuera", "Noche", "Vacaciones", "No molestar"};
    String modoSel = null, modoNom = null, modoPor = null;
    long modoLeido = 0;

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
        if (zona.startsWith("mov_") && on) movT.put(zona, System.currentTimeMillis());
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
        if (perilla != null) dibujarPerilla(c, w, h);
        dibujarAviso(c, w, h);
    }

    void dibujarPagina(Canvas c, int i, int w, int h) {
        if (i == P_CASA) dibujarCasa(c, w, h);
        else if (i == P_FACHADA) dibujarFachada(c, w, h);
        else if (i == P_CAM) dibujarCam(c, w, h);
        else if (i == P_TELE) dibujarTele(c, w, h);
        else if (i == P_VOZ) dibujarVoz(c, w, h);
        else if (i == P_RADAR) dibujarRadar(c, w, h);
        else if (i == P_FUNC) dibujarFunc(c, w, h);
        else if (i == P_ALARMA) dibujarAlarma(c, w, h);
        else if (i == P_MODO) dibujarModo(c, w, h);
        else if (i == P_LLEGANDO) dibujarLlegando(c, w, h);
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

    // Mismos colores que la app: verde desarmada, azul en casa, rojo fuera
    static final int AZUL = 0xFF5AA2FF, ROJO_FUERA = 0xFFFF4D4D;
    int colorAlarma() {
        if (sonando) return ROJO;
        switch (alarma) { case "away": return ROJO_FUERA; case "stay": return AZUL; case "disarm": return VERDE; default: return GRIS; }
    }

    void dibujarAlarma(Canvas c, int w, int h) {
        int col = colorAlarma();
        long ahora = System.currentTimeMillis();
        boolean parpadeo = sonando && (ahora / 500) % 2 == 0;
        // Anillo que respira (rápido si está sonando)
        double ritmo = sonando ? 250.0 : 520.0;
        float b = (float) (0.5 + 0.5 * Math.sin(ahora / ritmo));
        p.setStyle(Paint.Style.FILL);
        p.setColor(col);
        p.setAlpha(sonando ? (parpadeo ? 90 : 30) : 34);
        c.drawCircle(w / 2f, h * .4f, w * .2f, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(w * .012f);
        p.setAlpha((int) (60 + 150 * b));
        c.drawCircle(w / 2f, h * .4f, w * (.205f + .025f * b), p);
        p.setAlpha((int) (40 + 90 * (1 - b)));
        c.drawCircle(w / 2f, h * .4f, w * (.165f + .015f * (1 - b)), p);
        p.setStyle(Paint.Style.FILL);
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
        texto(c, est, w / 2f, h * .66f, h * .075f, col, true);
        boolean armada = sonando || alarma.equals("away") || alarma.equals("stay");
        String pie = confirmando(P_ALARMA) ? (armada ? "Toca otra vez para DESARMAR" : "Toca otra vez para ARMAR") : (armada ? "Dos toques: desarmar" : "Dos toques: armar (Fuera)");
        texto(c, pie, w / 2f, h * .755f, h * .042f, confirmando(P_ALARMA) ? Color.WHITE : 0x99FFFFFF, confirmando(P_ALARMA));
        // Mientras se ve esta pantalla, el anillo sigue respirando
        if (pagina == P_ALARMA && arrastre == 0) postInvalidateDelayed(60);
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

    // ---------------- cámaras en vivo (una foto cada segundo desde la Raspberry) ----------------
    void ponerFoto(Bitmap b) { if (b != null) { camFoto = b; camHora = System.currentTimeMillis(); camError = null; } invalidate(); }
    void errorFoto(String e) { camError = e; invalidate(); }

    void dibujarCam(Canvas c, int w, int h) {
        texto(c, "Cámara " + CAMS[cam][1], w / 2f, h * .2f, h * .06f, TINTA, true);
        float fw = w * .98f, fh = fw * 9f / 16f;
        if (camFoto != null) fh = fw * camFoto.getHeight() / camFoto.getWidth();
        RectF r = new RectF((w - fw) / 2f, h * .5f - fh / 2f, (w + fw) / 2f, h * .5f + fh / 2f);
        if (camFoto != null) c.drawBitmap(camFoto, null, r, img);
        else {
            p.setStyle(Paint.Style.FILL);
            p.setColor(0xFF101A2C);
            c.drawRect(r, p);
            texto(c, camError != null ? camError : "Cargando…", w / 2f, h * .51f, h * .045f, camError != null ? NARANJA : GRIS, false);
        }
        long edad = camHora == 0 ? 0 : System.currentTimeMillis() - camHora;
        boolean vivo = camFoto != null && edad < 5000;
        String est = camFoto == null ? "" : vivo ? "● EN VIVO" : "Pausada · hace " + (edad / 1000) + " s";
        if (!est.isEmpty()) texto(c, est, w / 2f, h * .5f + fh / 2f + h * .065f, h * .042f, vivo ? ROJO : GRIS, true);
        // puntitos de cuál cámara
        float y = h * .86f;
        for (int i = 0; i < CAMS.length; i++) {
            p.setStyle(Paint.Style.FILL);
            p.setColor(i == cam ? TINTA : 0x55FFFFFF);
            c.drawCircle(w / 2f + (i - (CAMS.length - 1) / 2f) * w * .05f, y, w * .012f, p);
        }
        texto(c, "Toca para cambiar", w / 2f, h * .925f, h * .036f, 0x88FFFFFF, false);
    }

    // ---------------- voz ----------------
    void ponerVoz(String dije, String resp, boolean ok) { vozDije = dije; vozResp = resp; vozOk = ok; vozEsperando = false; invalidate(); }
    void vozMandando(String dije) { vozDije = dije; vozResp = null; vozEsperando = true; invalidate(); }

    void dibujarVoz(Canvas c, int w, int h) {
        texto(c, "Háblale a tu casa", w / 2f, h * .19f, h * .05f, GRIS, true);
        float cx = w / 2f, cy = h * .42f, r = w * .15f;
        p.setStyle(Paint.Style.FILL);
        p.setColor(vozEsperando ? 0xFF2F7DF6 : 0xFF1C2436);
        c.drawCircle(cx, cy, r, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(w * .012f); p.setColor(0x552F7DF6);
        c.drawCircle(cx, cy, r * 1.22f, p);
        // micrófono
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(w * .016f); p.setStrokeCap(Paint.Cap.ROUND); p.setColor(Color.WHITE);
        float m = r * .32f;
        c.drawRoundRect(new RectF(cx - m * .55f, cy - m * 1.3f, cx + m * .55f, cy + m * .35f), m * .55f, m * .55f, p);
        c.drawArc(new RectF(cx - m, cy - m * .9f, cx + m, cy + m * .9f), 20, 140, false, p);
        c.drawLine(cx, cy + m * .9f, cx, cy + m * 1.35f, p);
        if (vozDije != null) texto(c, "“" + corta(vozDije, 26) + "”", w / 2f, h * .66f, h * .042f, 0xCCFFFFFF, false);
        String r2 = vozEsperando ? "Haciéndolo…" : vozResp != null ? vozResp : "Toca y di: “apaga la sala”";
        String[] ls = partir(r2, 24);
        for (int i = 0; i < Math.min(ls.length, 3); i++)
            texto(c, ls[i], w / 2f, h * (.75f + i * .06f), h * .045f, vozResp == null || vozEsperando ? 0x99FFFFFF : vozOk ? VERDE : NARANJA, vozResp != null);
    }
    static String corta(String t, int n) { return t.length() > n ? t.substring(0, n - 1) + "…" : t; }
    static String[] partir(String t, int n) {
        java.util.List<String> out = new java.util.ArrayList<>(); StringBuilder l = new StringBuilder();
        for (String pal : t.split(" ")) { if (l.length() + pal.length() + 1 > n && l.length() > 0) { out.add(l.toString()); l = new StringBuilder(); } if (l.length() > 0) l.append(' '); l.append(pal); }
        if (l.length() > 0) out.add(l.toString());
        return out.toArray(new String[0]);
    }

    // ---------------- radar de la casa ----------------
    void ponerPersona(String cam, String quien, long ts) { personaCam = cam; personaQuien = quien == null ? "" : quien; personaT = ts; invalidate(); }

    void dibujarRadar(Canvas c, int w, int h) {
        long ahora = System.currentTimeMillis();
        texto(c, "Radar", w / 2f, h * .17f, h * .055f, VERDE, true);
        if (casaSucia) componerCasa();
        RectF r = new RectF();
        if (casaBase != null) {
            float cw = w * .94f, ch = cw * casaBase.getHeight() / casaBase.getWidth();
            r.set((w - cw) / 2f, h * .46f - ch / 2f, (w + cw) / 2f, h * .46f + ch / 2f);
            img.setAlpha(90); c.drawBitmap(casaBase, null, r, img); img.setAlpha(255);
            // tinte verde de radar
            p.setStyle(Paint.Style.FILL); p.setColor(0x2200FF88); c.drawRect(r, p);
        }
        // barrido
        float ang = (ahora % 3000) / 3000f * 360f;
        p.setStyle(Paint.Style.FILL);
        p.setShader(new android.graphics.SweepGradient(w / 2f, h / 2f, new int[]{0x0000FF88, 0x0000FF88, 0x5500FF88}, new float[]{0f, .8f, 1f}));
        c.save(); c.rotate(ang, w / 2f, h / 2f); c.drawCircle(w / 2f, h / 2f, w / 2f, p); c.restore();
        p.setShader(null);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.5f); p.setColor(0x3300FF88);
        for (int i = 1; i <= 3; i++) c.drawCircle(w / 2f, h / 2f, w / 2f * i / 3.2f, p);
        int activos = 0;
        for (Object[] sd : SENS) {
            String id = (String) sd[0]; boolean puerta = (Boolean) sd[4];
            float x = r.left + r.width() * (Float) sd[2] / 100f, y = r.top + r.height() * (Float) sd[3] / 100f;
            if (puerta) {
                boolean abierta = Boolean.TRUE.equals(estado.get(id));
                p.setStyle(Paint.Style.FILL); p.setColor(abierta ? ROJO : 0x6600FF88);
                c.drawRoundRect(new RectF(x - w * .018f, y - w * .03f, x + w * .018f, y + w * .03f), 4, 4, p);
                if (abierta) { activos++; texto(c, sd[1] + " abierta", x, y - w * .045f, h * .032f, ROJO, true); }
            } else {
                Long t = movT.get(id);
                float edad = t == null ? 1e9f : (ahora - t) / 1000f;
                if (Boolean.TRUE.equals(estado.get(id))) edad = 0;
                if (edad < 90) {
                    activos++;
                    float f = 1f - edad / 90f, pulso = (ahora % 1200) / 1200f;
                    p.setStyle(Paint.Style.FILL); p.setColor(Color.argb((int) (220 * f), 255, 214, 80)); c.drawCircle(x, y, w * .02f, p);
                    p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(3); p.setColor(Color.argb((int) (200 * f * (1 - pulso)), 255, 214, 80)); c.drawCircle(x, y, w * (.02f + .06f * pulso), p);
                } else { p.setStyle(Paint.Style.FILL); p.setColor(0x5500FF88); c.drawCircle(x, y, w * .012f, p); }
            }
        }
        // persona que vio una cámara (últimos 3 min)
        if (personaCam != null && ahora - personaT < 180000) {
            activos++;
            float px = personaCam.contains("cochera") ? 21f : personaCam.contains("izq") ? 30f : 6f, py = personaCam.contains("cochera") ? 68f : 60f;
            float x = r.left + r.width() * px / 100f, y = r.top + r.height() * py / 100f, pulso = (ahora % 900) / 900f;
            p.setStyle(Paint.Style.FILL); p.setColor(0xFF5AA2FF); c.drawCircle(x, y, w * .022f, p);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(3); p.setColor(Color.argb((int) (220 * (1 - pulso)), 90, 162, 255)); c.drawCircle(x, y, w * (.022f + .07f * pulso), p);
            long min = (ahora - personaT) / 60000;
            texto(c, (personaQuien.isEmpty() ? "Persona" : personaQuien) + " · " + (min < 1 ? "ahorita" : "hace " + min + " min"), w / 2f, h * .76f, h * .04f, AZUL, true);
        }
        texto(c, activos == 0 ? "Todo tranquilo" : activos + (activos == 1 ? " cosa con movimiento" : " cosas con movimiento"), w / 2f, h * .84f, h * .04f, activos == 0 ? 0x99FFFFFF : AMBAR, activos > 0);
        if (pagina == P_RADAR) postInvalidateDelayed(50);
    }

    // ---------------- perilla de brillo ----------------
    void dibujarPerilla(Canvas c, int w, int h) {
        p.setStyle(Paint.Style.FILL); p.setColor(0xCC000000); c.drawCircle(w / 2f, h / 2f, w / 2f, p);
        float m = w * .06f;
        RectF a = new RectF(m, m, w - m, h - m);
        p.setStyle(Paint.Style.STROKE); p.setStrokeCap(Paint.Cap.ROUND); p.setStrokeWidth(w * .045f);
        p.setColor(0x33FFC15E); c.drawArc(a, 135, 270, false, p);
        p.setColor(AMBAR); c.drawArc(a, 135, 270 * perillaPct / 100f, false, p);
        String nom = perilla;
        for (Object[] cu : CUARTOS) if (cu[0].equals(perilla)) nom = (String) cu[1];
        texto(c, nom, w / 2f, h * .36f, h * .05f, GRIS, true);
        texto(c, perillaPct + "%", w / 2f, h * .56f, h * .16f, AMBAR, true);
        texto(c, "Gira el bisel", w / 2f, h * .68f, h * .04f, 0x99FFFFFF, false);
    }

    // ---------------- funciones del reloj ----------------
    void dibujarFunc(Canvas c, int w, int h) {
        texto(c, "Funciones del reloj", w / 2f, h * .19f, h * .05f, GRIS, true);
        for (int i = 0; i < FUNCS.length; i++) {
            float y = h * (.33f + i * .17f);
            RectF r = new RectF(w * .1f, y - h * .065f, w * .9f, y + h * .065f);
            boolean on = act.prefs.getBoolean(FUNCS[i][0], false);
            boolean boton = FUNCS[i][0].equals("f_casa");
            p.setStyle(Paint.Style.FILL); p.setColor(boton ? 0xFF1C2436 : on ? 0xFF15402E : 0xFF1C2436);
            c.drawRoundRect(r, h * .065f, h * .065f, p);
            String sub = boton ? (act.prefs.contains("casa_lat") ? "Guardada ✓ (toca para cambiarla)" : "Párate en tu casa y toca")
                : (on ? "Prendido" : "Apagado");
            texto(c, FUNCS[i][1], w / 2f, y - h * .005f, h * .042f, TINTA, true);
            texto(c, sub, w / 2f, y + h * .04f, h * .032f, boton ? 0x99FFFFFF : on ? VERDE : 0x88FFFFFF, false);
        }
        texto(c, "El timbre llega por el teléfono", w / 2f, h * .86f, h * .032f, 0x77FFFFFF, false);
    }
    boolean tocarFunc(float x, float y) {
        int h = getHeight();
        for (int i = 0; i < FUNCS.length; i++) {
            float fy = h * (.33f + i * .17f);
            if (Math.abs(y - fy) < h * .075f) { act.cambiarFuncion(FUNCS[i][0]); invalidate(); return true; }
        }
        return false;
    }

    // ---------------- control de la tele ----------------
    void ponerTele(boolean on) { teleOn = on; invalidate(); }

    void dibujarTele(Canvas c, int w, int h) {
        texto(c, teleOn ? "Tele · encendida" : "Tele", w / 2f, h * .17f, h * .055f, teleOn ? AZUL : TINTA, true);
        texto(c, "VOL", w * .19f, h * .525f, h * .036f, GRIS, true);
        texto(c, "CH", w * .81f, h * .525f, h * .036f, GRIS, true);
        boolean flash = System.currentTimeMillis() - teleToqueT < 250;
        for (int i = 0; i < TELE.length; i++) {
            Object[] b = TELE[i];
            float cx = w * (Float) b[2], cy = h * (Float) b[3], r = w * (Float) b[4];
            boolean pow = "pow".equals(b[0]), apretado = flash && teleToque == i;
            p.setStyle(Paint.Style.FILL);
            p.setColor(pow ? (teleOn ? 0xFF2F7DF6 : 0xFF2A3348) : apretado ? 0xFF3C4A66 : 0xFF1C2436);
            c.drawCircle(cx, cy, apretado ? r * .92f : r, p);
            if (pow) {
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(w * .014f); p.setStrokeCap(Paint.Cap.ROUND); p.setColor(Color.WHITE);
                float a = r * .45f;
                c.drawLine(cx, cy - a * 1.15f, cx, cy - a * .15f, p);
                c.drawArc(new RectF(cx - a, cy - a, cx + a, cy + a), -50, 280, false, p);
            } else { String l = (String) b[1]; float t = l.length() > 1 ? r * .42f : r * .9f; texto(c, l, cx, cy + t * .36f, t, TINTA, true); }
        }
        if (flash) postInvalidateDelayed(260);
    }

    boolean tocarTele(float x, float y) {
        int w = getWidth(), h = getHeight();
        for (int i = 0; i < TELE.length; i++) {
            Object[] b = TELE[i];
            float cx = w * (Float) b[2], cy = h * (Float) b[3], r = w * (Float) b[4] * 1.25f;
            if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) {
                teleToque = i; teleToqueT = System.currentTimeMillis();
                String k = (String) b[0];
                if ("pow".equals(k)) { k = teleOn ? "off" : "on"; teleOn = !teleOn; }
                act.mandarTele(k);
                invalidate();
                return true;
            }
        }
        return false;
    }

    // ---------------- modo de la casa ----------------
    void ponerModo(String sel, String nom, String por) { modoSel = sel; modoNom = nom; modoPor = por; modoLeido = System.currentTimeMillis(); invalidate(); }

    static int colorModo(String m) {
        if (m == null) return GRIS;
        switch (m) {
            case "casa": return VERDE; case "fuera": return ROJO_FUERA; case "noche": return AZUL;
            case "vacaciones": return AMBAR; case "nomolestar": return 0xFFB58CFF; default: return TINTA;
        }
    }

    void dibujarModo(Canvas c, int w, int h) {
        texto(c, "Modo de la casa", w / 2f, h * .2f, h * .055f, GRIS, true);
        String nomSel = "--";
        for (int k = 0; k < MODOS_ID.length; k++) if (MODOS_ID[k].equals(modoSel)) nomSel = MODOS_NOM[k];
        int col = colorModo(modoSel);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(w * .014f);
        p.setColor(col);
        p.setAlpha(170);
        c.drawCircle(w / 2f, h * .44f, w * .2f, p);
        p.setAlpha(255);
        texto(c, nomSel, w / 2f, h * .465f, nomSel.length() > 9 ? h * .065f : h * .08f, col, true);
        String sub;
        if (modoSel == null) sub = "Leyendo…";
        else if ("auto".equals(modoSel)) sub = modoNom != null ? "Ahora: " + modoNom : "Elige solo según la hora y la alarma";
        else sub = modoNom != null ? "Avisos según: " + modoNom : "Guardando…";
        texto(c, sub, w / 2f, h * .74f, h * .042f, 0xCCFFFFFF, false);
        texto(c, "Toca para cambiar", w / 2f, h * .84f, h * .04f, 0x88FFFFFF, false);
    }

    // ---------------- Llegando ----------------
    void dibujarLlegando(Canvas c, int w, int h) {
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xFF6FDCA6);
        c.drawCircle(w / 2f, h * .42f, w * .2f, p);
        // casita con flecha que entra
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(w * .02f);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        p.setColor(0xFF06261A);
        float cx = w / 2f, cy = h * .43f, s = w * .085f;
        android.graphics.Path casa = new android.graphics.Path();
        casa.moveTo(cx - s, cy - s * .1f); casa.lineTo(cx, cy - s); casa.lineTo(cx + s, cy - s * .1f);
        casa.moveTo(cx - s * .75f, cy - s * .3f); casa.lineTo(cx - s * .75f, cy + s * .8f); casa.lineTo(cx + s * .75f, cy + s * .8f); casa.lineTo(cx + s * .75f, cy - s * .3f);
        c.drawPath(casa, p);
        c.drawLine(cx - s * .3f, cy + s * .3f, cx + s * .25f, cy + s * .3f, p);
        c.drawLine(cx + s * .25f, cy + s * .3f, cx, cy + s * .05f, p);
        c.drawLine(cx + s * .25f, cy + s * .3f, cx, cy + s * .55f, p);
        texto(c, "Llegando", w / 2f, h * .76f, h * .085f, Color.WHITE, true);
        texto(c, confirmando(P_LLEGANDO) ? "Toca otra vez para confirmar" : "Abre el portón y prende las luces", w / 2f, h * .84f, h * .041f, confirmando(P_LLEGANDO) ? Color.WHITE : 0x99FFFFFF, confirmando(P_LLEGANDO));
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
                arrastre = 0; xIni = e.getX(); yIni = e.getY(); moviendo = false; largoUsado = false;
                removeCallbacks(largo);
                if (perilla == null && pagina >= P_CUARTO1 && pagina < P_LLEGANDO) postDelayed(largo, 650);
                return true;
            case MotionEvent.ACTION_MOVE:
                float dx = e.getX() - xIni;
                if (!moviendo && Math.abs(dx) > slop) { moviendo = true; removeCallbacks(largo); }
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
                removeCallbacks(largo);
                if (largoUsado) { largoUsado = false; return true; }   // fue para abrir la perilla
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
        if (perilla != null) { perilla = null; invalidate(); return; }
        if (pagina == P_TELE) { tocarTele(x, y); return; }
        if (pagina == P_VOZ) { act.escuchar(); return; }
        if (pagina == P_FUNC) { tocarFunc(x, y); return; }
        if (pagina == P_RADAR) return;
        if (pagina == P_CAM) {
            cam = (cam + 1) % CAMS.length;
            camFoto = null; camHora = 0; camError = null;
            act.vibrar(new long[]{0, 25});
            act.pedirFoto();
            invalidate();
            return;
        }
        if (pagina == P_MODO) {
            int i = 0;
            for (int k = 0; k < MODOS_ID.length; k++) if (MODOS_ID[k].equals(modoSel)) i = k;
            String nuevo = MODOS_ID[(i + 1) % MODOS_ID.length];
            modoSel = nuevo; modoNom = null;
            act.mandarModo(nuevo);
            invalidate();
            return;
        }
        if (pagina == P_LLEGANDO) {
            if (confirmando(P_LLEGANDO)) { confirmarPagina = -1; act.llegando(); }
            else { confirmarPagina = P_LLEGANDO; confirmarHasta = System.currentTimeMillis() + 3000; postInvalidateDelayed(3100); }
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
        if (perilla != null) {
            giro += v;
            if (Math.abs(giro) >= 0.25f) {
                perillaPct = Math.max(1, Math.min(100, perillaPct + (giro > 0 ? 5 : -5)));
                giro = 0; perillaT = System.currentTimeMillis();
                performHapticFeedback(android.view.HapticFeedbackConstants.CLOCK_TICK);
                removeCallbacks(mandaPerilla); postDelayed(mandaPerilla, 350);
                invalidate();
            }
            return true;
        }
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
