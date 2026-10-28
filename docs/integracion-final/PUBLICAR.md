# Publicación de la integración final

**Documento histórico, sustituido por docs/PUBLICAR_PRODUCCION.md.** No aplicar las instrucciones antiguas de crear otro servicio.

## Estado comprobado

2026-10-28: HEAD https://perrisushi.com/api/session respondió 404 con Server: railway-hikari. El dominio llega a Railway; esa ruta de la API nueva aún no está publicada. Esto no permite conocer el servicio/proyecto ni su configuración privada de Cloudflare. No se han abierto paneles, cambiado dominios, ejecutado SQL ni enviado peticiones a Supabase real.

En este equipo no existe backend/.env ni están definidas las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. No hay sesión CLI ni conector de Railway/Cloudflare disponible. El ZIP incluye metadatos y código de referencia, no credenciales ni una cuenta autorizada. La conexión real no puede darse por validada.

## GitHub Desktop

1. Añadir `F:\Perriweb 2.0` como repositorio local. Si Desktop indica que no existe Git, usar su opción de crear el repositorio aquí. No importar otra copia del proyecto encima.
2. Revisar Changes antes del primer commit. No deben figurar `.env`, archivos comprimidos, `.integracion-final`, referencias legacy ni backups. `.gitignore` los excluye. `backend/.env.example` contiene únicamente nombres y ejemplos vacíos.
3. Crear commit y Publish repository privado, o Push origin si ya se ha vinculado el repositorio correcto. No sustituir el repositorio antiguo sin conservar su revisión desplegada.

## Despliegue de prueba conservando la web antigua

Crear un servicio/entorno de prueba desde ese repositorio en el alojamiento existente; conservar el servicio antiguo y su dominio. El proyecto no ejecuta SQL de arranque ni migraciones. Railway dispone de `railway.json`: build `node scripts/build.mjs`, start `node backend/server.mjs`, comprobación `/healthz`. Se respeta PORT y se escucha en 0.0.0.0 en producción. `/healthz` solo indica configuración presente, no verifica acceso a las tablas.

Reutilizar las variables privadas SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del Railway existente; no pedir ni generar una clave Supabase nueva. Configurar además en el servicio nuevo:

| Variable | Valor |
| --- | --- |
| NODE_ENV | production |
| PUBLIC_ORIGIN | Origen HTTPS exacto que verá el navegador, sin ruta |
| SESSION_STORE | supabase |
| ALLOW_SUPABASE_SESSION_WRITES | true |
| CSRF_SECRET | Secreto aleatorio estable de al menos 32 caracteres |

Las sesiones persistentes insertan/eliminan únicamente filas propias `v2:` en `shop_sessions`; no alteran las sesiones antiguas. La configuración local por defecto usa memoria y no escribe sesiones en Supabase. No habilitar persistencia hasta probar la compatibilidad de esa tabla en el entorno de prueba. Los dos cambios personales habilitados escriben únicamente `shop_profiles.selected_logo_id` y `shop_notifications.read_at` del usuario autenticado.

### Frontend en Cloudflare Pages, backend en Railway

Si el proyecto Pages existente sigue siendo el frontend, configurar build `node scripts/build.mjs`, output `dist`, raíz del repositorio actual. El directorio `functions/api/[[path]].js` hace proxy de la API: no copiar backend dentro de dist.

En Pages, configurar `PERRIWEB_BACKEND_ORIGIN` con el origen HTTPS del servicio nuevo Railway y `PERRIWEB_PROXY_SECRET` con un secreto aleatorio >=32 caracteres. En Railway, configurar exactamente el mismo PERRIWEB_PROXY_SECRET. PUBLIC_ORIGIN será la URL de prueba de Pages, no la de Railway. Los secretos Supabase solo permanecen en Railway. El proxy preserva cookies y CSRF bajo el origen de Pages y reenvía la IP de Cloudflare únicamente con autenticación del proxy. No habilita CORS.

### Si Railway sirve también el frontend

El servidor incluye distribución estática con lista cerrada y puede servir todo bajo su propio origen. En ese caso PUBLIC_ORIGIN es su dominio HTTPS y PERRIWEB_PROXY_SECRET queda sin definir si no hay proxy Pages. Los límites por IP usan la IP de la conexión; si el hosting agrupa usuarios tras una IP de proxy, los límites se comparten. Para conservar límites por visitante usar la ruta Pages autenticada anterior, no confiar en un X-Forwarded-For enviado por el navegador. Mantener una réplica hasta disponer de límites distribuidos.

## Comprobación imprescindible antes del cambio de dominio

Con una cuenta propia autorizada, verificar inicio de sesión (también variación de mayúsculas), perfil, saldos exactos, inventario, usuarios públicos, historial, álbum y notificaciones. Primero realizar solo lecturas: estas no inicializan perfiles, inventarios, logros, premios ni registros de acceso. Probar después, de forma explícita, cambiar un Perrilogo poseído y marcar una notificación propia. Confirmar persistencia al recargar y cierre de sesión; esas acciones personales sí son escrituras esperadas. Un ID de logo no poseído debe rechazarse. No usar cuentas ajenas para probar.

Comprobar que /backend/.env, /backend/server.mjs, /tests/backend.test.js, /package.json y /shop-api no exponen código ni permiten acciones administrativas. Comprar y canjear deben responder operation_disabled. Comprobar PC y móvil bajo HTTPS y que se carguen los CSS y los iconos. La API de usuarios lee shop_public_users: su frescura y actualización por los sistemas antiguos deben verificarse con datos reales; no se reescribe esa tabla al consultar ni al cambiar avatar.

Solo después vincular el dominio definitivo al nuevo despliegue y actualizar PUBLIC_ORIGIN. Mantener el despliegue antiguo y su revisión para volver a vincularlo si hay problemas. No se ha publicado ni cambiado el dominio desde este encargo.

## Compras y canjes bloqueados

La lógica legacy de Random Key hace lecturas y actualizaciones separadas de ticket, pool, claim e inventario con bloqueo en memoria. No ofrece una transacción compartida segura entre procesos. No se ha copiado ni expuesto. No hay precio de boletos ni premios inventados. Para habilitarlos falta una operación transaccional e idempotente verificada en el servidor/BD; ese trabajo no se realiza mediante escrituras inseguras ni cambios de esquema en este encargo.
