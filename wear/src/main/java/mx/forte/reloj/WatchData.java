package mx.forte.reloj;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.android.gms.wearable.DataMap;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/** Últimos datos recibidos del teléfono. Se guardan para el mosaico. */
final class WatchData {
    static final String[] KEYS = {"speed", "rpm", "coolant", "volt", "fuel", "maf", "throttle"};
    static final Map<String, Double> v = new HashMap<>();
    static String estado = "Abre Tablero Forte en el teléfono";
    static boolean conectado = false;
    static long t = 0;
    static String alerta = null;
    static long alertaAt = 0;
    static final List<Runnable> listeners = new CopyOnWriteArrayList<>();
    private static boolean cargado = false;

    private WatchData() {
    }

    static synchronized void update(Context c, DataMap m) {
        for (String k : KEYS) {
            if (m.containsKey(k)) v.put(k, m.getDouble(k)); else v.remove(k);
        }
        estado = m.getString("estado", estado);
        conectado = m.getBoolean("conectado", false);
        t = m.getLong("t", System.currentTimeMillis());
        save(c);
        for (Runnable r : listeners) r.run();
    }

    static synchronized void setAlerta(Context c, String text) {
        alerta = text;
        alertaAt = System.currentTimeMillis();
        prefs(c).edit().putString("alerta", text).putLong("alertaAt", alertaAt).apply();
        for (Runnable r : listeners) r.run();
    }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("reloj", Context.MODE_PRIVATE);
    }

    private static void save(Context c) {
        SharedPreferences.Editor e = prefs(c).edit();
        for (String k : KEYS) {
            Double d = v.get(k);
            if (d != null) e.putFloat(k, d.floatValue()); else e.remove(k);
        }
        e.putString("estado", estado).putBoolean("conectado", conectado).putLong("t", t).apply();
    }

    static synchronized void load(Context c) {
        if (cargado) return;
        cargado = true;
        SharedPreferences p = prefs(c);
        for (String k : KEYS) if (p.contains(k)) v.put(k, (double) p.getFloat(k, 0));
        estado = p.getString("estado", estado);
        conectado = p.getBoolean("conectado", false);
        t = p.getLong("t", 0);
        alerta = p.getString("alerta", null);
        alertaAt = p.getLong("alertaAt", 0);
    }

    static synchronized Double get(String k) {
        return v.get(k);
    }

    /** Hay datos recientes del auto. */
    static boolean vivo() {
        return conectado && System.currentTimeMillis() - t < 15000;
    }

    static String alertaReciente() {
        return alerta != null && System.currentTimeMillis() - alertaAt < 20000 ? alerta : null;
    }

    static String n(Double d, int dec) {
        if (d == null) return "—";
        return dec == 0 ? String.valueOf(Math.round(d)) : String.format(Locale.US, "%." + dec + "f", d);
    }

    static Double kml() {
        Double s = get("speed"), maf = get("maf");
        if (s == null || maf == null || maf <= 0 || s <= 3) return null;
        double lh = maf * 3600 / (14.7 * 745);
        return Math.min(40, s / lh);
    }
}
