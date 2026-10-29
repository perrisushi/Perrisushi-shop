# Investigación del login antiguo: 401

Actualización: la causa de los filtros con comillas añadidas se ha identificado y corregido posteriormente. Leer primero `ACCESS_NOT_FOUND_CORREGIDO.md`.

## Corrección local y límites

Se conserva la búsqueda de `shop_access` por `nick`, exacta primero y después ILIKE literal sin distinguir mayúsculas. No se selecciona una cuenta arbitraria si hay dos candidatos: esa ambigüedad ahora produce un fallo de datos 503 y un diagnóstico interno, en lugar de aparentar una contraseña incorrecta.

La verificación mantiene exactamente la normalización de la contraseña del backend original: `String(...).trim()` seguido de SHA-256 de los bytes UTF-8. No se convierte la contraseña a minúsculas ni se normaliza Unicode. Los hashes almacenados se recortan sin modificarlos. Las pruebas ejecutan la función de login original en un entorno aislado y comparan sus decisiones con las nuevas, incluyendo acentos, espacios Unicode y caracteres combinados.

`active=false` sigue bloqueando la cuenta. `true` y valores nulos admitidos por el sistema anterior se conservan. Un campo de tipo inesperado o un hash mal formado generan 503 y un diagnóstico de datos, no un falso rechazo de contraseña.

Se corrige un error confirmado: contraseña válida con fila ausente en `shop_players` devolvía 401. Ahora devuelve 503 y registra `player_missing`. El sistema antiguo llamaba a `ensurePlayer`; no se copia esa inicialización porque este encargo prohíbe cambiar cuentas o datos existentes. No se inventan registros para permitir entrar.

Antes de devolver éxito, el login persistente crea su propia sesión `v2:` y la lee desde `shop_sessions`. Comprueba token, propietario y vencimiento. Una escritura fallida, una fila invisible o una sesión no recuperable producen 503 y no entregan una cookie de éxito. Las sesiones antiguas no se borran ni sustituyen.

## Diagnóstico automático del próximo intento

Publicar los cambios por el procedimiento existente. No necesita SQL ni nuevas variables. La interfaz conserva su aspecto.

Después de un intento, buscar en los logs del servicio la línea JSON con `event: "traditional_auth"`. El encabezado de respuesta `X-Request-ID` permite localizar la misma petición. También se conserva al pasar por Pages.

| stage / reason | Interpretación |
| --- | --- |
| access_lookup / access_not_found | La consulta no devuelve esa cuenta. Puede ser otro proyecto, permisos/RLS o usuario inexistente; por sí solo no distingue esas causas. |
| access_lookup / query_failed | Falló la consulta de acceso; source, upstreamStatus y upstreamCode aportan el tipo de fallo, sin el texto crudo. |
| access_validation / access_disabled | La cuenta está desactivada explícitamente. |
| password_verification / password_mismatch | El hash SHA-256 de la contraseña normalizada no coincide con el registro leído. |
| password_verification / invalid_hash_format | El registro no contiene un SHA-256 válido; no se modifica. |
| player_lookup / player_missing | Las credenciales coinciden, pero no se encuentra la fila asociada. |
| session_create / session_write_failed | No se pudo guardar la nueva sesión. |
| session_readback / session_read_failed | Falló la lectura de confirmación. |
| session_readback / session_not_recoverable | La fila guardada no es recuperable o sus datos no coinciden. |
| session_restore / session_read_failed | Falló la recuperación de una sesión existente. |
| complete / authenticated | El backend verificó credenciales y confirmó la sesión. Esto no sustituye la comprobación del navegador y los datos reales. |

No se registran nick, IP, cuerpo de petición, contraseñas, hashes, tokens, cookies, cadenas de conexión ni mensajes crudos de errores. Los códigos de errores de origen están limitados a una lista segura. La respuesta pública no distingue usuario ausente y contraseña incorrecta para evitar enumeración de cuentas.

## DATABASE_URL frente a REST: comprobación manual de solo lectura

El login utiliza `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` mediante REST. **DATABASE_URL no interviene en la decisión de contraseña**; sirve para las transacciones de juegos. No se introduce un fallback silencioso entre dos bases distintas.

Se añade `npm run check:auth`. Ejecutarlo tú en un proceso privado con las variables existentes y, temporalmente, `PW2_VERIFY_NICK` y `PW2_VERIFY_PASSWORD` de una cuenta propia. No guardar esos valores en Git ni enviarlos por chat. No se han introducido credenciales reales ni ejecutado consultas remotas durante este encargo.

El comando consulta por REST y, si existe DATABASE_URL, abre una transacción PostgreSQL **READ ONLY**, con SELECT parametrizados y timeout. Comprueba acceso, contraseña, estado, player, consulta de sesiones y permiso SQL de inserción. Devuelve únicamente resultados booleanos/códigos seguros. No crea sesiones ni altera tablas, cuentas, contraseñas o inventarios.

- `rest.passwordMatches=false` y `postgres.passwordMatches=true` o `sourcesAgree=false`: las fuentes no devuelven el mismo registro; revisar manualmente el proyecto y sus variables/permisos. La coincidencia de registros no demuestra por sí sola que dos URLs apunten físicamente a la misma base.
- `postgres.reachable=false`: fallo de conexión, TLS, credenciales, permisos o esquema PostgreSQL. Se informa sin mostrar la URL ni la contraseña.
- `rest.reachable=false`: revisar el diagnóstico REST. Un HTTP 403 remoto no se presenta como contraseña incorrecta.
- `sessionInsertPrivilege=true` solo comprueba privilegios SQL del usuario PostgreSQL; no certifica RLS/triggers o la escritura REST. La lectura de confirmación del login prueba esa ruta en el intento real.

Tras publicar, basta con compartir la línea del diagnóstico seguro de un intento fallido, sin adjuntar otras líneas con datos privados. La causa del 401 real no se declara resuelta hasta verificar ese intento y recuperar los datos de la cuenta.

## Archivos

`backend/traditional-auth.mjs`, `backend/repository.mjs`, `backend/app.mjs`, `backend/server.mjs`, `scripts/check-auth.mjs`, `package.json`, `functions/api/[[path]].js`, `dev-server.mjs`, `tests/legacy-auth.test.js` y ajustes de `tests/backend.test.js`.

La validación local incluye 99 pruebas, navegador en seis tamaños de escritorio/móvil, cuatro juegos sobre PostgreSQL temporal, compilación y arranque. No certifica el acceso real a perrisushi.com.
