# Reparación de Perricofres y adaptación del inventario

## Causas demostradas en el código y reproducidas localmente

1. `POST /api/inventory/open` podía devolver HTTP 409 `inventory_mismatch` antes de ejecutar la apertura: se exigía que los dos contadores de cofres coincidieran exactamente con todo el recuento auxiliar de `shop_inventory_chests`. Esto bloqueaba incluso una unidad vigente, una cuenta con historial parcial o una bolsa sin relación con la discrepancia.
2. El cliente guardaba un UUID antes de enviar la petición, pero no lo retiraba ante ese rechazo. Lo trataba como resultado indeterminado y sustituía Abrir por Consultar apertura aunque la transacción hubiera sido rechazada. El texto de conservación no estaba respaldado por una consulta del recibo.
3. El inventario de escritorio conservaba `overflow:auto` en `.content-scroll` y otro scroll con altura máxima propia en `.pw04-inventory-grid`. En ventanas reducidas el marco, los saldos y la cuadrícula superaban el espacio útil. La corrección anterior solo resolvía la cadena de contenedores móviles.

Estos hechos se han comprobado con el código actual y PostgreSQL local. No se ha consultado la petición ni la base de producción durante esta ejecución. La apertura específica de la cuenta real sigue pendiente de comprobar después de publicar.

## Apertura reparada

- Se valida la unidad seleccionada y el contador original bajo bloqueo transaccional; no se exige igualdad global entre tipos de cofres ni se normalizan inventarios completos.
- Si existe una fila vigente para ese tipo, se bloquea y se marca como abierta en la misma transacción. Se exige que el UPDATE confirme una fila antes del COMMIT.
- Las unidades históricas del contador que no están representadas en el historial parcial mantienen la compatibilidad con las reglas originales. Se respetan las unidades que sí constan como caducadas, revocadas o indisponibles; no se reactivan ni se inventan caducidades.
- La sincronización opcional del backend antiguo no puede poner a cero los otros contadores durante una apertura. El gateway coordina la fila auxiliar correspondiente; el código original conserva el consumo y las reglas de premios.
- Cofre, premios, Perrilogos, historial y recibo se confirman juntos. Un fallo revierte la transacción completa. Se conservan la autenticación, CSRF, verificación de cuenta, bloqueo compartido de economía y validaciones de propiedad.
- Las reglas y probabilidades proceden del backend original, cuyos bytes y mecánicas siguen comprobados por las pruebas de integridad. No se han modificado los archivos originales de los cuatro minijuegos.

## Reintentos y consulta del resultado

Se incorpora `GET /api/inventory/open/status?itemId=...&id=...`, autenticado y limitado al propietario del recibo. Utiliza el mismo bloqueo que las aperturas para no leer cambios parciales y no consume unidades.

- Apertura confirmada: devuelve los premios del recibo y actualiza las cantidades.
- Rechazo definitivo: limpia el estado pendiente; Abrir sigue siendo Abrir y el error no afirma que se hayan conservado los objetos sin una comprobación.
- Respuesta perdida o error indeterminado: primero consulta el estado. Si ya existe recibo, muestra sus premios sin repetir el POST. Si todavía no hay recibo, permite reintentar con el mismo UUID, para que una petición retrasada tampoco pueda duplicar el consumo.
- Si no puede consultar el resultado, conserva el UUID y muestra Consultar apertura. Solo esa situación indeterminada utiliza ese botón.
- Los UUID que dejó la versión anterior también se consultan; si no hay recibo, dejan de mantener una falsa apertura pendiente.
- El resultado confirmado ofrece Abrir otro cuando quedan unidades, con un identificador nuevo por apertura deliberada.

## Inventario adaptable y acabado

Título, monedas y PC quedan fuera del desplazamiento. El único scroll activo del inventario está en la cuadrícula. Se ha corregido la cadena de altura, flexibilidad y tamaño mínimo en todos los tamaños de escritorio y móvil.

Las casillas mantienen proporciones cuadradas; hay seis columnas cuando caben y se adapta a cuatro o tres según el ancho interior real. Un ResizeObserver del inventario ajusta su tamaño a filas completas, contemplando el ancho de la barra y los márgenes, de modo que no asomen fragmentos de otra fila en el borde inferior. El observador se desconecta al cambiar de pantalla o cerrar la sesión. No hay zoom ni transformaciones de escala de la página.

En ventanas de muy poca altura se compactan el encabezado y los márgenes, y se reserva el espacio para todos los controles. Las redes de esa sección compacta permanecen disponibles al volver a Inicio. No se cambia el diseño de la portada ni se ocultan objetos para resolver el desbordamiento.

Los objetos sin imagen propia utilizan el icono genérico original ya empleado por sus fichas; su nombre completo está en el botón accesible, el tooltip y la ventana informativa. Esto evita desbordar nombres dentro de casillas pequeñas. No se han inventado imágenes, funciones o descripciones. Se han conservado eliminados los dos textos que el propietario había retirado de las fichas.

Las ventanas de recompensas conservan los gráficos originales y disponen de distribución compacta específica para móvil pequeño y horizontal. Se revisaron los tres premios, incluido el Perrilogo adicional, junto con Abrir otro, sin recortes.

## Pruebas superadas

- `npm test`: 150 pruebas, cero fallos y cero omitidas.
- `npm run build`: 485 archivos públicos; sin incorporar herramientas de prueba ni secretos.
- `node tools/verify-inventory-production.mjs`: ambos problemas comprobados en una misma ejecución, 15 escenarios, cero errores JavaScript. El frontend y backend actuales usan PostgreSQL local en memoria; no se simulan las respuestas de apertura ni de consulta de recibos.
- Trece resoluciones: PC 1920×1080, 1440×900, 1024×768, 800×900, 1100×620, 1000×550, 1200×400 y 900×280; móvil 320×568, 390×844, 430×932, 667×375 y 844×390.
- Cada tamaño verifica scroll interno por rueda o gestos táctiles, gestos fuera de la cuadrícula, posiciones fijas, filas completas, última casilla accesible, proporciones, imágenes dentro de sus casillas, seis tipos de contenedores, doble pulsación, Abrir otro y recuperación tras perder POST y la primera consulta y recargar.
- Se cubren además rechazos definitivos, UUID antiguos falsamente pendientes y reintentos con el mismo UUID cuando la petición inicial no llegó al servidor.
- Para cubrir siempre la rama de tres premios, el comprobador fija únicamente el primer valor aleatorio local a un valor válido y ejecuta las reglas originales; después restaura el generador. El recibo real de esa apertura se recupera en móvil pequeño y horizontal para verificarlo visualmente. No hay recompensas ni probabilidades nuevas en producción.
- Pruebas SQL: historial parcial, unidad vigente, caducidad, propiedad de recibos, concurrencia con UUID iguales y distintos, falta de unidades, error al registrar el recibo, fila auxiliar no confirmada y pérdida de respuesta después de un COMMIT exitoso. Inventario, perfil e historial revertidos cuando corresponde.
- `node tools/verify-mobile-layout.mjs`: diez escenarios adicionales de portada, menús, notificaciones y cinco secciones; sin regresión del scroll móvil ni errores JavaScript.
- La concurrencia SQL se comprueba con conexiones serializadas de prueba sobre PGlite. No se declara probada una instalación PostgreSQL/Railway distribuida ni un dispositivo físico o Safari/iOS.

## Archivos modificados

- `backend/games.mjs`: validación por unidad, coordinación transaccional y recuperación de recibos.
- `backend/game-transport.cjs`: documentación del modo de contadores coordinado por el gateway.
- `backend/app.mjs`: ruta de consulta del estado de apertura y parámetros autenticados.
- `src/main.js`: estados de apertura, recuperación, Abrir otro y ajuste del inventario a filas completas.
- `src/preview-pages.css`: contenedores del inventario y acabado adaptable de fichas.
- `src/services/api-client.js`: consulta del recibo y errores de apertura reconocidos.
- `src/services/live-ui.js`: mensajes normales, imagen genérica existente y nombres accesibles.
- `tests/backend.test.js`, `tests/games.test.js`: regresiones de HTTP y transacciones.
- `tools/verify-inventory-production.mjs`, `tools/verify-mobile-layout.mjs`: comprobadores locales reproducibles.
- Este informe, resultados y capturas.

## Publicación y comprobación pendiente

No se han modificado ni consultado datos reales de Supabase, no se han hecho pruebas destructivas sobre cuentas reales y no se ha accedido a Railway ni a GitHub. No se necesitan tablas, SQL, dependencias o variables privadas nuevas. Sin Commit ni Push.

El propietario debe revisar estos cambios en GitHub Desktop y publicar mediante su Commit y Push origin habituales. Deben desplegarse juntos frontend y backend. Después queda pendiente verificar una apertura real controlada en la web publicada, sus recompensas, la cantidad restante y el historial, así como las pruebas en móvil físico. No se declara comprobado ese resultado de producción.
