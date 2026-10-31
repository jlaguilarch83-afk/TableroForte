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

## Novedades 3.5
- Carros y personas al estilo Tesla: siluetas blancas lisas. Los carros que cruzan enfrente se ven de lado; los que están detenidos salen en gris con "Parado".
- Menú ⋮ › **Cansancio**: si cierras los ojos 1.5 s arriba de 10 km/h, alarma y voz "Despierta". Le llega un SMS automático a tu contacto con hora, velocidad y ubicación; la foto por WhatsApp se abre lista cuando el carro se detiene. La cara se ve con la cámara de adentro de la Pruveeo o con la frontal del teléfono.

## Novedades 3.4 · dashcam Pruveeo por Wi-Fi
- En el menú ⋮ › **Cámara Pruveeo**: prende "Conectar la Pruveeo" y conecta el teléfono al Wi-Fi de la cámara (MUSTANG, clave 12345678). Si Android dice "sin internet", elige "Mantener conexión".
- Botón **Pruveeo** en la barra: video en vivo en pantalla completa ("Cambiar vista" para adelante/adentro).
- "Los avisos de la cámara usan: Pruveeo" → carros, carril, peatones y semáforo salen de la dashcam y el teléfono ya no necesita su cámara.
- "Probar conexión" dice qué contesta la cámara (para ajustar si algo no sale).

## Novedades 3.3 · menú de tres puntitos (⋮) en Forte Tesla
- **Salida de carril:** la cámara ve las líneas, las dibuja en el camino y avisa (pitido del lado de la línea, o voz) arriba de 45 km/h. "Calibrar centro del carril" con el auto bien centrado.
- **Peatones y ciclistas** al frente: pitido o voz.
- **Semáforo:** "Semáforo en rojo, para" y "Verde, avanza". Es una ayuda; puede fallar de noche o con el sol de frente.
- **Tolerancia del límite** con + y −.
- **Ralentí raro** (motor caliente y detenido): avisa si baila, está bajo o alto.
- **Prueba de batería al arrancar:** dice bien, regular o fallando (siempre o solo si falla).
- **Modo arrancones:** botón Arrancón con semáforo, reacción, 0 a 60, 0 a 100 y 400 m, con mejores tiempos.
- **Sonido de motor:** 10 estilos generados con tus revoluciones (no son grabaciones).
- **Detector de choque:** golpe fuerte y el carro se detiene → 30 s para responder; si no, manda SMS con tu ubicación al contacto y abre WhatsApp con el mensaje listo.
- **Clima:** lluvia, tormenta, nieve o granizo en la pantalla cuando de verdad está pasando, y aviso si viene más adelante.

## Qué trae (versión 2.0)
- 20 diseños de tablero (menú › Diseños).
- Viaje y compartir por WhatsApp, mapa del viaje con GPS, clima con amanecer y atardecer.
- 0 a 100 km/h, cuarto de milla, fuerza G, calificación de manejo, inclinómetro.
- Alertas con voz: velocidad, gasolina baja, motor caliente, auto encendido sin moverse, batería baja.
- Modo valet con PIN, modo HUD para el parabrisas, bitácora de gasolina, aceite.
- Dashcam: fotos y video en ciclo (Imágenes y Películas › TableroForte).
- Controles de música y lectura/borrado de códigos de falla.

## Android Auto (versión 2.4)
Android Auto ya no deja instalar a mano apps de pantallas de datos, pero sí apps de música.
Por eso el tablero aparece en Android Auto como un reproductor: la portada es el tablero
dibujado (velocidad, RPM, motor, batería, gasolina y alertas) y se actualiza cada segundo.
No reproduce sonido, así que Spotify sigue sonando y los botones del volante lo siguen controlando.

Para que aparezca:
1. Android Auto en el teléfono › toca 10 veces **Versión** (modo desarrollador).
2. Tres puntos › **Configuración para desarrolladores** › activa **Fuentes desconocidas**.
3. Conecta al auto y abre **Tablero Forte** en el menú de apps (o en la tarjeta de música).

Las alertas con voz se oyen por las bocinas del auto aunque la pantalla del teléfono esté apagada.

## Reloj (Galaxy Watch 7 / Wear OS) · versión 2.5
`TableroForteReloj.apk` va en el reloj. Muestra velocidad, RPM, batería, motor y gasolina en vivo,
tiene un mosaico (desliza desde la carátula) y vibra con las alertas. Los datos llegan del teléfono,
así que la app del teléfono debe estar conectada al OBD.

Instalarlo (una sola vez, sin computadora):
1. Reloj: Ajustes › Acerca del reloj › Información de software › toca **Versión de software** unas 7 veces.
2. Reloj: Ajustes › **Opciones de desarrollador** › activa **Depuración ADB** y **Depuración inalámbrica**.
   Reloj y teléfono en la misma red Wi-Fi.
3. Teléfono: instala **Wear Installer 2** (Play Store) y descarga `TableroForteReloj.apk`.
4. En Depuración inalámbrica del reloj toca **Vincular nuevo dispositivo**: da un código y un puerto.
   En Wear Installer 2 escribe la IP del reloj, el código y el puerto de vinculación.
5. Luego conecta con la IP y el puerto que salen en Depuración inalámbrica (es otro puerto) e instala el APK.
6. Al terminar, apaga Depuración ADB en el reloj para ahorrar batería.

## Datos que lee
RPM, velocidad, carga del motor, acelerador, temperatura del refrigerante,
aire de admisión, voltaje, nivel de gasolina y temperatura exterior (si el auto los reporta),
y consumo calculado con el sensor MAF o, si no tiene, con la presión del múltiple (MAP).
La posición de la palanca (P R N D) no viene en el OBD estándar.

## Cambiar el diseño
El tablero está en `app/src/main/assets/` (core.js datos, skins.js diseños, pano.js diseño azul, ui.js menú). Edita y vuelve a compilar.
