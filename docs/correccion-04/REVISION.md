# Corrección 04 — Usuarios, Inventario y Tienda

## Integración

Se leyeron las instrucciones y las seis capturas del ZIP. Se conservaron las correcciones 01, 02 y 03, Perfil, Historial, Perrilogos, Portada y navegación. No hay repositorio Git inicializado; se guardó copia de main.js, index.html y dev-server.mjs en `.correccion-04/antes/`.

El integrador suministrado se ejecutó con --dry-run y se detuvo sin escribir porque la lista blanca del servidor incorpora ya desktop-layout-fix.css. Se integró manualmente solo la importación, las tres funciones de vista, el inicializador, el enlace CSS y las dos rutas públicas nuevas. No se ejecutó su aplicación completa.

## Archivos

- src/main.js: sustitución localizada de usersView, inventoryView y shopView, importación e inicialización del módulo.
- src/preview-pages.js: módulo suministrado con 15 perfiles ficticios, 24 casillas (dos demos) y solo Random Key/Sorteos. Se añadió foco accesible a la lista de usuarios y desplazamiento al detalle al seleccionar un objeto.
- src/preview-pages.css: estilos suministrados acotados a las tres vistas; padding interior de 16 px para aprovechar el espacio sin afectar a las pantallas aprobadas.
- index.html: CSS nuevo después de las hojas existentes.
- dev-server.mjs: añade únicamente preview-pages.js y preview-pages.css a la lista explícita, manteniendo desktop-layout-fix.css.
- scripts/aplicar-correccion-04.mjs y tests/revision-04.mjs: archivos del ZIP conservados.
- tools/review-pages-04.cjs: prueba reproducible de navegador y comparación con la copia previa. Este informe, capturas y resultados en docs/correccion-04.

No se cambiaron src/styles.css, src/desktop-layout-fix.css, recursos originales, minijuegos ni conexiones o datos de Supabase. Las referencias del ZIP quedan en .correccion-04 y no se sirven por HTTP.

## Comprobaciones

- node --check para main.js y preview-pages.js: correcto.
- node --test: 9/9 pruebas existentes aprobadas.
- node tests/revision-04.mjs: aprobado.
- node tests/revision_sin_brillos.mjs: 2/2 aprobadas.
- node tests/validacion-estructural.mjs: aprobado.
- Navegador Edge/Chromium con contexto limpio y viewport CSS, sin preferencias de zoom guardadas: 1649×928, 1280×720, 390×844 y 360×800. Sin errores de consola ni JavaScript, solicitudes externas o desplazamiento horizontal.
- Se comprobaron 15 filas, acceso por teclado al scroll, nombre largo, 24 casillas, detalle de ambos objetos demo, exactamente dos pestañas, cambio con flechas/Inicio y compra/canje deshabilitados. Los dos recursos nuevos responden HTTP 200 con sus tipos correctos.
- Se compararon dimensiones y estilos calculados de todos los elementos de Portada, Perfil, Historial, Perrilogos y pantalla de Minijuegos antes/después: idénticos en los cuatro tamaños. El código de main.js fuera de las tres vistas y su importación/inicializador también coincide con la copia previa. Algunos PNG de PC difieren a nivel de píxel pese a conservar geometría y estilos; no se afirma identidad binaria de todas las capturas. Las comparaciones figuran en despues/results.json.
- Se inspeccionaron las capturas y resúmenes de Usuarios, Inventario, detalle, Random Key y Sorteos en los cuatro tamaños. Sin estrellas en cabeceras. En escritorio bajo, el contenido conserva scroll interno para acceder a todas las filas, casillas, datos y controles; en móvil también hay scroll cuando el contenido lo requiere. No se ha probado en un teléfono físico.

Los puntos y logros de Usuarios son explícitamente ficticios. Monedas y boletos personales siguen en «—». Las cantidades 2 y 5 son ejemplos visuales identificados, no objetos del usuario. No se habilitan compras, canjes, aperturas o recompensas.

## Visualización

Si el servidor anterior está abierto, reiniciarlo con `node dev-server.mjs`: la lista de rutas se carga al arrancar y el proceso antiguo puede devolver 404 para los nuevos archivos. Después, Ctrl+F5.

Capturas individuales y resúmenes en `despues/`. Para repetir las verificaciones: `node tools/review-pages-04.cjs --after` con Playwright disponible en la ruta de entorno o indicado mediante PLAYWRIGHT_MODULE. No hay dependencias nuevas para ejecutar la web.
