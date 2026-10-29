# Inventario móvil: un único scroll

Causa confirmada en CSS: `.content-scroll` permitía desplazamiento alrededor del inventario y `.pw04-inventory-grid` tenía otro scroll con un máximo de 430px. Ese máximo no descontaba el título ni los saldos del espacio disponible en pantallas pequeñas.

Corrección exclusivamente móvil en `src/preview-pages.css`: el contenedor exterior queda sin scroll (`overflow: clip`); el panel y su contenedor intermedio distribuyen el espacio mediante flex con `min-height: 0`; los saldos no se encogen; la cuadrícula ocupa la altura restante y mantiene el único desplazamiento vertical. Se conserva el tamaño proporcional de las casillas y todo el contenido puede recorrerse, incluida la última fila. No se han modificado las plantillas, los datos ni las funciones de los objetos.

## Verificación

- `npm test`: 131 pruebas superadas, cero fallos y cero omitidas.
- `npm run build`: 485 archivos públicos; compilación correcta.
- `node tools/verify-mobile-layout.mjs`: siete resoluciones móviles (320×568, 360×640, 373×734, 390×844, 430×932, 667×375 y 844×390) y tres de escritorio.
- Inventario local de 62 objetos: gestos táctiles enviados al navegador mediante CDP dentro de la cuadrícula desplazan los objetos; gestos iniciados en los saldos no desplazan la cuadrícula, los contenedores exteriores ni la página. Verificados también los gestos en el límite inferior y el intento programático de desplazar el exterior.
- Título, saldos y límites de la cuadrícula mantienen exactamente sus posiciones. La última casilla puede verse completa; las 62 casillas siguen presentes; las ventanas informativas del primer y último objeto conservan sus cantidades y se abren y cierran con tacto y teclado.
- Revisadas las capturas de las secciones móviles; sin errores JavaScript. Las regresiones de portada, menús y notificaciones siguen pasando.
- Inventario de PC: comparación de todas las dimensiones y estilos calculados frente al CSS anterior en 1440×1000, 1024×768 y 1440×450, sin diferencias.

Las respuestas son exclusivamente de prueba local, sin acceder a cuentas ni servicios reales. Los gestos se han probado mediante emulación táctil de Edge/Chromium, no en un dispositivo físico ni Safari/iOS. Capturas en `%TEMP%\perriweb-mobile-layout`; resultados del comprobador en `resultados.json`.

Archivos modificados: `src/preview-pages.css`, `tools/verify-mobile-layout.mjs` y este informe con sus resultados. Sin Commit ni Push.
