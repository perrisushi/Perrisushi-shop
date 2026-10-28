# Corrección de acceso y limpieza de producción

Aplicada localmente sobre `F:\Perriweb 2.0`. No se ha accedido a GitHub, Railway ni Supabase. No se han cambiado tablas, contraseñas ni registros reales.

## Comportamiento

- El documento arranca cerrado. Antes de dibujar una ruta se consulta la sesión al servidor. Sin sesión se muestra únicamente el formulario tradicional, sin cierre por botón, fondo ni Escape.
- Login correcto lleva a la portada; una sesión válida al recargar recupera el perfil desde el backend. El avatar lleva a Mi perfil, no a un segundo formulario.
- Logout retira inmediatamente el contenido privado y revoca la sesión en el servidor. Una respuesta 401 en consultas privadas o acciones de juegos devuelve al acceso. La restauración desde la caché de navegación vuelve a comprobar la sesión.
- Las rutas directas y los recursos de los cuatro juegos comprueban la sesión en Node y en el middleware opcional de Pages. Las API privadas conservan su validación de identidad y CSRF.
- Se conserva el SHA-256 tradicional, el tratamiento de espacios y el nombre canónico de las cuentas antiguas. Se corrige la incompatibilidad de `active`: los registros existentes con valor nulo siguen la regla antigua (no estar explícitamente desactivados). Las cuentas con `active=false`, los registros ausentes y las contraseñas incorrectas continúan bloqueados. No se crean cuentas para hacer que el login funcione.
- Se elimina el módulo puente `src/preview-pages.js`, incluido su archivo compilado. Las pantallas se generan exclusivamente desde las vistas conectadas de `live-ui.js`. Se conservan los estilos visuales aprobados.
- Se retiran explicaciones de desarrollo, insignias provisionales, Google, acceso duplicado desde perfil y botones económicos inactivos. La economía conserva su activación segura: retirar un botón no habilita una operación.

## Archivos cambiados

Interfaz: `index.html`, `src/main.js`, `src/services/live-ui.js`, `src/services/api-client.js`, `src/styles.css`, `src/preview-pages.css`, `src/game-bridge.js`. Eliminado `src/preview-pages.js`.

Servidor y entrega: `backend/app.mjs`, `backend/site.mjs`, `backend/server.mjs`, `backend/public-paths.mjs`, `dev-server.mjs`, `functions/_middleware.js`, `scripts/build.mjs`. Se regenera `dist`; esa carpeta permanece excluida de Git porque Railway ejecuta el build.

Pruebas: `tests/production-access.test.js`, `tests/backend.test.js`, `tests/frontend-contract.test.js`, `tests/revision-04.mjs`, `tools/verify-integration-final.mjs`, `tools/verify-production-local.mjs`. Capturas y resultados locales actualizados.

## Validación local

- `npm test`: 83 pruebas aprobadas, ninguna omitida. Incluye cuentas heredadas, sesiones persistentes tras reiniciar el backend, revocación, aislamiento entre cuentas, rutas de juegos protegidas en Node/Pages y ausencia de textos provisionales en vistas y errores públicos.
- `node tools/verify-integration-final.mjs`: seis tamaños PC/móvil; login no cerrable, contraseña incorrecta con conservación del usuario, sesión al recargar, datos de perfil/inventario/usuarios/historial/notificaciones, cambio de Perrilogo, logout y caducidad durante navegación. Cero errores JavaScript. Los datos de este ensayo son exclusivamente locales.
- `node tools/verify-production-local.mjs`: los cuatro juegos originales en escritorio y móviles de 390 y 360 píxeles, más canje/compra y reintentos sin duplicación sobre PostgreSQL embebido. Cero errores inesperados y recursos 404.
- `node scripts/build.mjs`: 480 archivos públicos; no publica el módulo eliminado ni archivos privados.
- `node tools/verify-release-start.mjs`: nueve comprobaciones de arranque aprobadas.

## Publicación y comprobación pendiente

Esta corrección no requiere SQL nuevo ni variables nuevas. Publicar los archivos modificados en la misma raíz de aplicación y rama que ya utiliza Railway. Incluir el middleware si el frontend se sirve mediante Pages. Retirar del árbol publicado cualquier copia antigua de `src/preview-pages.js`; el build local ya la ha retirado.

En GitHub Desktop: revisar Changes, Commit y Push origin. Después del despliegue, recargar sin caché. Comprobar con una cuenta antigua propia: contraseña incorrecta, contraseña correcta, perfil/avatar/saldos, recarga, juegos, logout y apertura directa de una ruta de juego sin sesión.

No se ha probado el acceso real en perrisushi.com ni las respuestas del Supabase publicado. No puede afirmarse que este cambio resuelva cualquier fallo de configuración del alojamiento: los errores reales de red, permisos o variables siguen pendientes de comprobar por el propietario. Si falla, aportar el estado HTTP y el código de error de `/api/auth/login` o `/api/session`, sin contraseñas, cookies ni claves privadas.
