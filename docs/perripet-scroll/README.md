# PerriPet: encaje de escenas y desplazamientos

Corrección local, sin publicación ni cambios de datos de producción.

## Causa demostrada

La ventana de PerriWeb contiene un iframe cuyo viewport ya descuenta su encabezado. Dentro del iframe, HTML, body y #root no desbordaban. El desplazamiento estaba en main.perripet-app-root--wide: la capa de integración imponía width:min(1152px,100vw), anulaba el max-width original (que también consideraba la altura) y limitaba el alto con max-height:100dvh y overflow:auto. Las escenas de Tienda, Granja y Encuentros conservaban su proporción 3:2 y resultaban más altas que ese main.

Reproducción en PC 1280 × 720: iframe 1171 × 658 CSS px; main con clientHeight=658 y scrollHeight=768. No era un scroll del documento ni del marco exterior.

## Corrección

- src/game-presentation.css: las escenas anchas de PerriPet usan el mínimo entre 1152 px, el ancho del iframe y 1,5 veces su altura. Su alto natural vuelve a caber; se retira el tope que forzaba el scroll. No se añade overflow:hidden para esconder el error.
- El cambio se limita a body.perripet-embedded. No afecta a los otros juegos, el marco, la cabecera, cerrar/ampliar ni al escalado de PerriWeb.
- En la misma reproducción, main pasa a 987 × 658 y scrollHeight=clientHeight=658; scrollWidth=clientWidth=987.
- Las unidades de viewport pertenecen al iframe. El navegador recalcula al redimensionar, ampliar o girar, sin observadores ni transformaciones nuevas.
- Hallazgo adicional: las tarjetas de regaderas imponían 14rem de altura mínima y dejaban Cancelar fuera del escenario móvil. Ahora su imagen, padding y mínimo se ajustan a la altura disponible. Se conservan todas las opciones y acciones.
- Los catálogos, cápsulas y listas de habilidades conservan sus desplazamientos internos cuando su contenido realmente lo necesita. No se ha ocultado ni eliminado ningún artículo.

## Inventario de vistas y comprobaciones

Escenas: mascota (huevo, bebé, juvenil y las dos formas adultas), Tienda y sus pestañas Comprar/Granja/PerriRPG/Vender/PerriCoins, Granja con nueve huertos, Encuentros con cinco tarjetas, animación de combate y resultado.

Diálogos: necesidades, alimentación, información de comida, cápsulas, incubadora, entrenamiento, evolución, estadísticas, muerte, aviso de descanso, estadísticas de combate, detalle de habilidad, resultado de combate, terreno bloqueado, selección de semillas, selección de regadera y ayuda de granja.

Las comprobaciones en Edge verifican dimensiones de HTML, body, #root y main, límites de controles, navegación real, pestañas, selección del quinto encuentro y conservación del tamaño del marco tras ampliar/restaurar. Los estados y combates de prueba se ejecutan solo en PostgreSQL efímero (PGlite), con cuentas locales ficticias.

Resoluciones: PC 1920 × 1080, 1366 × 768 y 1280 × 720, normal/ampliado; viewports CSS 1600 × 900 y 1024 × 576 equivalentes al espacio disponible al 80 % y 125 % desde 1280 × 720; móvil emulado 844 × 390, 667 × 375 y 390 × 844. Los diálogos condicionales se ejercitan en PC y móvil horizontal. Las escenas y pestañas también se prueban en vertical.

## Pruebas reproducibles

- npm test: 231 pruebas superadas.
- npm run build: correcto; genera dist local, no despliega.
- node tools/verify-perripet-fit.mjs: 202 comprobaciones superadas, sin errores JavaScript; regresión específica con mediciones y capturas. Guarda perripet-results.json en la carpeta temporal perriweb-perripet-fit-qa (o PW2_QA_DIR). Requiere Edge y el módulo Playwright local; admite PLAYWRIGHT_MODULE.
- node tools/verify-game-view.mjs: 17 casos superados del visor original de los cuatro juegos, incluidos apertura, ampliación, cierre, orientación y alternativas a fullscreen no disponible.

## Comparativas

| Vista | Antes (PC) | Después (PC) | Móvil horizontal |
| --- | --- | --- | --- |
| Tienda | [Antes](capturas/before-Tienda.png) | [Después](capturas/after-Tienda.png) | [Móvil](capturas/mobile-Tienda.png) |
| Combate | [Antes](capturas/before-Combate.png) | [Después](capturas/after-Combate.png) | [Móvil](capturas/mobile-Combate.png) |
| Granja | [Antes](capturas/before-Granja.png) | [Después](capturas/after-Granja.png) | [Móvil](capturas/mobile-Granja.png) |

## Límites de la verificación

No se ha usado un teléfono físico ni se ha automatizado el control de zoom de la barra de Edge: se verificó el espacio CSS equivalente. No se ha probado contra cuentas o datos de producción. Las pruebas locales no certifican compras o recompensas reales. No se han cambiado bundles, recursos originales, mecánicas, API, Supabase, Twitch o YouTube. No se ha hecho commit, push ni despliegue.
