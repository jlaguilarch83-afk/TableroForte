package mx.micasa.reloj;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Al prender el reloj (o actualizar la app) vuelve a poner el aviso al llegar y el modo dormir. */
public class Arranque extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) Fondo.aplicar(c);
    }
}
