# Inventario y aperturas: integración y acabado

## Función integrada

La ficha anterior solo mostraba información. Ahora permite abrir Perricofres, Perricofres de minijuego, Bolsa de Gemas, Bolsa de Chatarra, Bolsa Especial y Cajita de Armas, utilizando las reglas del backend original. No hay premios calculados en el navegador ni sustitutos de la conexión real.

`POST /api/inventory/open` acepta únicamente el identificador del objeto y el UUID de la operación. La identidad procede de la cookie y se exige el CSRF de la sesión. El servidor selecciona la acción original y la ejecuta en el gateway transaccional existente: bloqueo compartido de economía, revalidación de sesión, propiedad, consumo y premio dentro de la misma transacción y recibo idempotente. La acción antigua que concedía premios de cofre sin consumir inventario sigue bloqueada.

Se conserva el identificador de una apertura sin respuesta en la sesión del navegador. Al reintentar, cerrar/reabrir o recargar se recupera el mismo recibo sin repetir el consumo ni la recompensa. Si el objeto ya desapareció del inventario, hay un acceso a consultar esa apertura. Tras el éxito se actualizan el inventario y el perfil; las siguientes consultas de historial y notificaciones utilizan los datos actualizados.

La disponibilidad y cantidad de cofres se consultan a partir de los registros existentes de propiedad y caducidad, sin modificar nada durante la lectura. La apertura no se ofrece si la conexión compartida no se verifica. Se impide que la inicialización antigua sobrescriba el catálogo actual de Perrilogos durante estas operaciones.

## Presentación

Cuadrícula móvil con un único scroll, saldos y título fijos. Fichas con gráficos originales, cantidad y descripción conocida. Confirmación explícita del consumo de una unidad. Recompensas confirmadas con imagen y nombre original. En horizontal, cofre y lista de premios se distribuyen en dos columnas para que no se recorten; cierre accesible y navegación por teclado/tacto. No hay botones de apertura para objetos sin una acción implementada.

Auditoría de textos visibles de producción sin mensajes de maqueta o desarrollo. Los datos locales de las herramientas de verificación no forman parte del código público ni del paquete publicado.

## Pruebas realizadas

- 136 pruebas superadas, cero fallos y cero omitidas.
- Compilación: 485 archivos públicos; sin incorporar pruebas, herramientas ni credenciales.
- Pruebas SQL sobre PostgreSQL local en memoria (PGlite): consumo y premios de los seis tipos, recibo repetido, peticiones concurrentes mediante conexiones serializadas de prueba, propiedad del recibo, falta de unidades, caducidad, identidad ajena, parámetros manipulados y reversión completa ante fallo al registrar la operación. Catálogo original sin cambios.
- Pruebas HTTP: autenticación, Origin, CSRF, selección cerrada de acciones y exclusión de datos internos de la respuesta.
- `node tools/verify-inventory-production.mjs`: frontend y backend actuales conectados a PostgreSQL local, sin simular las respuestas de apertura. Seis tipos en seis resoluciones (1440×1000, 1024×768, 320×568, 390×844, 430×932 y 844×390): 36 aperturas y seis recuperaciones adicionales después de perder deliberadamente una respuesta ya confirmada y recargar. Recompensas e imágenes cargadas; comprobadas dimensiones, lista completa y ausencia de superposiciones en móvil. Cero errores JavaScript.
- `node tools/verify-mobile-layout.mjs`: siete resoluciones móviles y tres de escritorio; portada, menús, notificaciones y cinco secciones; gestos táctiles emulados dentro y fuera de una cuadrícula larga. Geometría y estilos del inventario de escritorio conservados. Cero errores JavaScript. Se corrigió el comprobador para esperar la carga de imágenes antes de comparar dimensiones.
- Las pruebas de integridad confirman que los recursos y mecánicas originales de los cuatro minijuegos permanecen intactos.

## Archivos

- `backend/app.mjs`: endpoint de apertura, DTO y disponibilidad del inventario.
- `backend/games.mjs`: acciones cerradas, lectura de disponibilidad y transacción existente.
- `backend/game-transport.cjs`: preservación del catálogo durante aperturas.
- `src/main.js`: confirmación, reintento/recuperación y presentación de premios.
- `src/preview-pages.css`: acabado de fichas y adaptación horizontal.
- `src/services/api-client.js`: comunicación con la apertura autenticada.
- `src/services/live-ui.js`: error normal de propiedad y nombres legibles de objetos para accesibilidad.
- `tests/backend.test.js`, `tests/games.test.js`: regresiones de seguridad y persistencia.
- `tools/verify-mobile-layout.mjs`, `tools/verify-inventory-production.mjs`: comprobación local reproducible.
- Este informe, resultados y capturas.

## Límites de la validación y publicación

No se ha accedido a GitHub, Railway ni Supabase. No se han modificado tablas ni datos de producción, variables privadas ni archivos originales de minijuegos. No se ha hecho Commit, Push ni despliegue. No se necesitan dependencias, variables nuevas ni SQL nuevo para este cambio; requiere la conexión PostgreSQL compartida y las tablas originales ya utilizadas por el backend.

No se declara verificada la apertura contra Supabase real ni el funcionamiento en un dispositivo físico/Safari. Antes de considerarla validada en producción, el propietario debe comprobar la conexión y permisos existentes y una apertura controlada con su cuenta tras publicar. Las pruebas en memoria no sustituyen esa comprobación ni prueban concurrencia entre servidores de producción.
