# Administración ampliada de PerriWeb — entrega local

## Estado y alcance

Código guardado en C:\Users\borja\Documents\GitHub\Perrisushi-shop. No se han ejecutado consultas ni migraciones en Supabase real, ni hecho Commit, Push o despliegue. Las pruebas y capturas usan exclusivamente una base PostgreSQL local en memoria y cuentas de prueba.

Se conserva shop_access.is_admin como autorización. No se asignan roles, no se crean cuentas de administración ni identificadores nuevos de usuario. Los UUID nuevos identifican sanciones, productos, compras y eventos, nunca sustituyen al nick de las cuentas.

## Funciones implementadas

### Moderación

La ficha existente incorpora MODERACIÓN e HISTORIAL DE SANCIONES: expulsar sesiones; suspender 15 minutos, 1/6/24 horas, 3/7/30 días o hasta una fecha futura; banear permanentemente; levantar sanciones; cambiar vencimiento y convertir entre temporal y permanente. Todas exigen motivo y confirmación. Cualquier cuenta con is_admin=true queda protegida en servidor.

La nueva sanción sustituye de forma explícita a la anterior y conserva cada versión y su relación. La expiración se calcula al consultar, con tiempo de PostgreSQL, sin cron. El historial se pagina y conserva sanciones expiradas, sustituidas y levantadas, fechas, responsables y motivos de cierre. No se muestran notas privadas al usuario sancionado.

Se revocan todas las sesiones persistentes del afectado y los intentos OAuth de vinculación asociados. Al expirar o retirar la sanción se permite un nuevo acceso, sin recuperar sesiones antiguas. El bloqueo se comprueba en el login tradicional después de verificar la contraseña; también en Google, al restaurar sesión, al acceder a recursos privados y en el backend de juegos. La pantalla de acceso distingue suspensión temporal, su vencimiento y baneo permanente.

Los indicadores active anteriores se conservan. Una cuenta que ya estaba deshabilitada fuera de este sistema NO se reactiva al expirar una sanción nueva. Tampoco se reinterpretan automáticamente todas las cuentas inactivas como baneadas: ese motivo histórico no está acreditado. La operación antigua de suspensión/reactivación queda deshabilitada cuando se activa el sistema ampliado; no hay dos mecanismos administrativos operativos en paralelo.

### Recursos

Permite fijar una cantidad total, entregar o retirar recursos conocidos, con cantidad anterior esperada, validación entera, motivo, confirmación y auditoría. No permite saldos negativos ni cantidades superiores a 2.147.483.647. PC se sincroniza con el listado público.

Permite entregar y retirar Perrilogos existentes; evita duplicar propiedad y corrige la selección si se retira el seleccionado, conservando los demás. No concede identificadores inventados ni altera progresos de los juegos.

### PerriTienda

Un solo catálogo persistente sirve tanto a la tienda pública como a su administración. La versión anterior solo tenía categorías y estado vacío, sin catálogo de productos persistente. No había productos que migrar en el código local; esto requiere contrastarse con el esquema real antes de ejecutar SQL.

Permite crear/editar productos, precios, existencias, ventas activas y visibilidad; consulta compras con instantánea inmutable del producto y precio originales. La compra valida versión/precio, saldo, propiedad única y stock dentro de la misma transacción que registra entrega, gasto, historial y recibo. La venta de stock finito actualiza también la versión para evitar que una edición antigua reponga existencias accidentalmente.

Se admiten Logos existentes con PC y recursos de utilidad realmente presentes en el inventario con Gemas. No hay artículos ni precios preconfigurados en la migración. Random Key queda retirada en interfaz, adaptador económico, endpoint POST de canje y RPC. Sus saldos, datos y recibos históricos no se borran; las consultas propias de historial siguen disponibles sin habilitar operaciones.

### Sorteos

Permite crear eventos, asignar temporada por nombre, elegir boleto de Sorteo 2 o MiniSorteo, configurar fechas UTC, editar antes de abrir, activar/cerrar inscripciones, consultar participantes y boletos, realizar el sorteo ponderado, guardar ganador y boleto ganador, y archivar el resultado sin modificarlo. No hay repetición ni edición del ganador.

La inscripción reserva los boletos: los resta del contador disponible y registra la misma cantidad en la inscripción, el recibo y el libro inmutable pw2_raffle_ticket_reservations, en una transacción. Antes de inscribir o sortear se contrasta la suma con sus recibos, propietario, evento y tipo de boleto. Una inscripción sin respaldo cancela la operación; nunca se fabrica un respaldo histórico. El total inscrito por usuario/evento no puede superar cuatro. Una persona con tres boletos tiene tres posiciones en la selección, no una. Las cantidades sobrantes permanecen disponibles; no se borran los boletos inscritos después del sorteo. No hay devolución o corrección manual de inscripciones en esta entrega.

La elección utiliza crypto.randomInt sobre el total de boletos. Un evento sin boletos no genera ganador. Los premios reales y su entrega externa no se gestionan ni se inventan aquí. No se integran los prototipos jugables.

La venta de Boleto de Sorteo 2 reutiliza la RPC económica y la configuración existentes, con máximo cuatro. La nueva migración incluye una definición COMPLETA y explícita de la RPC, con las comprobaciones de sanción y mantenimiento de Sorteos dentro de su transacción. Conserva la compra de boletos, firma, propietario y permisos; no modifica funciones mediante replace(pg_get_functiondef()). Random Key se rechaza explícitamente; no se dejan nuevos canjes habilitados. El límite cuatro solicitado se mantiene para las compras de boletos. Los recibos e historiales anteriores permanecen intactos.

### Avisos y mantenimiento

Se mantienen los avisos individuales y generales de notificaciones. Además hay un aviso persistente de comunidad activable/retirable; el inicio muestra un resumen compacto y permite leer el texto íntegro en el marco existente. Se refresca con el sondeo de notificaciones, aproximadamente cada 30 segundos mientras la página está visible.

El mantenimiento de PerriTienda bloquea compras, pero permite consultar catálogo, saldo e inventario. El de Sorteos bloquea compra de boletos e inscripciones, permitiendo consultar eventos, participaciones y resultados. En los minijuegos bloquea la entrada y las acciones asociadas a ese juego, incluidas lecturas y guardados. Perfil, inventario, historial y notificaciones generales siguen disponibles. La administración puede configurar productos/eventos y terminar la gestión mientras una sección está en mantenimiento. No modifica mecánicas internas de los juegos.

## Migración y configuración: únicamente tras revisión

1. Consultar sql/004-diagnostico-economia-solo-lectura.sql y revisar la definición real completa. Revisar sql/004-administracion-ampliada.sql contra el esquema real y conservar la copia de seguridad habitual antes de aplicarla manualmente.
2. Ejecutar únicamente ese archivo nuevo cuando se apruebe. NO volver a ejecutar 002-google-auth.sql, 001-economia-atomica.sql ni las migraciones de notificaciones como parte de esta ampliación.
3. La migración crea siete tablas privadas y dos funciones de guarda, sin insertar cuentas, sanciones, productos, eventos o saldos. Antes de cualquier DDL exige la RPC existente con firma, parámetros, valores por defecto, configuración, ACL y cuerpo revisados; acepta solo la exportación real revisada (2aa000dbbb080f04b029e2fd687f39eb), el cuerpo canónico equivalente de 001 o el corregido actual de 004. Rechaza ausencia, sobrecargas y diferencias. CREATE OR REPLACE conserva OID, propietario y ACL. Rechaza tablas de origen desconocido y entradas sin respaldo. Toda la migración está en una transacción. No ejecutar 001 como forma de saltarse estas comprobaciones.
4. Tras revisar el código y SQL, el despliegue futuro reutilizará DATABASE_URL, configuración SSL, SUPABASE_URL, claves privadas y sesiones existentes. No se ha cambiado ninguno de sus valores.
5. PW2_ADMIN_EXTENDED_ENABLED=true puede utilizarse como comprobación explícita de instalación. Si falta el esquema, cancela el inicio. Una vez detectado el esquema completo, las guardas se activan aunque se quite esa variable: no se pueden omitir sanciones instaladas apagando una bandera.
6. PW2_MODERATION_MAX_DAYS es opcional, por defecto 365, entre 1 y 3650. Limita la suspensión futura admitida. No cambiar las variables de Google.

El arranque comprueba el esquema y las guardas de la RPC. Ante un esquema parcial, una RPC sin guardas o imposibilidad de comprobar PostgreSQL, cancela el inicio antes que permitir un acceso sin comprobar sanciones. No borrar tablas ni volver a una versión sin estas guardas mientras existan sanciones vigentes.

## Seguridad e integridad

Cada operación administrativa vuelve a verificar sesión y rol en servidor, y cada escritura exige Origin y CSRF. Nunca admite actor o rol del navegador. Las operaciones quedan en shop_operations con motivo, antes/después y recibo idempotente. Las escrituras comparten el bloqueo transaccional existente de juegos/economía y bloquean las filas afectadas. Un error revierte toda la operación. El estado del navegador no autoriza escrituras.

Se cancelan consultas que RLS pudiera filtrar silenciosamente. No se exponen claves, hashes, tokens, cadenas de conexión ni motivos privados en los mensajes públicos. Se conservan contraseñas y vinculaciones Google. No se añaden permisos a Perrisushi ni a otra cuenta.

## Limitaciones expresas

- Marcos y accesorios no tienen todavía un sistema real de propiedad/equipamiento en el perfil actual. No se habilita su venta ni se simula su entrega. Las pestañas existentes conservan su estado vacío si no tienen artículos.
- Los PerriCofres, cofres de minijuego, Random Key y boletos con registros auxiliares no se conceden/retiran alterando un contador aislado. Los boletos se mueven únicamente mediante compra e inscripción verificadas; no hay edición manual incoherente.
- No se conceden objetos RPG únicos ni recompensas con identificadores auxiliares sin un procedimiento de entrega específico acreditado.
- Temporada es una etiqueta del evento; no hay un segundo motor de temporadas ni reglas de recompensas inventadas.
- No se convierten automáticamente desactivaciones antiguas de origen desconocido en sanciones nuevas.
- No se han probado Supabase real, OAuth real, varios procesos PostgreSQL reales simultáneos ni un teléfono físico. PGlite usa un pool serializado en las pruebas; no se presenta como una prueba de carga de producción.

## Archivos y pruebas

Backend: administration.mjs, moderation.mjs, management.mjs, community.mjs, service-scopes.mjs; integración en app.mjs, server.mjs, traditional-auth.mjs, google-auth.mjs, games.mjs, economy.mjs y site.mjs.

Interfaz: src/services/admin-ui.js, api-client.js, live-ui.js, src/main.js y src/admin.css. Proxy: functions/api/[[path]].js y dev-server.mjs, para conservar los retornos OAuth locales de sanción con su fecha pública.

Pruebas nuevas: tests/moderation.test.js, management.test.js, admin-extended-security.test.js; ampliaciones en administration.test.js y su fixture. Las dos pruebas antiguas que exigían Random Key visible se actualizaron para exigir su ausencia, conforme a la instrucción explícita de esta tarea; no se retiraron las pruebas económicas ni de conservación de datos.

Verificación local de la revisión de SQL 004: npm test, npm run build, node tools/verify-admin-local.mjs y node tools/verify-admin-extended.mjs. El segundo recorre formularios, compras, inscripción, sorteo, moderación y mantenimiento completos en PC 1366×768 y móvil emulado 390×844. El primero conserva además 320×740.

Capturas y resultados: docs/admin-ampliada-capturas y docs/admin-capturas. Todos los nombres, productos, precios y eventos de esas capturas pertenecen exclusivamente al fixture local; no se insertan en producción.
Resultado de la revisión adaptada a Supabase: 310 pruebas automatizadas superadas; compilación correcta; 27 comprobaciones agrupadas de compatibilidad y 16 recorridos agrupados de la ampliación en Edge, sin errores JavaScript ni peticiones externas. Las comprobaciones de navegador se han realizado en PC y móvil emulado, no en teléfono físico ni contra producción.


## Corrección de SQL 004 antes de su aplicación

Ver el informe detallado en [correccion-migracion-004.md](correccion-migracion-004.md). La restricción temporal exige expiración no nula, finita y posterior al inicio; valida también filas anteriores sin repararlas o borrarlas automáticamente. Una sanción vencida no impide el acceso; al registrar la siguiente se cierra la fila vencida antes de insertar la nueva, conservando el historial y el índice de una sanción activa.

No se ha consultado ni ejecutado nada en Supabase de producción desde este trabajo. Se ha revisado la exportación real proporcionada por el usuario, verificado su hash exacto y ejecutado esa definición en PostgreSQL local PGlite. Cualquier diferencia desconocida requiere revisión, no un parche automático. SQL y backend corregidos deben utilizarse juntos: el arranque exige ahora las siete tablas y la huella del cuerpo económico corregido.


La revisión vigente y sus diferencias exactas con Supabase están en [adaptacion-004-supabase-real.md](adaptacion-004-supabase-real.md). La comprobación de cuenta activa y sanciones precede ahora a cualquier recibo; las compras cuentan boletos disponibles y reservas del mismo tipo en sorteos pendientes. Las reservas de sorteos resueltos se conservan como histórico y no bloquean nuevas compras. No se rebajan ni eliminan saldos anteriores que superasen cuatro: se rechazan compras nuevas mientras no haya cupo.
