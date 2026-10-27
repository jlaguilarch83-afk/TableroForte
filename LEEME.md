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

## Qué trae (versión 2.0)
- 20 diseños de tablero (menú › Diseños).
- Viaje y compartir por WhatsApp, mapa del viaje con GPS, clima con amanecer y atardecer.
- 0 a 100 km/h, cuarto de milla, fuerza G, calificación de manejo, inclinómetro.
- Alertas con voz: velocidad, gasolina baja, motor caliente, auto encendido sin moverse, batería baja.
- Modo valet con PIN, modo HUD para el parabrisas, bitácora de gasolina, aceite.
- Dashcam: fotos y video en ciclo (Imágenes y Películas › TableroForte).
- Controles de música y lectura/borrado de códigos de falla.

## Android Auto (versión 2.1)
La app aparece en la pantalla del auto con velocidad, RPM, motor, gasolina, batería, rendimiento y alertas.
Como no viene de la Play Store, hay que activarla una vez:
1. En el teléfono abre **Android Auto** (Ajustes › Dispositivos conectados › Android Auto).
2. Toca 10 veces **Versión** hasta que diga que activaste el modo de desarrollador.
3. Menú de tres puntos › **Configuración para desarrolladores** › activa **Fuentes desconocidas**.
4. Conecta al auto: Tablero Forte aparece en el menú de apps de Android Auto.

Las alertas con voz (velocidad, gasolina, aceite, temperatura y batería) siguen funcionando
con la pantalla del teléfono apagada y se oyen por las bocinas del auto.

## Datos que lee
RPM, velocidad, carga del motor, acelerador, temperatura del refrigerante,
aire de admisión, voltaje, nivel de gasolina y temperatura exterior (si el auto los reporta),
y consumo calculado con el sensor MAF o, si no tiene, con la presión del múltiple (MAP).
La posición de la palanca (P R N D) no viene en el OBD estándar.

## Cambiar el diseño
El tablero está en `app/src/main/assets/` (core.js datos, skins.js diseños, pano.js diseño azul, ui.js menú). Edita y vuelve a compilar.
