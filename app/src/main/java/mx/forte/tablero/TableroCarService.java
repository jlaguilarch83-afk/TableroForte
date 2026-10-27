package mx.forte.tablero;

import android.content.Intent;

import androidx.annotation.NonNull;
import androidx.car.app.CarAppService;
import androidx.car.app.Screen;
import androidx.car.app.Session;
import androidx.car.app.validation.HostValidator;

/** Entrada de la app en Android Auto. */
public class TableroCarService extends CarAppService {

    @NonNull
    @Override
    public HostValidator createHostValidator() {
        // App personal instalada a mano: se acepta cualquier pantalla de auto.
        return HostValidator.ALLOW_ALL_HOSTS_VALIDATOR;
    }

    @NonNull
    @Override
    public Session onCreateSession() {
        return new Session() {
            @NonNull
            @Override
            public Screen onCreateScreen(@NonNull Intent intent) {
                return new DashScreen(getCarContext());
            }
        };
    }
}
