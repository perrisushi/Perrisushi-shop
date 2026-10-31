# Activación técnica pública de Google

El propietario ha solicitado abrir Google a la comunidad y mantener los documentos legales sin publicar ni atribuirles aprobación. El acceso Google con su cuenta ya se ha probado en producción.

## Configuración

Aplicar los cuatro valores de RAILWAY_VARIABLES.txt en el servicio existente. Conservar credenciales, conexión y certificados actuales. No repetir SQL.

El registro público y la publicación legal son interruptores independientes. Con Google activo, TEST_MODE=false y REGISTRATION_ENABLED=true se admite a usuarios Google verificados sin lista de correo. Una cuenta nueva elige nick y se crea únicamente al confirmar el registro. La vinculación de cuentas existentes exige sesión y contraseña tradicional. No se modifican los datos de otras cuentas.

Los documentos incompletos no se sirven. No hay checkbox de aceptación de documentos no publicados ni se graba una aceptación ficticia: los campos de versión/aceptación permanecen NULL. Esto no certifica cumplimiento legal ni de políticas de Google.

## Apagar Google

PW2_GOOGLE_ENABLED=false bloquea nuevos recorridos Google y mantiene el acceso tradicional. Las sesiones ya emitidas y los vínculos permanecen. Para cerrar solo altas nuevas: PW2_GOOGLE_REGISTRATION_ENABLED=false.

## Comprobación tras el despliegue

Consultar /api/auth/google/config debe mostrar enabled=true, registrationEnabled=true y legalPublished=false. Comprobar el botón Google, la elección de nick para una identidad nueva, y la vinculación desde Mi perfil para cuentas antiguas. No se deben crear cuentas nuevas para probar datos de terceros ni modificar inventarios. Las pruebas locales usan datos efímeros.

## Requisitos externos

Google solo solicita openid, email y profile. Google documenta una excepción para estos permisos básicos a la lista de usuarios de prueba; no es correcto afirmar que todos los proyectos en Testing bloquean necesariamente al resto. Audiencia interna, políticas de Workspace u otras restricciones del proveedor pueden limitar cuentas concretas.

Supabase debe permitir nuevas altas para identidades nuevas. Las credenciales y el callback existente se conservan.

Fuentes oficiales:
https://support.google.com/cloud/answer/15549945?hl=en
https://developers.google.com/identity/protocols/oauth2/production-readiness/overview
https://supabase.com/docs/guides/auth/general-configuration
