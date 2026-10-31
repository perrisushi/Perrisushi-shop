# Prueba privada de Google Login, sin registro ni publicación legal

Fecha: 31 de octubre de 2026. No requiere SQL. No se han consultado ni modificado servicios de producción desde el asistente.

## Variables para la publicación autorizada de esta corrección

Conservar las variables actuales de conexión, TLS, sesiones, minijuegos y economía. En el servicio Railway existente:

PW2_GOOGLE_ENABLED=true
PW2_GOOGLE_TEST_MODE=true
PW2_GOOGLE_TEST_EMAIL=correo exacto de la cuenta Google autorizada, escrito únicamente en Railway
PW2_GOOGLE_REGISTRATION_ENABLED=false
PW2_LEGAL_PUBLISHED=false
PUBLIC_ORIGIN=https://perrisushi.com
SESSION_STORE=supabase
ALLOW_SUPABASE_SESSION_WRITES=true
NODE_ENV=production

No copiar literalmente la explicación del correo como valor. No hace falta compartir ese correo con el asistente. Mantener SUPABASE_PUBLISHABLE_KEY o SUPABASE_ANON_KEY del mismo proyecto y los secretos existentes. No añadir credenciales de Google Cloud ni copiar secretos al repositorio.

## Qué garantiza el modo privado

- El servidor verifica el correo exacto de la identidad Google en la respuesta autenticada de Supabase Auth, con email_verified=true. No confía en un correo enviado por el navegador ni en user_metadata. No equipara alias, puntos ni sufijos + de Gmail. No registra el correo en diagnósticos ni lo devuelve en la configuración pública.
- La lista permitida es un solo correo. Si falta o es inválido, Google no puede comenzar; el acceso tradicional no depende de ese dato.
- Las identidades no autorizadas se rechazan antes de crear vínculos o sesiones PerriWeb. La plataforma externa puede registrar la autenticación en Supabase Auth; eso no equivale a crear un jugador ni inventario PerriWeb.
- Las altas están deshabilitadas de forma independiente en el backend, incluso si se intentan directamente por API o si se publican legales por error. Una identidad permitida que aún no está vinculada debe entrar primero con su contraseña tradicional y vincular Google desde Mi perfil.
- El modo privado mantiene los documentos legales sin publicar, incluso ante un PW2_LEGAL_PUBLISHED=true accidental. No intenta cargar HTML incompletos. Nunca se habilita automáticamente el registro al terminar la prueba.
- Se mantienen CSRF, comprobación de contraseña para vincular, PKCE, cookies seguras, origen, caducidad, vínculos únicos y bloqueo de cuentas desactivadas. La prueba solo añade el vínculo autorizado y las sesiones correspondientes; no cambia contraseñas ni recursos.

## Pasos manuales, breves

1. Cuando el propietario autorice publicar esta corrección, realizar Commit y Push origin desde GitHub Desktop. Aplicar las variables anteriores como parte del despliegue autorizado. No hacerlo antes: Push o guardar variables puede iniciar despliegue.
2. Abrir https://perrisushi.com en el navegador normal y entrar con el usuario y contraseña propios.
3. Mi perfil → Vincular Google → contraseña original → seleccionar el mismo correo configurado en PW2_GOOGLE_TEST_EMAIL. Si ya estaba vinculado, pasar al siguiente paso.
4. Al volver, comprobar el mismo nick, Perrilogo y saldo. Cerrar sesión.
5. Pulsar Continuar con Google y elegir ese mismo correo. Comprobar la cuenta, recargar y verificar que la sesión continúa.
6. Cerrar sesión y entrar de nuevo con la contraseña original. Repetir el acceso Google desde el móvil.

No crear un usuario nuevo para esta prueba. No repetir migraciones. No cambiar el callback ya autorizado: https://perrisushi.com/api/auth/google/callback.

## Verificación y límites

La comprobación local utiliza solo un proveedor externo simulado y PostgreSQL efímero. El recorrido real Google/Supabase y el alojamiento solo pueden comprobarse después del despliegue autorizado. No se declara probado por pasar los tests locales.

Si ocurre un error, compartir únicamente el mensaje visible y en qué paso aparece; nunca cookies, tokens, contraseñas o claves. El modo de pruebas de Google Cloud no sustituye la restricción que ahora aplica el backend.

## Validación del modo privado — 31 de octubre de 2026

- npm test: 203 pruebas superadas, cero fallos.
- Compilación: 485 archivos públicos, correcta; git diff --check correcto.
- Navegador modo privado: 12 comprobaciones, cinco tamaños PC/móvil, cero errores JavaScript. Vinculación, acceso, recarga, rechazo de otra identidad, alta cerrada y páginas legales no publicadas.
- Navegador de regresión anterior: 19 comprobaciones, cero errores JavaScript.
- Proxy de producción y desarrollo: reconoce únicamente los retornos locales nuevos google_not_allowed y registration_unavailable; mantiene bloqueo de redirecciones externas y códigos desconocidos.
- Correo permitido ausente/incorrecto: Google se bloquea antes de crear un flujo; el acceso tradicional sigue funcionando.
- No se ha ejecutado SQL de producción, consultado cuentas reales, modificado inventarios, hecho Commit, Push ni desplegado.
- OAuth real pendiente: requiere que el propietario publique esta corrección y configure el correo permitido; las pruebas locales usan un proveedor simulado, no las credenciales reales de Google.

Capturas locales: carpeta temporal perriweb-google-qa-private. No contienen cuentas ni credenciales reales.
