# Tablero Forte

App Android que muestra el tablero digital y lee tu Kia Forte 2020 con el adaptador ELM327 Bluetooth.

## 1. Emparejar el OBD (una sola vez)
1. Conecta el ELM327 al puerto OBD (abajo del volante) y pon la llave en ON.
2. En el celular: Ajustes › Bluetooth › busca "OBDII" (o "OBD", "V-LINK").
3. PIN: `1234` (si no, `0000`).

## 2. Sacar el APK — opción A: GitHub (sin instalar nada)
1. Crea un repositorio nuevo en github.com y sube todo el contenido de esta carpeta.
2. Entra a la pestaña **Actions**. Se compila solo (tarda ~5 min).
3. Abre la ejecución terminada y descarga **TableroForte-apk** (viene en .zip; adentro está `app-debug.apk`).

## 2. Sacar el APK — opción B: Android Studio
1. Abre esta carpeta con Android Studio y espera a que termine "Gradle sync".
2. Menú Build › Build App Bundle(s) / APK(s) › Build APK(s).
3. El archivo queda en `app/build/outputs/apk/debug/app-debug.apk`.
   También puedes conectar el celular por USB y darle ▶ Run.

## 3. Instalar y usar
1. Pasa el APK al celular y ábrelo. Android pedirá permitir "instalar apps desconocidas".
2. Abre **Tablero Forte**, acepta el permiso de "Dispositivos cercanos".
3. Toca el botón de arriba a la izquierda, elige tu OBDII. La próxima vez se conecta solo.
4. Pestaña **Fallas** › Leer fallas para ver códigos del check engine.

## Datos que lee
RPM, velocidad, carga del motor, acelerador, temperatura del refrigerante,
aire de admisión, voltaje, nivel de gasolina y temperatura exterior (si el auto los reporta),
y consumo calculado con el sensor MAF o, si no tiene, con la presión del múltiple (MAP).
La posición de la palanca (P R N D) no viene en el OBD estándar.

## Cambiar el diseño
Todo el tablero está en `app/src/main/assets/index.html`. Edítalo y vuelve a compilar.
