# Google Login: activación definitiva, paso a paso

Código local terminado. No se ha realizado Commit, Push, despliegue ni cambio alguno en Supabase/Railway.

## 1. Preparar y revisar los documentos legales
Abrir una terminal en C:\Users\borja\Documents\GitHub\Perrisushi-shop y ejecutar:
```powershell
npm run legal:prepare -- --interactive
```
El asistente pregunta los datos del responsable, dirección y correo; finalidades/bases jurídicas; proveedores/transferencias; conservación; derechos; menores; reglas económicas/sorteos; moderación/bajas; y otras condiciones.

No introducir claves o contraseñas. No se inventa ninguno de esos datos. Las bases jurídicas, conservación, condiciones y transferencias deben estar revisadas y aprobadas por el responsable.

Al finalizar, se crean:
- backend/legal-reviewed/privacidad.html
- backend/legal-reviewed/condiciones.html

Abrir ambos archivos y revisar el contenido antes de publicarlos. El asistente no publica nada y no reemplaza versiones existentes. Si hace falta preparar otra versión, puede usarse:
```powershell
npm run legal:prepare -- --interactive --output backend/legal-reviewed-v2
```
En ese caso, usar después ese directorio en PW2_LEGAL_DIRECTORY.

Los borradores originales permanecen en docs/google-auth/legal. No pueden publicarse accidentalmente: el servidor rechaza sus marcas y textos sin completar.

## 2. Ejecutar el único SQL de Google
En Supabase, abrir el proyecto actual → SQL Editor → nueva consulta.
Copiar TODO sql/002-google-auth.sql y pulsar Run.

No hace falta ejecutar ningún otro SQL de preparación para activar Google.

Esta migración:
- admite NULL en code_hash para cuentas Google sin contraseña;
- crea/protege pw2_google_links y pw2_oauth_flows;
- conserva hashes, cuentas, sesiones, inventarios y progresos existentes;
- reserva la unicidad normalizada del nick para nuevas altas;
- permite reejecución compatible con una versión anterior de Google.

Si aparece un error, no activar aún Google. El SQL está en una transacción: no hay cambios parciales tras un fallo.

## 3. Guardar los cambios y configurar Railway manualmente
Cuando los documentos estén completos y revisados, incluir los dos HTML generados junto con los cambios Google en GitHub Desktop. El propietario realiza Commit y Push origin cuando decide publicarlos. Se conserva railway.json y su despliegue actual.

En Railway → servicio de PerriWeb → Variables:

| Variable | Valor |
|---|---|
| PUBLIC_ORIGIN | https://perrisushi.com |
| SESSION_STORE | supabase |
| ALLOW_SUPABASE_SESSION_WRITES | true |
| SUPABASE_PUBLISHABLE_KEY | Clave pública publishable o anon del mismo proyecto Supabase |
| PW2_LEGAL_DIRECTORY | ./backend/legal-reviewed |
| PW2_LEGAL_PUBLISHED | true, solo tras revisar los HTML |
| PW2_GOOGLE_ENABLED | true, al completar SQL y documentos |

Mantener NODE_ENV=production y las variables existentes SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, DATABASE_SSL_CA, CSRF_SECRET y PERRIWEB_PROXY_SECRET cuando se utilice el proxy. No regenerar ni cambiar credenciales. Si ya está configurada SUPABASE_ANON_KEY, se admite como alternativa a SUPABASE_PUBLISHABLE_KEY.

La clave pública se obtiene en la configuración de API Keys de Supabase. Las claves/variables privadas solo se guardan en Railway, nunca en archivos del repositorio.

No se necesita añadir Client Secret de Google a Railway: ya está configurado en el proveedor de Supabase.

El callback autorizado sigue siendo:
https://perrisushi.com/api/auth/google/callback

Comprobar en Supabase Auth que Allow new users to sign up permite nuevas altas. No desactivar la verificación de correo ni cambiar otras opciones que ya funcionen.

## 4. Probar con Google real
Después de publicar manualmente esos cambios:
1. Abrir perrisushi.com en una ventana privada y entrar con usuario/contraseña antiguos.
2. Comprobar el nick, Perrilogo y saldos.
3. Ir a Mi perfil → Vincular Google, confirmar la contraseña y elegir la cuenta Google autorizada para pruebas.
4. Volver a PerriWeb: debe conservarse el mismo nick y sus datos.
5. Cerrar sesión y entrar con Continuar con Google.
6. Recargar y verificar que la sesión sigue activa. Cerrar sesión debe volver al acceso.
7. Para probar el registro, usar OTRA cuenta Google autorizada que todavía no esté vinculada. Elegir un nick disponible y aceptar los documentos.
8. Probar un nick ocupado: debe rechazarse sin crear otro jugador ni modificar ninguna cuenta.
9. Repetir en PC y móvil físico. En móvil, comprobar orientación, teclado, casilla de aceptación y botones.
10. Abrir perfil, inventario, historial, notificaciones y las pantallas de juegos para comprobar la sesión compartida.

No intentar usar el mismo Google para crear otra cuenta si ya se ha vinculado: se rechaza intencionadamente.

Antes de abrir el servicio a todo el público, revisar la audiencia y publicación de la aplicación en Google Cloud según su configuración y permisos. La cuenta de prueba ya configurada sirve para el primer recorrido. No se modificaron las credenciales OAuth.

Cuando estén publicadas, usar también estas URLs en los campos de Privacidad y Condiciones de Google Cloud → Branding. Las páginas legales serán públicas:
- https://perrisushi.com/api/legal/privacy
- https://perrisushi.com/api/legal/terms

## 5. Qué está comprobado y qué requiere esa prueba manual
Pruebas locales completas y compilación correctas. Frontend/backend reales del repositorio con PostgreSQL local; proveedor OAuth sustituido solo para pruebas. El recorrido con las credenciales reales y el alojamiento real se verifica en el paso 4. No se ha declarado validado antes de hacerlo.

La entrada tradicional funciona incluso si falla la limpieza de un intento Google. Las cuentas nuevas tienen is_admin=false de forma explícita. El estado OAuth es privado, temporal y de un solo uso; no se guardan tokens Google en el navegador. La versión legal aceptada debe coincidir con la publicada por el servidor.

## Referencias oficiales
- Google en Supabase: https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- PKCE: https://supabase.com/docs/guides/auth/sessions/pkce-flow
- Altas de usuarios: https://supabase.com/docs/guides/auth/general-configuration
- Audiencia/publicación Google: https://developers.google.com/identity/protocols/oauth2/production-readiness/overview
