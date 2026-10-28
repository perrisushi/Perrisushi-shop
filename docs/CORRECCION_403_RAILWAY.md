# Corrección y diagnóstico del 403 de acceso

## Hallazgos confirmados en el código

El backend actual no contiene `originOkay()` ni compara Origin con Host o X-Forwarded-Proto. Valida el Origin del navegador contra PUBLIC_ORIGIN. El HTTPS de las cookies depende del origen configurado, no del HTTP de la conexión interna del contenedor.

Antes de esta corrección, varios rechazos distintos devolvían exactamente `403 {"error":"forbidden"}`. Ese resultado no permitía determinar cuál había fallado. El login se procesa antes de la comprobación de CSRF de operaciones autenticadas: no requiere un token de una sesión que todavía no existe.

El 403 propio del login ocurre antes de verificar la contraseña. Si la contraseña es incorrecta devuelve 401; un rechazo REST de Supabase se normaliza a 503. La autenticación tradicional conserva SHA-256 y la normalización heredada, sin migrar contraseñas ni cuentas.

## Cambios

- Respuestas específicas, sin secretos: `origin_mismatch` (A01), `proxy_auth_required` (A02), `cross_site_request` (A03), `csrf_invalid` (A04). Un formato de cuerpo incorrecto devuelve 415 `unsupported_media_type` (A05). Se mantienen todos los rechazos y el CSRF de las operaciones autenticadas.
- PUBLIC_ORIGIN se valida como origen HTTP(S) sin rutas, usuario, contraseña, consulta ni fragmento. Producción sigue exigiendo HTTPS.
- El servidor redirige las entradas GET/HEAD de portada desde el alias www al dominio configurado, o a la inversa, antes de mostrar el formulario. El destino siempre es la constante configurada. No redirige POST ni acepta dominios arbitrarios. Esto corrige el caso reproducido en que la web se abre desde www y PUBLIC_ORIGIN apunta al dominio sin www.
- Host y X-Forwarded-* no pueden autorizar un origen ajeno. El secreto del proxy, si está configurado, sigue siendo obligatorio.
- No cambia el diseño, las tablas ni los registros; tampoco se habilitan nuevas operaciones económicas.

## Configuración manual del despliegue existente

1. PUBLIC_ORIGIN debe ser `https://perrisushi.com` si esa es la dirección principal, o `https://www.perrisushi.com` si utilizas www. No debe ser el dominio interno de Railway, `http://...` ni una URL con rutas. No se ha leído la configuración real de tu servicio.
2. Si Node/Railway sirve directamente la web y `/api`, el navegador no aporta un secreto de proxy. En esa arquitectura no configurar PERRIWEB_PROXY_SECRET: es una variable exclusiva del enlace entre Pages y Railway. No poner su valor en el frontend para solventar A02.
3. Si Pages sigue sirviendo el frontend, conservar el mismo secreto privado en Pages y Railway. El proxy `functions/api/[[path]].js` lo añade en servidor; el Origin reenviado debe seguir siendo el dominio público del frontend. A02 en esta arquitectura exige revisar el enlace del proxy, no quitar su protección.
4. Publicar por Commit y Push en la rama existente. Repetir el acceso desde la dirección canónica. Esta corrección no necesita SQL ni cambios de cuentas.

Si aparece A01 después del despliegue, comparar el Origin de la petición con PUBLIC_ORIGIN. Si aparece A02, revisar qué arquitectura de las dos anteriores se utiliza. Los códigos no exponen el origen esperado, claves, usuarios ni contraseñas.

## Pruebas y límites

Las pruebas usan un proxy HTTP real y dos servidores loopback con `Host: railway.internal:8080`, `X-Forwarded-Proto: https`, Origin HTTPS y respuestas REST locales. Comprueban login 200, cookie Secure/HttpOnly, recuperación de sesión, logout, rechazo de orígenes ajenos/ausentes/nulos, CSRF obligatorio, secreto de proxy, redirección www y diferencia entre errores de contraseña, Origin y Supabase.

Se ha reproducido el defecto de dominio alternativo y corregido localmente. No se ha inspeccionado el tráfico del Railway real ni accedido a Supabase. No se puede atribuir todavía el 403 observado a una única variable del despliegue, ni declarar comprobado el acceso de una cuenta real.

Archivos: `backend/request-security.mjs`, `backend/app.mjs`, `backend/server.mjs`, `src/services/api-client.js`, `src/services/live-ui.js`, `tests/railway-auth.test.js` y esta documentación. La compilación pública se regenera con el proceso habitual.
