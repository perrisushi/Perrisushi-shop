# Sesiones persistentes de PerriWeb — implementación local

## Mecanismo

Se adapta la autenticación existente. No hay otro sistema de cuentas, tablas nuevas, JWT propios ni migración SQL. Contraseña y Google emiten la misma cookie opaca y la misma clase de fila en shop_sessions. El plazo técnico pasa de ocho horas a 365 días renovables para todos los usuarios.

La cookie pw2_session mantiene Path=/, HttpOnly, SameSite=Strict y Secure en producción. Max-Age persiste al cerrar el navegador. Su valor continúa siendo un token aleatorio de 32 bytes; en la base solo se guarda v2:SHA-256(token). No se añade ninguna credencial persistente a localStorage, sessionStorage o JavaScript. CSRF conserva su HMAC vinculado a la sesión.

Al validar una petición se comprueban la credencial, existencia y vencimiento de la fila, cuenta activa y sanciones. Si ha transcurrido al menos un día desde la última emisión/renovación, se amplía su validez otros 365 días. Las sesiones anteriores con menos plazo se amplían en su primera petición todavía válida. La renovación ocurre al regresar: no necesita que una pestaña permanezca abierta ni hay un temporizador de cierre por inactividad, cambio de día o medianoche.

La actualización es un PATCH condicional por hash de token, nick, vencimiento anterior y condición de no caducidad. Solo modifica expires_at y updated_at. Nunca hace INSERT/UPSERT durante una renovación. Si otra instancia renovó antes se vuelve a leer la misma sesión. Si fue eliminada, no se recrea. Se agrupan únicamente renovaciones en curso; no se cachea una autorización para omitir las comprobaciones de revocación. Una fila renovada o releída vuelve a pasar controles de cuenta y sanción.

El token no rota durante la renovación: varias pestañas conservan la misma identidad y CSRF. Cada login de otro navegador/dispositivo crea otra sesión independiente. Las respuestas autenticadas reemiten la cookie con un plazo que no excede la validez restante del servidor; un error temporal no la elimina.

## Revocación y errores

- Logout con Origin/CSRF válidos elimina solo esa fila y caduca su cookie. La interfaz confirma el cierre después del éxito del servidor. Un error de conexión conserva el estado y ofrece reintentar en el marco existente.
- La expulsión administrativa elimina todas las sesiones del usuario. Una renovación que llegue después de ese DELETE no puede restaurarlas. Se permite un nuevo login.
- La suspensión y el baneo conservan sus comprobaciones de servidor, revocación y bloqueo de ambos métodos de acceso. Levantar la sanción permite emitir una nueva sesión, nunca recuperar la revocada.
- Los errores de red/Supabase/Railway producen un error recuperable y no un borrado de cookie. La pantalla vuelve a validar al recuperar conexión, foco o visibilidad. El servidor no autoriza operaciones si no puede validar.
- La cookie manipulada o una sesión inexistente/caducada se rechazan. La identidad procede exclusivamente de la credencial y la fila, no de un nick enviado por el cliente. La cookie sigue siendo una credencial portadora: no se afirma que una copia robada del valor sea imposible de usar; sus defensas son HttpOnly, Secure, SameSite, aleatoriedad, hash en servidor y revocabilidad.

## Minijuegos y Google

Se detectó que el transporte original de los juegos aplicaba LEAST(vencimiento_actual,ahora+30 días). Eso habría acortado una sesión anual. El adaptador ahora ignora exclusivamente ese PATCH legado de expires_at/updated_at: la política común es la única que gestiona la vigencia. Rechaza otros campos en ese PATCH. No se modifican games-original.cjs, recursos, mecánicas, costes o recompensas. Las pruebas ejecutan el código original y comprueban que una sesión anual no se reduce tras abrir Casillas.

El flujo OAuth conserva su cookie temporal SameSite=Lax y sus diez minutos. La cookie propia final sigue siendo Strict y anual. Vinculación, registro, selección de nick, unicidad y configuración de Google no se cambian. Las comprobaciones de sanción de Google se conservan.

## Archivos modificados

- backend/session-policy.mjs: constantes compartidas de plazo y frecuencia.
- backend/app.mjs: creación anual, validación/renovación condicional, cookie persistente y concurrencia.
- backend/google-auth.mjs: misma política para sesiones de Google.
- backend/repository.mjs: PATCH limitado, condicionado y con comprobación de respuesta.
- backend/game-transport.cjs: el refresco legado no puede acortar o prolongar la sesión.
- src/main.js: reconexión automática y cierre manual confirmado; sin cambios de CSS o escalado.
- tests/helpers/admin-fixture.mjs: actualización condicional en PostgreSQL local para los tests.
- tests/persistent-sessions.test.js: pruebas de tiempo, revocación, concurrencia, errores, Google e integridad.
- tools/verify-persistent-sessions.mjs: comprobación real con perfiles desechables de Edge y reloj de servidor controlado.
- docs/sesiones-persistentes-capturas: imágenes y resultados de las pruebas de navegador.

## Verificación

Se ejecutaron 16 pruebas específicas, además de la batería completa. Cubren 24 h, 7, 30, 200 y 500 días con visitas y renovación intermedias; sesión antigua válida de ocho horas; reinicio de instancia; llamadas simultáneas en dos instancias; logout con CSRF, dos dispositivos y expulsión global; carrera entre expulsión y renovación; cuenta inactiva, suspensión/baneo y credencial caducada/manipulada; errores temporales; Google y su baneo/desbaneo; integridad económica y permisos administrativos; condiciones del PATCH PostgREST; proxy de cookies; código original del minijuego y preservación del plazo anual.

En Edge se realizan 14 comprobaciones agrupadas: recarga, nueva pestaña, cierre COMPLETO y reapertura del navegador con el mismo perfil persistente, reinicio del backend, PC y móvil emulado independientes, días 1/7/30, cookie invisible a JavaScript, error 503 durante restauración y reconexión automática, pérdida de red, logout fallido y reintentado, cierre de un solo dispositivo, expulsión del otro, nuevo login y acceso administrativo.

Resultados finales y comandos ejecutados se registran en el archivo resultados.json de capturas. No se presentan las simulaciones de fecha como una espera real de semanas.

## Compatibilidad y publicación futura

No se necesita ejecutar SQL ni repetir 004. No se modificó la función económica ni su hash 10a0758a39ca77c04cb0301e447bfe9c. No se recupera Random Key. Para publicar posteriormente deben ir juntos backend e interfaz y mantenerse SESSION_STORE=supabase, ALLOW_SUPABASE_SESSION_WRITES=true y los secretos/configuración existentes de producción. El modo memory continúa reservado al desarrollo y no puede sobrevivir a reinicios de servidor.

La renovación usa el permiso UPDATE de service_role sobre shop_sessions. No se concedieron permisos ni se alteraron roles: si ese permiso estuviera restringido en la instalación real, la renovación fallará de forma recuperable y debe revisarse antes de publicar. La verificación local comprueba las condiciones y el cuerpo del PATCH; no se ha probado PostgREST de producción.

Se conservan las sesiones v2 actuales aún válidas y su identidad. Deben regresar antes de que su cookie/fila antigua haya vencido para ampliarse automáticamente. Las ya caducadas, revocadas, eliminadas o no reconocidas por el autenticador anterior no se resucitan: requerirán un login. No se convierte indiscriminadamente una fila antigua en acceso válido.

El plazo técnico es 365 días renovables, no una promesa de duración infinita. Si transcurre todo el plazo sin regresar, o el navegador elimina/limita la cookie, habrá que iniciar sesión otra vez. Las pruebas verifican semanas/meses de ausencia dentro de ese plazo y visitas que lo prolongan; no mantienen la credencial pasada su fecha de seguridad.

Las pruebas usan PGlite y HTTP local. Las llamadas entre instancias se coordinan mediante la actualización condicional, pero no son una prueba de carga multiproceso contra Supabase. Google se prueba con proveedor simulado; el cierre/reapertura de Edge es real. No se reinició físicamente el ordenador ni un teléfono, no se probó un móvil físico ni se accedió a producción.

No se hicieron Commit, Push ni despliegues. No se tocaron diseños, escalados, Twitch, YouTube, saldos, inventarios o reglas económicas.


## Resultado final de esta entrega

- `npm test`: 326 aprobadas, 0 fallos, 0 omitidas.
- `npm run build`: correcto, 500 archivos públicos en dist local.
- `node tools/verify-persistent-sessions.mjs`: 14 comprobaciones agrupadas, sin errores JavaScript ni peticiones externas; cierre/reapertura real de Edge con perfil persistente.
- `node tools/verify-admin-extended.mjs`: 16 recorridos agrupados de administración en PC y móvil emulado, sin errores JavaScript ni peticiones externas.
- `git diff --check`: sin errores de espacios; solo aviso de normalización LF/CRLF en el CSS generado existente.
