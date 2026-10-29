package mx.forte.reloj;

import android.Manifest;
import android.app.Activity;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;

import com.google.android.gms.wearable.DataClient;
import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.Wearable;

/** Pantalla del reloj con los datos en vivo. */
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

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WatchData.load(this);
        view = new DashView(this);
        setContentView(view);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != 0) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        WatchData.listeners.add(redraw);
        Wearable.getDataClient(this).addListener(this);
        Wearable.getDataClient(this).getDataItems(Uri.parse("wear://*/forte/datos")).addOnSuccessListener(buf -> {
            for (DataItem it : buf) WatchData.update(this, DataMapItem.fromDataItem(it).getDataMap());
            buf.release();
            view.invalidate();
        });
        handler.post(tick);
    }

    @Override
    protected void onPause() {
        WatchData.listeners.remove(redraw);
        Wearable.getDataClient(this).removeListener(this);
        handler.removeCallbacks(tick);
        super.onPause();
    }

    @Override
    public void onDataChanged(DataEventBuffer events) {
        for (DataEvent e : events) {
            if (e.getType() == DataEvent.TYPE_CHANGED && "/forte/datos".equals(e.getDataItem().getUri().getPath())) {
                WatchData.update(this, DataMapItem.fromDataItem(e.getDataItem()).getDataMap());
            }
        }
    }
}
