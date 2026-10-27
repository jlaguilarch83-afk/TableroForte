package mx.forte.tablero;

import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.CarToast;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.Pane;
import androidx.car.app.model.PaneTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;

import java.util.Locale;

/** Pantalla de Android Auto: datos en vivo del OBD y la alerta más reciente. */
public class DashScreen extends Screen {

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            invalidate();
            handler.postDelayed(this, 1500);
        }
    };

    public DashScreen(@NonNull CarContext ctx) {
        super(ctx);
        getLifecycle().addObserver(new DefaultLifecycleObserver() {
            @Override
            public void onStart(@NonNull LifecycleOwner owner) {
                handler.post(tick);
                // si no hay conexión y ya se había elegido un adaptador, se conecta solo
                if (ObdService.instance == null && ObdService.savedAddress(getCarContext()) != null) conectar();
            }

            @Override
            public void onStop(@NonNull LifecycleOwner owner) {
                handler.removeCallbacks(tick);
            }
        });
    }

    private void conectar() {
        String addr = ObdService.savedAddress(getCarContext());
        if (addr == null) {
            CarToast.makeText(getCarContext(), "Elige tu OBD primero en la app del teléfono", CarToast.LENGTH_LONG).show();
            return;
        }
        try {
            ObdService.connect(getCarContext(), addr);
        } catch (Exception e) {
            CarToast.makeText(getCarContext(), "Abre Tablero Forte en el teléfono para conectar", CarToast.LENGTH_LONG).show();
        }
    }

    private static String n(Double v, int dec) {
        if (v == null) return "—";
        return dec == 0 ? String.valueOf(Math.round(v)) : String.format(Locale.US, "%." + dec + "f", v);
    }

    @NonNull
    @Override
    public Template onGetTemplate() {
        Pane.Builder pane = new Pane.Builder();
        boolean con = ObdService.isConnected();
        Double speed = ObdService.get("speed"), rpm = ObdService.get("rpm"), cool = ObdService.get("coolant"),
                fuel = ObdService.get("fuel"), volt = ObdService.get("volt"), maf = ObdService.get("maf");

        String alerta = ObdService.alertText;
        if (alerta != null && System.currentTimeMillis() - ObdService.alertAt < 20000) {
            pane.addRow(new Row.Builder().setTitle("⚠ " + alerta).build());
        }
        pane.addRow(new Row.Builder()
                .setTitle(n(speed, 0) + " km/h   ·   " + n(rpm, 0) + " rpm")
                .addText("Motor " + n(cool, 0) + " °C   ·   Gasolina " + n(fuel, 0) + " %")
                .build());

        String estadoBat;
        if (volt == null) estadoBat = "";
        else if (rpm != null && rpm >= 400) estadoBat = volt >= 13.2 ? "cargando bien" : volt >= 12.4 ? "carga baja (normal en Kia a velocidad constante)" : "el alternador no está cargando";
        else estadoBat = volt >= 12.6 ? "llena" : volt >= 12.4 ? "75 %" : volt >= 12.2 ? "50 %" : "baja";
        pane.addRow(new Row.Builder().setTitle("Batería " + n(volt, 1) + " V").addText(estadoBat).build());

        String rend = "—";
        if (speed != null && speed > 3 && maf != null && maf > 0) {
            double lh = maf * 3600 / (14.7 * 745);
            rend = String.format(Locale.US, "%.1f km/L", speed / lh);
        } else if (maf != null && maf > 0) {
            rend = String.format(Locale.US, "Detenido · %.1f L/h", maf * 3600 / (14.7 * 745));
        }
        pane.addRow(new Row.Builder().setTitle("Rendimiento " + rend).addText(ObdService.statusText).build());

        if (!con) {
            pane.addAction(new Action.Builder().setTitle("Conectar OBD").setOnClickListener(this::conectar).build());
        }
        return new PaneTemplate.Builder(pane.build())
                .setTitle("Tablero Forte")
                .setHeaderAction(Action.APP_ICON)
                .build();
    }
}
