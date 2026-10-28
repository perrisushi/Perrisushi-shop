# Corrección 02 ACTUALIZADA — escritorio

## Ajuste posterior solicitado: botones mayores y más próximos

Se aumentó el máximo de los botones de 275 a 310 px (275 en portátil y 245 en altura baja), se redujeron los huecos entre filas y columnas y se alineó cada columna hacia el centro. Se mantienen marco y escala de la escena. Las capturas y mediciones de despues/ reflejan este último ajuste; las medidas de botones en la tabla histórica inferior corresponden a la primera integración. La revisión de seis tamaños PC, las nueve pruebas y la validación estructural pasan. Las capturas móviles siguen idénticas a las previas.

Se integró únicamente el paquete actualizado. Se leyeron sus instrucciones y se inspeccionaron las cuatro referencias del usuario y VISTA_PREVIA_PC_1649x928.png. No existía otro desktop-layout-fix.css ni otra referencia al parche.

## Archivos y alcance

- `src/desktop-layout-fix.css`: nueva hoja del paquete, cargada una sola vez. Se añadió una condición de altura mínima de 501 px para no interferir con la composición móvil apaisada preexistente (activada por styles.css a alturas <=500 px incluso si el ancho supera 700 px).
- `index.html`: enlace al parche inmediatamente después de styles.css.
- `dev-server.mjs`: se permitió exactamente src/desktop-layout-fix.css además de styles.css. Sin ampliar acceso a carpetas internas.
- `tests/validacion-estructural.mjs`: comprobación estructural suministrada, también conservada en el paquete extraído.
- `tools/review-desktop-02.cjs`: captura antes/después, mediciones, verificación HTTP y comparación de imágenes móviles.
- Esta documentación y capturas/mediciones bajo docs/correccion-02. Referencia extraída en .correccion-02-actualizada.

No se modificaron src/styles.css ni src/main.js. Móvil, autenticación, avatares, menús de sesión, datos y minijuegos conservan sus archivos y comportamiento.

## Estilos efectivos

Las propiedades calculadas por tamaño están completas en antes/mediciones.json y despues/mediciones.json, incluidos app-frame, scene, home-menu, home-links, art-menu-button y scene-footer.

| Elemento PC | Antes | Después |
|---|---|---|
| app-frame | Grid centrado, padding 12 px | Sin cambios |
| scene | min(1150px, ancho−24px, (alto−36px)×1.23), aspecto 1.23 | min(1300px, ancho−24px, (alto−24px)×1.23), mismo aspecto |
| home-menu | Ancho 62.5%, top 21% (ajuste previo en alturas bajas) | 72%, top 16%; entre 671 y 780 px de alto, 68%, top 15%; entre 501 y 670, ancho limitado por altura |
| home-links | Dos columnas, tres filas 1fr, separadas para llenar el panel | Mismo orden, tres filas min-content, centradas y juntas |
| art-menu-button | Máximo 220 px, imagen limitada a 72 px de alto | Máximo 275 px; 245 en portátil y 225 en altura baja, proporción original |
| scene-footer | Absoluto, bottom 1.6%; bottom 0 en altura baja | Sin cambios |

## Medidas reales (CSS px, redondeadas)

| Viewport | Escena antes | Escena después | Marco después | Botón después |
|---|---|---|---|---|
| 1649×928 | 1097×892 | 1112×904 | 799×599 | 275×92 |
| 1920×1080 | 1150×935 | 1299×1056 | 934×700 | 275×92 |
| 1536×960 | 1137×924 | 1151×936 | 827×621 | 275×92 |
| 1280×720 | 841×684 | 856×696 | 581×436 | 218×73 |
| 1068×900 | 1044×849 | 1044×849 | 750×563 | 275×92 |
| 1024×600 | 694×564 | 708×576 | 480×360 | 182×61 |

No hay solapamiento marco/redes en las seis medidas: separación geométrica mínima de 5.2 px (1280×720); en 1024×600 hay 59.9 px. Se inspeccionaron todas las capturas de escritorio. Se mantiene el marco original y el orden Perfil/Usuarios, Inventario/Minijuegos, Tienda.

390×844 y 360×800: las capturas de Inicio y Perfil son idénticas byte a byte antes/después. El Inicio apaisado 844×390 también es idéntico. Sin scroll horizontal. Se conserva el scroll vertical natural del diseño móvil en alturas bajas.

## Pruebas y límites

9/9 pruebas existentes aprobadas mediante node --test tests/*.test.js. La validación estructural del ZIP pasó en su carpeta; también se ejecuta sobre el CSS integrado con node tests/validacion-estructural.mjs. npm test no pudo arrancar porque npm no está en PATH; se ejecutó el comando Node equivalente, sin instalar paquetes.

El servidor actualizado responde 200 text/css para el parche. package.json, .git/config y src/other.css devuelven 404. No se registraron errores de consola o JavaScript durante la revisión final.

Pruebas con Chromium de Edge, contexto nuevo sin preferencias de zoom guardadas, viewport CSS explícito, DPR=1 y visualViewport.scale=1. No se añadió CSS zoom ni transformaciones globales. No se ha medido ni alterado el zoom de la ventana personal de Chrome del usuario: la escala de sus capturas originales no queda confirmada y visualViewport.scale por sí sola no la demostraría. Para comparar manualmente, usar Ctrl+0 en esa ventana. Las capturas son emulaciones de escritorio/móvil, no una prueba de teléfono físico.

Si el servidor del usuario sigue ejecutando la versión anterior de dev-server.mjs, debe reiniciarse: el proceso antiguo mantiene en memoria la lista de rutas y puede devolver 404 para el parche aunque index.html ya lo enlace. Tras reiniciar, recargar con Ctrl+F5.
