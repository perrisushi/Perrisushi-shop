# Visualización de minijuegos — 29/10/2026

Cambios guardados directamente en C:\Users\borja\Documents\GitHub\Perrisushi-shop. Sin Commit, Push, publicación ni acceso a servicios remotos. Las verificaciones usan cuentas y PostgreSQL exclusivamente locales.

## Resultado

- Los documentos e iframe de los cuatro juegos tienen un fondo exterior liso #101010. Duelos y PerriPet dejaban transparente el documento y el lienzo del iframe aparecía blanco. Se conservan el marco propio de Duelos, el escenario pastel de Pet, el panel original de Casillas y los fondos originales de RPG. No se añaden texturas, patrones, degradados ni adornos.
- En PC se conserva el marco medieval exterior. El botón de pantalla completa ocupa 32×32 px junto a la X. Alterna entrada/salida, cambia su icono, nombre accesible y estado al recibir fullscreenchange, y permite salir con Esc sin cerrar el juego. Al salir se recuperan las dimensiones de la ventana anterior.
- En móvil la vista inmersiva se crea durante la pulsación y solicita Fullscreen antes de esperar a la API. El iframe real se monta después de verificar la disponibilidad, conservando el contexto y las optimizaciones existentes. Si la API se rechaza o no existe, la vista continúa ocupando el espacio disponible dentro de la página.
- El contenedor móvil se lleva temporalmente fuera de los ancestros escalados de PerriWeb, sin cabecera visible, marco, bordes o sombras. Solo aparece la X exterior, con objetivo táctil de 44×44 px y un aviso discreto de giro en vertical. Las bandas laterales lisas reservan espacio para la X y las áreas seguras; no tapan controles.
- Se solicita orientación horizontal cuando el navegador lo admite. Si no se concede, el usuario puede girar el dispositivo: el ajuste responde al cambio de tamaño y no depende del bloqueo de orientación.
- Cerrar sale de Fullscreen, libera el bloqueo de orientación y restaura el contenedor, foco, interacción y selección de juegos. También se atienden los mensajes de salida originales de Duelos y Pet. Cerrar mientras se espera a la API cancela la apertura: una respuesta tardía no reabre el juego.

## Geometría interna

Duelos utilizaba escalas X/Y diferentes en móvil horizontal. Una capa de presentación emplea ahora una escala uniforme para el lienzo original 1920×1015 y para sus coordenadas de colocación. No se toca el archivo original ni el código de combate.

PerriPet conserva el lienzo 760×540 y utiliza el alto disponible con esa proporción. RPG sigue usando su disposición fluida y, en ventanas horizontales bajas, coloca catálogo y detalle lado a lado y mantiene visibles las tres opciones de compra del objeto seleccionado. Las listas largas conservan su desplazamiento interno necesario.

Casillas conserva el tablero cuadrado de 6×6. En horizontal, logo/estadísticas quedan junto al tablero para aprovechar el alto sin aplastar las cartas; se elimina la barra exterior vacía heredada del documento antiguo. Los contadores, premios y acciones no cambian.

Cuando el ancho no permite ocupar todo el alto conservando las proporciones, se reduce uniformemente hasta encajar: no se fuerza el llenado mediante deformación ni recorte. En vertical se recomienda girar; no se intenta convertir un juego horizontal en uno vertical estirándolo.

## Archivos

- src/main.js: apertura durante el gesto, montaje posterior a disponibilidad, controles y cierre seguro.
- src/game-window.js y src/game-window.css: ciclo Fullscreen/orientación/portal, aspecto del visor y alternativa inmersiva.
- src/game-presentation.js y src/game-presentation.css: fondo interno y geometría, sin cambiar reglas originales.
- src/casillas-host.js: encaje del tablero original.
- backend/public-paths.mjs: incorporación idempotente de la capa visual y rutas públicas de sus archivos; no cambia autenticación ni comunicación con Supabase.
- index.html y scripts/build.mjs: carga y distribución de los nuevos recursos.
- tests/game-view.test.js y tools/verify-game-view.mjs: regresiones y comprobación de navegador.

No se han modificado los recursos de games/original, su manifiesto, backend de juegos, conexiones, TLS, tablas, sesiones, economía, inventarios ni las optimizaciones de rendimiento anteriores.

## Comprobaciones realizadas

- npm test: **131 pruebas superadas**, ninguna fallida ni omitida. Incluyen integridad de los gráficos y reglas originales, seguridad, economía, rendimiento y los casos nuevos de montaje idempotente, identificación de móvil y liberación de orientación/portal al cerrar y reabrir.
- npm run build: **485 archivos públicos**; no se publican backend, pruebas o secretos.
- Edge/Chromium local: **17 casos de navegador sin errores JavaScript**. Cuatro juegos en PC a 1440×1000, ventana reducida a 1000×700, entrada/salida de Fullscreen, Esc y recuperación del tamaño original.
- Cuatro juegos con móvil emulado: apertura vertical a 390×844, horizontal a 844×390 y 667×375, giro de ida/vuelta y cierre. Se prueba Fullscreen nativo concedido, solicitud rechazada y método no disponible.
- Se comprueba que la solicitud Fullscreen sucede durante una activación real de usuario y antes de la consulta de contexto, que en móvil solo queda la X exterior, que no hay desbordamiento del documento y que los lienzos mantienen sus proporciones. En RPG se comprueba que no quedan cortadas las opciones de compra; no se pulsa ninguna compra real.
- En el modo alternativo se simulan áreas seguras con márgenes superior/inferior, derecho e izquierdo y se verifica que la X queda dentro de la zona utilizable.
- Se prueba el cierre antes de responder la API y se comprueba que no reaparece el juego. Al cerrar no queda un overlay visible o bloqueante, y los elementos de PerriWeb recuperan su interacción.
- Se han revisado capturas normales, de pantalla completa y horizontales de los cuatro juegos. El JSON de resultados acompaña este documento. Las capturas se conservan en la carpeta temporal perriweb-game-view-qa, fuera del conjunto de archivos que se publican.

## Pendiente en dispositivos y producción

No se ha utilizado un móvil físico ni Safari/iOS real. Quedan por comprobar en dispositivos reales las barras del navegador, permisos efectivos de Fullscreen/orientación, notch y comodidad táctil. La emulación cubre tanto concesión como ausencia/rechazo de la API, pero no sustituye esa prueba física.

No se han realizado operaciones con cuentas reales ni se afirma que el cambio esté ya publicado. El propietario puede revisar los cambios en GitHub Desktop y hacer Commit y Push origin manualmente. No necesita ejecutar SQL ni cambiar variables de Railway o Supabase.
