# Validación local de Google y acceso tradicional

## Resultado
- npm test: **173 pruebas superadas**, 0 fallos, 0 omitidas.
- Incluye **23 pruebas específicas** nuevas de Google, SQL, HTTP, sesiones, proxy y páginas legales.
- npm run build: correcto; **485 archivos públicos**. Borradores, backend, migraciones y pruebas no se copian a dist.
- git diff --check: correcto.
- node tools/verify-google-auth.mjs: **14 estados visuales/recorridos**, 0 errores JavaScript.

## Qué se ha comprobado
PKCE S256, verificación remota simulada de identidad, rechazo de proveedores/usuarios no válidos, ausencia de tokens OAuth en respuestas, callback de un solo uso, caducidad y cancelación, cookie temporal Lax y cookie principal Strict.

Vinculación con contraseña y CSRF, protección en ambos sentidos (Google ya vinculado a otro nick y nick ya vinculado a otro Google), rechazo de sesión revocada/cuentas desactivadas, límites de intentos y cierre de sesión.

Registro explícito con nick libre, colisiones por mayúsculas y espacios externos, dos identidades solicitando el mismo nick, solicitudes repetidas/concurrentes, rollback completo ante fallo de perfil, persistencia entre instancias y aceptación versionada de textos legales.

Conservación exacta de contraseña/hash, nick, inventario y Perrilogo antiguos en pruebas PostgreSQL locales. Las cuentas sin contraseña reciben NULL y no pueden entrar por el formulario tradicional con una contraseña cualquiera. La sesión Google nueva también se ha utilizado con éxito en el dispatcher original de minijuegos.

RLS y permisos de anon/authenticated impiden leer los vínculos y verificadores. Proxy: destino cerrado, solo retorno OAuth local permitido, múltiples Set-Cookie conservados tanto en Headers estándar como con getAll de Workers.

Páginas legales: los borradores se rechazan, el HTML aprobado se sirve sin sesión con CSP, HEAD no devuelve cuerpo y POST se rechaza.

## Comprobación de navegador
Microsoft Edge headless con frontend y backend del repositorio y PostgreSQL PGlite local:
- 1440×900 y 1000×550, escritorio.
- 320×568, 390×844 y 667×375, móvil emulado y orientación apaisada.
- Login tradicional, vinculación con reautenticación, callback, entrada Google posterior, persistencia al recargar y logout.
- Registro explícito en 1440×900, 320×568, 390×844 y 667×375; rechazo de nick ocupado y alta correcta.
- Formularios dentro de la ventana, sin desbordamiento horizontal.
- Registro: acciones fijas y desplazamiento interior en pantallas bajas, con acceso a casilla de aceptación y enlaces.
- Revisión visual de capturas: marcos, márgenes, tipografía y controles conservan la presentación medieval.

Solo el proveedor OAuth está sustituido por una URL .invalid interceptada. El reloj del limitador avanza entre recorridos de la misma cuenta de prueba para no agotar artificialmente su cuota. No se ha contactado con Google/Supabase/Railway ni utilizado inventarios reales.

## Archivos
Modificados:
- backend/app.mjs, backend/server.mjs, backend/traditional-auth.mjs, backend/.env.example.
- functions/api/[[path]].js y dev-server.mjs.
- src/main.js, src/styles.css, src/services/api-client.js y src/services/live-ui.js.
- tests/production-access.test.js: Google deja de estar prohibido como texto de producción, manteniendo la prohibición de maquetas y de cerrar el login para entrar como invitado.

Nuevos:
- backend/google-auth.mjs y backend/legal-pages.mjs.
- sql/002-google-auth.sql y sql/002-google-auth-preflight-readonly.sql.
- tests/google-auth.test.js y tools/verify-google-auth.mjs.
- Esta documentación, borradores legales y capturas.

## Pendiente fuera del entorno local
No están verificadas las credenciales/redirects reales, las restricciones/triggers de las tablas de producción, los permisos del rol PostgreSQL desplegado, el recorrido HTTPS a través del proxy real ni Android/iOS físicos.

No se ha ejecutado npm run check:live contra producción. Los textos legales requieren datos y revisión del propietario antes de poder publicar el registro. La función se entrega desactivada hasta esa configuración manual.

No se hicieron Commit, Push, despliegues, cambios de credenciales ni modificaciones en Supabase. No se modificaron los archivos originales ni las mecánicas de los minijuegos.
