package mx.forte.reloj;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.android.gms.wearable.DataMap;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/** Últimos datos recibidos del teléfono. Se guardan para el mosaico y para abrir rápido. */
final class WatchData {
    static final Map<String, Double> v = new HashMap<>();
    static String estado = "Abre Tablero Forte en el teléfono";
    static boolean conectado = false;
    static long t = 0;
    static String alerta = null;
    static long alertaAt = 0;
    static double parkLat = Double.NaN, parkLon = Double.NaN;
    static long parkT = 0;
    static final List<Runnable> listeners = new CopyOnWriteArrayList<>();
    private static boolean cargado = false;

    private WatchData() {
    }

    static synchronized void update(Context c, DataMap m) {
        v.clear();
        for (String k : m.keySet()) {
            if (k.equals("estado") || k.equals("tipo") || k.equals("conectado") || k.equals("t")) continue;
            double d = m.getDouble(k, Double.NaN);
            if (!Double.isNaN(d)) v.put(k, d);
        }
        estado = m.getString("estado", estado);
        conectado = m.getBoolean("conectado", false);
        t = m.getLong("t", System.currentTimeMillis());
        save(c);
        for (Runnable r : listeners) r.run();
    }

    static synchronized void setParked(Context c, DataMap m) {
        parkLat = m.getDouble("lat", Double.NaN);
        parkLon = m.getDouble("lon", Double.NaN);
        parkT = m.getLong("t", System.currentTimeMillis());
        prefs(c).edit().putFloat("pk_lat", (float) parkLat).putFloat("pk_lon", (float) parkLon).putLong("pk_t", parkT).apply();
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
        for (String k : prefs(c).getAll().keySet()) if (k.startsWith("v_")) e.remove(k);
        for (Map.Entry<String, Double> x : v.entrySet()) e.putFloat("v_" + x.getKey(), x.getValue().floatValue());
        e.putString("estado", estado).putBoolean("conectado", conectado).putLong("t", t).apply();
    }

    static synchronized void load(Context c) {
        if (cargado) return;
        cargado = true;
        SharedPreferences p = prefs(c);
        for (Map.Entry<String, ?> x : p.getAll().entrySet()) {
            if (x.getKey().startsWith("v_") && x.getValue() instanceof Float) v.put(x.getKey().substring(2), (double) (Float) x.getValue());
        }
        estado = p.getString("estado", estado);
        conectado = p.getBoolean("conectado", false);
        t = p.getLong("t", 0);
        alerta = p.getString("alerta", null);
        alertaAt = p.getLong("alertaAt", 0);
        if (p.contains("pk_lat")) {
            parkLat = p.getFloat("pk_lat", 0);
            parkLon = p.getFloat("pk_lon", 0);
            parkT = p.getLong("pk_t", 0);
        }
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
        if (d == null || d.isNaN()) return "—";
        return dec == 0 ? String.valueOf(Math.round(d)) : String.format(Locale.US, "%." + dec + "f", d);
    }

    static Double kml() {
        Double s = get("speed"), maf = get("maf");
        if (s == null || maf == null || maf <= 0 || s <= 3) return null;
        double lh = maf * 3600 / (14.7 * 745);
        return Math.min(40, s / lh);
    }

    static Double lh() {
        Double maf = get("maf");
        return maf == null ? null : maf * 3600 / (14.7 * 745);
    }
}
