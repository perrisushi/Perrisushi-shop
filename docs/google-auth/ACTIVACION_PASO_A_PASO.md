# Google Login: publicación y prueba final

Para la prueba actual con cuenta existente, sin publicar legales ni abrir registro, seguir PRUEBA_OAUTH_SIN_REGISTRO.md. La configuración de activación general de esta guía queda pospuesta.

La migración 002-google-auth.sql ya está ejecutada. No ejecutar SQL adicional ni repetirla.

## Único dato pendiente para cerrar los HTML

Para identificar al responsable del tratamiento faltan nombre completo o razón social y correo real de contacto. La dirección no es una exigencia técnica OAuth. La posible obligación de dirección profesional/establecimiento y NIF conforme a la LSSI se valora separadamente; ver legal/IDENTIFICACION_Y_NORMATIVA.md. No solicitar DNI o domicilio particular como requisito de Google.

El resto de los apartados está preparado en docs/google-auth/legal. No hay que utilizar una terminal ni redactar cláusulas jurídicas. El asistente incorporará los datos recibidos, generará backend/legal-reviewed/privacidad.html y condiciones.html y comprobará los dos documentos. No se generan documentos con un responsable ficticio.

La aprobación de los textos y la autorización de publicación siguen correspondiendo al propietario. No activar las páginas mientras falte la identidad.

## Variables de Railway

Se ha verificado su compatibilidad con backend/server.mjs y el proxy del repositorio. No se ha consultado ni alterado el panel real.

Valores de activación preparados en RAILWAY_VARIABLES.txt. Se conservan el servicio, railway.json, el repositorio y los secretos ya existentes. No añadir secretos de Google Cloud: el proveedor está configurado en Supabase.

## Publicación manual, cuando el propietario la autorice

1. Una vez generados los dos HTML finales, incluirlos con el código Google en GitHub Desktop. No incluir archivos .env, copias de seguridad, registros, claves o contraseñas.
2. Realizar Commit y Push origin. El repositorio conectado puede desplegar automáticamente al hacer Push: no hacerlo hasta autorizar la publicación.
3. Configurar los valores del archivo RAILWAY_VARIABLES.txt en el servicio existente. Cualquier cambio puede provocar despliegue; hacerlo como parte de la publicación autorizada.
4. Comprobar que ambas páginas responden sin iniciar sesión:
   https://perrisushi.com/api/legal/privacy
   https://perrisushi.com/api/legal/terms
5. Añadir esas dos URLs a Privacidad y Condiciones en la configuración de la aplicación Google si faltan. No cambiar el callback ya autorizado:
   https://perrisushi.com/api/auth/google/callback

No se debe ejecutar otra vez la migración. No hay que cambiar inventarios, cuentas ni contraseñas.

## Prueba real imprescindible

1. En ventana privada, entrar con una cuenta tradicional propia. Comprobar nombre, Perrilogo, inventario y PC.
2. Mi perfil → Vincular Google. Confirmar la contraseña tradicional y elegir el Google propio habilitado para pruebas.
3. Cerrar sesión y entrar con Continuar con Google. Debe recuperarse la misma cuenta y recursos. Probar recarga y cierre de sesión.
4. Volver a entrar con la contraseña original: debe seguir funcionando.
5. Para registro nuevo, usar otra identidad Google aún no vinculada. Elegir nick disponible, aceptar las condiciones y completar el alta. No crear una segunda cuenta para un usuario antiguo que solo desea vincular su Google.
6. Repetir acceso, vinculación o registro, recarga y cierre de sesión en PC y un móvil físico. No es necesario consumir objetos ni participar en juegos para estas comprobaciones.

El código rechaza cuentas desactivadas, nicks ocupados y vinculaciones duplicadas. No se deben manipular cuentas de terceros para probar estos bloqueos; están cubiertos localmente.

La cuenta Google de prueba ya configurada sirve para el primer recorrido. Si se pretende abrir el acceso al público general, completar la publicación de la aplicación en Google Cloud conforme a su configuración. Si Supabase impide nuevas altas, habilitar Allow new users to sign up sin tocar las credenciales OAuth existentes.

## Límite de lo verificado

Las pruebas locales emplean una base de datos efímera y un proveedor simulado. No prueban la configuración privada real de Railway ni el intercambio real Google/Supabase. No se ha ejecutado check:live contra producción ni se ha publicado nada desde el asistente.
