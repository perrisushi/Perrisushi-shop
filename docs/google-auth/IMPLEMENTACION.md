# Google en PerriWeb: implementación y puesta en marcha manual

El código queda local, sin Commit, Push, despliegue ni acceso a producción. Google está desactivado por defecto. Las pruebas locales no demuestran que la configuración real de Google/Supabase sea correcta.

## Qué cambia
- Se conserva usuario/contraseña, SHA-256 con trim, nick canónico y cookie pw2_session.
- OAuth Google mediante PKCE S256 en backend. El proveedor se autentica en el mismo proyecto Supabase.
- pw2_google_links relaciona auth.users.id con el nick original (unicidad en ambos sentidos).
- Para vincular se exige sesión válida, CSRF y contraseña actual. El callback vuelve a comprobar la sesión original y las cuentas activas. Rota esa sesión; no cambia su contraseña ni sus datos.
- Sin vinculación, el callback solo deja un registro temporal pendiente. El jugador se crea tras elegir un nick libre y aceptar los textos publicados.
- Alta transaccional mediante INSERT: jugador, acceso sin contraseña (NULL), inventario, perfil inicial Pelusa, lista pública, vinculación y sesión. Un fallo revierte todo. No se usa UPSERT sobre datos antiguos.
- El registro comprueba nicks ocupados en shop_players y shop_access, ignorando mayúsculas y espacios externos. Las cuentas antiguas desactivadas también reservan su nick.
- Las cuentas nuevas de Google no reciben contraseña ficticia. El formulario tradicional las rechaza con el mismo mensaje genérico de credenciales incorrectas.
- Las sesiones nuevas utilizan shop_sessions y las comprobaciones actuales de los minijuegos. No se modifica su código original, mecánicas o recompensas.
- Se conserva la versión (SHA-256 del HTML legal aprobado) y fecha de aceptación para las altas nuevas.

Supabase Auth puede crear su registro auth.users durante OAuth. Eso no crea automáticamente una cuenta PerriWeb ni concede objetos. No se intenta deducir una cuenta antigua a partir del correo o nombre de Google. Una persona puede crear voluntariamente otra cuenta con otro nick; sin una prueba de propiedad no se pueden identificar automáticamente personas que ya tienen cuentas tradicionales.

## Antes de habilitarlo
1. Revisar sql/002-google-auth-preflight-readonly.sql en el proyecto correcto. Es exclusivamente lectura. Comprueba columnas, valores por defecto, restricciones, duplicados antiguos y triggers.
2. Revisar especialmente triggers/hooks de auth.users: ninguno debe crear jugadores o recompensas automáticamente. Este código no instala tales triggers.
3. Confirmar que SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL y la clave pública pertenecen al mismo proyecto. El arranque rechaza discrepancias reconocibles. Los dominios personalizados o formatos no reconocidos requieren comprobación manual.
4. Ejecutar manualmente sql/002-google-auth.sql después de autorizarlo. NO ejecutar los SQL de tests/fixtures en producción. La migración está en una transacción y no actualiza registros existentes: permite code_hash NULL y crea las dos tablas privadas.
5. El usuario PostgreSQL del backend debe tener permisos sobre las tablas nuevas y las tablas habituales. No conceder acceso a anon/authenticated ni crear políticas de acceso a estos vínculos desde el navegador. Si se usa un rol PostgreSQL personalizado, revisar sus permisos con el administrador.
6. Revisar y aprobar los textos legales como indica legal/REVISION.md. Los borradores no se copian a dist y el servidor se niega a publicarlos si conservan las marcas de revisión.

## Supabase: URL exacta
Authentication → URL Configuration:
- Site URL: https://perrisushi.com
- Redirect URLs: https://perrisushi.com/api/auth/google/callback

Es la URL de retorno de Supabase hacia PerriWeb. La URI configurada en Google Cloud sigue siendo la del proveedor de Supabase (https://<proyecto>.supabase.co/auth/v1/callback), no la de PerriWeb. No cambiar los secretos OAuth existentes.

## Variables del backend
Mantener las actuales. Añadir únicamente:
- PW2_GOOGLE_ENABLED=true (solo al terminar SQL y revisión).
- SUPABASE_PUBLISHABLE_KEY: clave publishable o anon del mismo proyecto. Se usa en el servidor, no en el navegador.
- PW2_LEGAL_PUBLISHED=true (solo para HTML aprobado y completo).
- PW2_LEGAL_DIRECTORY=./backend/legal-reviewed (ejemplo de directorio incluido por ti en el despliegue, con privacidad.html y condiciones.html aprobados).

PUBLIC_ORIGIN debe continuar siendo https://perrisushi.com. Mantener NODE_ENV=production, SESSION_STORE=supabase, ALLOW_SUPABASE_SESSION_WRITES=true y CSRF_SECRET existente. No regenerar claves, contraseñas ni credenciales. No introducir archivos .env ni secretos en Git.

Mientras no estén aprobados/publicados los textos legales, el registro de nuevos jugadores queda cerrado; Google puede utilizarse para entrar/vincular cuentas existentes cuando se habilite su opción. La interfaz no muestra enlaces legales inexistentes.

## Retorno, cookies y proxy
- pw2_oauth: nonce aleatorio HttpOnly, Secure en HTTPS, SameSite=Lax, 10 minutos. El verificador PKCE y el modo/identidad de vinculación permanecen en PostgreSQL, no en el navegador.
- pw2_session conserva SameSite=Strict. La sesión del callback se vuelve a validar al iniciar la aplicación y las solicitudes privadas.
- Cada intento solo admite un intercambio. La cancelación elimina el intento; los intentos caducados se limpian al iniciar otro flujo.
- Los tokens de acceso/refresco de Supabase y Google se descartan tras verificar la identidad. No se entregan al navegador ni se guardan en localStorage.
- La aplicación usa su sesión de ocho horas; no depende de refrescar silenciosamente una sesión Supabase en el cliente. Cerrar sesión elimina la sesión PerriWeb y no ejecuta un acceso Google automático.
- El proxy Pages y el servidor de desarrollo preservan únicamente el retorno OAuth 303 a rutas locales enumeradas. No se permiten redirecciones externas arbitrarias.
- Si se abre otro intento en el mismo navegador, sustituye al anterior. Al fallar por un intento viejo, reiniciar el acceso; no se reutilizan códigos.

## Páginas públicas legales, cuando estén aprobadas
- https://perrisushi.com/api/legal/privacy
- https://perrisushi.com/api/legal/terms

El backend carga HTML revisado desde un directorio explícito. Los originales marcados como borrador se rechazan, incluso si alguien activa el indicador por error. Las páginas no requieren sesión.

## Validación local y validación real pendiente
Consultar RESULTADOS.md para cifras, comandos y capturas.

La prueba de navegador utiliza frontend y backend reales del repositorio con PostgreSQL embebido. Solo sustituye el proveedor OAuth mediante una URL .invalid interceptada localmente; no entra en cuentas reales ni ejecuta solicitudes a servicios externos.

Antes de publicar definitivamente, comprobar con cuentas propias autorizadas en un entorno de pruebas:
- login tradicional antes y después de vincular;
- vinculación de una cuenta antigua y comparación de datos originales;
- login Google posterior, recarga, sesión persistente, logout y retorno sin sesión;
- alta Google con nick nuevo; rechazo de nick ocupado y de duplicaciones;
- cuenta desactivada, cancelación, código repetido/caducado y conexión interrumpida;
- Android Chrome e iOS Safari reales (incluido teclado y retorno desde Google);
- acceso a perfil, inventario, historial, notificaciones y juegos con la sesión Google;
- recorrido a través del proxy realmente utilizado y cookies Secure en HTTPS;
- npm run check:live con credenciales propias disponibles únicamente como variables locales/privadas. No se ha ejecutado contra producción.

Los diagnósticos google_auth solo emiten códigos de fallo de base de datos conocidos, sin nick, correo, URL, contraseña, verificador, hash ni tokens. No habilitar registros completos de cuerpos o códigos OAuth en proxies externos.

## Desactivación y reversión
PW2_GOOGLE_ENABLED=false elimina las opciones Google; se mantiene el acceso tradicional de las cuentas antiguas. No borrar las tablas nuevas ni volver a imponer NOT NULL: las cuentas Google nuevas no tienen contraseña tradicional y necesitan su vinculación para acceder. No hay interfaz de desvinculación, cambio de Google o recuperación sin proveedor en esta entrega. Para esas operaciones se necesita verificar propiedad y preparar un procedimiento específico, especialmente para cuentas exclusivamente Google. Las FK RESTRICT impiden eliminar una identidad Auth dejando vínculos huérfanos.

## Referencias técnicas
- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/auth-identity-linking
