# Notificaciones: bandeja e historial

Cambios locales, sin despliegue ni escrituras en Supabase de producción.

## Funcionamiento comprobado en el código y esquema exportado

- `shop_notifications` conserva `id` UUID, `nick`, `kind`, `title`, `message`, `payload`, `action_url`, `created_at`, `updated_at` y `read_at`. El propietario referencia `shop_players(nick)`.
- Los desencadenadores originales generan avisos cuando aumentan determinados recursos. El backend original también crea comunicaciones y avisos de bienvenida. Estos productores no se modifican.
- La lectura existente hace PATCH únicamente de `read_at`, filtrando por nick autenticado, UUID y `read_at IS NULL`. Es persistente e idempotente, no borra ni traslada filas físicamente.
- Antes se consultaban juntas nuevas y revisadas, ordenadas por UUID ascendente. La lectura era manual y no existía actualización de la campana.

## Corrección

- GET `/api/notifications?state=unread` devuelve exclusivamente nuevas; `state=read` devuelve revisadas. GET nunca marca lectura.
- Orden descendente por `created_at,id`, con cursor compuesto que conserva microsegundos. No utiliza offset: marcar como leída una página no salta los siguientes avisos.
- La interfaz deduplica por UUID al paginar, sin fusionar ni borrar comunicaciones de contenido coincidente.
- Campana roja si existe al menos un aviso pendiente. Consulta al entrar, navegar, regresar a la pestaña y cada 30 segundos mientras la aplicación esté visible.
- Solo se confirma lectura de tarjetas renderizadas y visibles en el panel abierto. Lo que queda fuera del scroll o no llega a mostrarse sigue pendiente. Se conserva la tarjeta durante esa apertura para permitir leerla; al volver a abrir, ya solo aparecen las nuevas pendientes.
- Si falla la confirmación, el panel ofrece reintentar. No se inventa un éxito ni se elimina el aviso.
- Historial desde un segundo botón junto al historial de actividad, con las mismas clases y dimensiones. Fechas en español y zona Europe/Madrid.
- Se conservan Origin, CSRF, cookie de sesión, identidad derivada del servidor y filtros por propietario. Las respuestas de una sesión anterior no actualizan otra cuenta.

## Validación local

`npm test`, `npm run build` y `node tools/verify-notifications.mjs`.
Las pruebas utilizan PostgreSQL efímero y navegador local con sesiones y credenciales exclusivas de prueba. Verifican cuentas Alpha/Beta, sin nuevas, una nueva, varias páginas, tarjetas visibles y ocultas, persistencia tras recargar y volver a iniciar sesión, nuevos avisos posteriores, cierre durante la carga, lectura idempotente y rechazo de CSRF/cursores manipulados.

## Supabase real

No se necesita migración SQL con el esquema exportado existente. No hay credenciales locales configuradas para comprobar la base de producción; por ello no se declara verificada su conexión real ni la ausencia de avisos duplicados en sus datos.

Se incluye `sql/diagnostico-notificaciones-solo-lectura.sql` para consultar columnas, restricciones, índices, productores y recuentos reales sin modificar filas. Sus coincidencias no autorizan borrar ni combinar avisos: pueden representar eventos legítimos.
