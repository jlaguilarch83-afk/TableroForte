package mx.forte.reloj;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.WindowManager;

import com.google.android.gms.wearable.DataClient;
import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.Wearable;

import java.util.ArrayList;
import java.util.List;

/** Pantalla del reloj: datos en vivo con 58 carátulas. Bisel o deslizar arriba/abajo para cambiar. */
public class WatchActivity extends Activity implements DataClient.OnDataChangedListener {

    private DashView view;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable redraw = () -> view.invalidate();
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            view.invalidate();
            handler.postDelayed(this, 1000);
        }
    };
    private float rotAcum = 0;
    private float downY = Float.NaN, downX = Float.NaN;

    // ubicación y brújula para "Mi carro"
    private LocationManager lm;
    private SensorManager sm;
    private boolean siguiendo = false;
    private final LocationListener ubic = new LocationListener() {
        @Override
        public void onLocationChanged(Location l) {
            view.myLat = l.getLatitude();
            view.myLon = l.getLongitude();
            view.invalidate();
        }

        @Override
        public void onStatusChanged(String p, int s, Bundle b) {
        }

        @Override
        public void onProviderEnabled(String p) {
        }

        @Override
        public void onProviderDisabled(String p) {
        }
    };
    private final float[] rot = new float[9], ori = new float[3];
    private final SensorEventListener brujula = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent e) {
            SensorManager.getRotationMatrixFromVector(rot, e.values);
            SensorManager.getOrientation(rot, ori);
            float az = (float) ((Math.toDegrees(ori[0]) + 360) % 360);
            view.azimut = Float.isNaN(view.azimut) ? az : view.azimut + angulo(az - view.azimut) * .2f;
        }

        @Override
        public void onAccuracyChanged(Sensor s, int a) {
        }
    };

    private static float angulo(float d) {
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return d;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WatchData.load(this);
        view = new DashView(this);
        view.face = Math.max(0, Math.min(DashView.total() - 1, WatchData.prefs(this).getInt("face", 0)));
        view.setFocusable(true);
        view.setFocusableInTouchMode(true);
        setContentView(view);
        view.requestFocus();
        List<String> pedir = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            pedir.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!pedir.isEmpty()) requestPermissions(pedir.toArray(new String[0]), 1);
    }

    @Override
    protected void onResume() {
        super.onResume();
        WatchData.listeners.add(redraw);
        Wearable.getDataClient(this).addListener(this);
        for (String path : new String[]{"/forte/datos", "/forte/estacionado"}) {
            Wearable.getDataClient(this).getDataItems(Uri.parse("wear://*" + path)).addOnSuccessListener(buf -> {
                for (DataItem it : buf) aplicar(it);
                buf.release();
                view.invalidate();
            });
        }
        handler.post(tick);
        actualizarSeguimiento();
        view.requestFocus();
    }

    @Override
    protected void onPause() {
        WatchData.listeners.remove(redraw);
        Wearable.getDataClient(this).removeListener(this);
        handler.removeCallbacks(tick);
        detenerSeguimiento();
        super.onPause();
    }

    private void aplicar(DataItem it) {
        String path = it.getUri().getPath();
        if ("/forte/datos".equals(path)) WatchData.update(this, DataMapItem.fromDataItem(it).getDataMap());
        else if ("/forte/estacionado".equals(path)) WatchData.setParked(this, DataMapItem.fromDataItem(it).getDataMap());
    }

    @Override
    public void onDataChanged(DataEventBuffer events) {
        for (DataEvent e : events) if (e.getType() == DataEvent.TYPE_CHANGED) aplicar(e.getDataItem());
    }

    // ---------- cambiar de carátula ----------
    private void cambiar(int d) {
        int n = DashView.total();
        view.face = ((view.face + d) % n + n) % n;
        view.nameUntil = System.currentTimeMillis() + 1500;
        WatchData.prefs(this).edit().putInt("face", view.face).apply();
        actualizarSeguimiento();
        view.invalidate();
    }

    @Override
    public boolean onGenericMotionEvent(MotionEvent ev) {
        if (ev.getAction() == MotionEvent.ACTION_SCROLL && ev.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER)) {
            rotAcum += -ev.getAxisValue(MotionEvent.AXIS_SCROLL);
            if (Math.abs(rotAcum) >= 1f) {
                cambiar(rotAcum > 0 ? 1 : -1);
                rotAcum = 0;
            }
            return true;
        }
        return super.onGenericMotionEvent(ev);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        switch (ev.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downY = ev.getY();
                downX = ev.getX();
                break;
            case MotionEvent.ACTION_UP:
                if (!Float.isNaN(downY)) {
                    float dy = ev.getY() - downY, dx = ev.getX() - downX;
                    float min = view.getHeight() * .15f;
                    if (Math.abs(dy) > min && Math.abs(dy) > Math.abs(dx)) cambiar(dy < 0 ? 1 : -1);
                    else if (Math.abs(dy) < 20 && Math.abs(dx) < 20) {
                        view.nameUntil = System.currentTimeMillis() + 1500;
                        view.invalidate();
                    }
                }
                downY = Float.NaN;
                break;
            default:
                break;
        }
        return super.dispatchTouchEvent(ev);
    }

    // ---------- ubicación y brújula solo en "Mi carro" ----------
    private void actualizarSeguimiento() {
        if (view.esMiCarro()) iniciarSeguimiento(); else detenerSeguimiento();
    }

    private void iniciarSeguimiento() {
        if (siguiendo) return;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, 2);
            return;
        }
        siguiendo = true;
        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        try {
            if (lm != null) {
                for (String prov : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                    if (lm.getAllProviders().contains(prov)) {
                        lm.requestLocationUpdates(prov, 2000, 2, ubic, Looper.getMainLooper());
                        Location last = lm.getLastKnownLocation(prov);
                        if (last != null && Double.isNaN(view.myLat)) ubic.onLocationChanged(last);
                    }
                }
            }
        } catch (SecurityException ignored) {
        }
        sm = (SensorManager) getSystemService(SENSOR_SERVICE);
        Sensor rv = sm != null ? sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) : null;
        if (rv != null) sm.registerListener(brujula, rv, SensorManager.SENSOR_DELAY_UI);
    }

    private void detenerSeguimiento() {
        if (!siguiendo) return;
        siguiendo = false;
        try {
            if (lm != null) lm.removeUpdates(ubic);
        } catch (Exception ignored) {
        }
        if (sm != null) sm.unregisterListener(brujula);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == 2 && res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) actualizarSeguimiento();
    }
}
