# Integración Google: implementación terminada

La guía de uso sin conocimientos de programación está en ACTIVACION_PASO_A_PASO.md.

## Flujo final
El backend inicia OAuth con PKCE S256 y persiste el verificador en pw2_oauth_flows. La cookie temporal pw2_oauth es HttpOnly, SameSite=Lax y Secure en HTTPS. El retorno canjea el código y verifica al usuario en Supabase Auth; los tokens de acceso/refresco no se guardan ni se envían al navegador.

La identidad Auth se relaciona con el nick original en pw2_google_links. Una identidad Google y una cuenta PerriWeb no pueden tener vinculaciones contradictorias. La vinculación exige sesión, contraseña actual y CSRF. El callback revalida la sesión original bajo bloqueo de fila, comprueba que acceso/jugador estén activos y rota la sesión.

Un Google sin vínculo solo queda pendiente al volver del proveedor. El registro exige nick disponible, CSRF, aceptación y coincidencia de la versión legal. Se insertan jugador, acceso sin contraseña, inventario inicial, perfil inicial, caché pública, vínculo y sesión en una misma transacción. Los usuarios nuevos son expresamente no administradores.

Se reutilizan shop_sessions, cookie pw2_session HttpOnly/Secure/SameSite=Strict y el backend privado. No se migran contraseñas antiguas a Supabase Auth ni se sustituyen datos o identificadores de cuentas existentes. Los minijuegos conservan su dispatcher original y sesión compartida.

El fallo de una limpieza OAuth no impide login tradicional ni logout: se revoca/limpia la sesión principal y se retira la cookie OAuth. Los fallos Google no se presentan como contraseña incorrecta del login tradicional.

## Configuración y SQL
La única migración necesaria es sql/002-google-auth.sql. No se ejecuta automáticamente al arrancar. Es transaccional y compatible con reejecución. Incluye permisos privados, columnas de aceptación legal y protección del nick en la base de datos.

Las variables están documentadas en backend/.env.example y ACTIVACION_PASO_A_PASO.md. Se conserva la configuración de despliegue y los secretos existentes. Google está desactivado hasta que el propietario active PW2_GOOGLE_ENABLED.

## Interfaz y proxy
Se conserva la presentación medieval. Acceso, registro y vinculación tienen errores comprensibles, estados funcionales, ratón/teclado/táctil y formularios adaptados a pantallas bajas. Si no se puede comprobar el vínculo, el perfil ofrece reintentar en lugar de aparentar un estado conocido.

El proxy admite únicamente retornos OAuth 303 a rutas locales enumeradas y conserva las múltiples cookies separadas, tanto con getSetCookie como con getAll de Workers. Las cabeceras de seguridad de las páginas legales también se conservan.

## Documentos legales
npm run legal:prepare -- --interactive prepara ambos HTML a partir de las plantillas y de datos proporcionados/aprobados por el responsable. No publica ni sobrescribe versiones.

El servidor solo publica ambos documentos cuando PW2_LEGAL_PUBLISHED=true y están completos. Los borradores se rechazan incluso si se retiraron las marcas pero quedaron instrucciones de completar. El registro nuevo queda cerrado hasta publicar los textos.

La aceptación registra huella SHA-256 del conjunto de documentos y fecha. Si cambió la versión respecto a la cargada en el formulario, se exige recargar/revisar; no se registra una aceptación distinta a la mostrada.

## Pruebas
Ver RESULTADOS.md. Se han probado contratos HTTP, SQL real en PGlite, sesiones, conservación de datos, concurrencia, caducidad, cuentas desactivadas, permisos, rollback, compatibilidad de contraseña, redirecciones y documentos legales.

Los comandos de pruebas no acceden a producción. La comprobación real Google/Railway/Supabase y móviles físicos se realiza manualmente tras la activación.
