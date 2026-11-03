# SQL 004 adaptada a la definición real de Supabase

## Fuente revisada

La exportación suministrada por el usuario se conserva en `tests/fixtures/economy-supabase-real.sql`, con el cuerpo y saltos CRLF originales. Su hash normalizado reproduce exactamente **2aa000dbbb080f04b029e2fd687f39eb**. No se ha consultado Supabase desde este trabajo.

La comparación de todos los tokens SQL, preservando literales y omitiendo solamente comentarios/espaciado, demuestra que la definición real y `001-economia-atomica.sql` son lógicamente iguales. El hash distinto se debe a saltos de línea, espacios y comentarios diferentes. No se ha aceptado la huella sin revisar su contenido.

## Diferencias exactas

| Aspecto | Definición real | 004 corregida actual |
|---|---|---|
| Firma | pw2_economy_operation(text,uuid,text,integer,integer) | Se conserva |
| Parámetros | p_nick, p_operation, p_action, p_price, p_max; los dos últimos DEFAULT NULL | Se conservan |
| Retorno/lenguaje | jsonb / plpgsql | Se conservan |
| Seguridad | SECURITY INVOKER; search_path pg_catalog/public; lock_timeout 5s; statement_timeout 8s | Se conserva |
| Propietario/ACL | postgres; ejecución postgres y service_role | Se conservan; cualquier cambio inesperado se rechaza |
| Serialización | Bloqueo compartido pw2:shared-games-economy y bloqueo por operation_id | Se conservan ambos |
| Cuenta activa | Se comprobaba después del retorno de recibo previo | Se comprueba en shop_access y shop_players antes de cualquier recibo |
| Sanciones | Sin comprobación | Comprobación en SQL antes del recibo; suspensión o baneo rechazan |
| Mantenimiento | Sin comprobación | La compra consulta raffles; no consulta shop |
| Nuevas compras | p_max hasta 100; solo cuenta boleto_sorteo2 disponible | p_max máximo 4; cuenta disponibles y reservas del mismo tipo en eventos pendientes |
| Random Key | random-redeem operativo | operation_disabled; se retira la rama que realizaba entregas nuevas |
| Recibos | Identidad, acción y request(price,max) deben coincidir | Se conserva ese control, después de la autorización |

La 004 anterior ya añadía sanciones y mantenimiento antes del recibo, pero dejaba la comprobación de active después; además conservaba random-redeem y no contaba reservas para el cupo de compra. Esos comportamientos se corrigen expresamente.

## Comportamiento conservado

La compra sigue descontando el precio validado, incrementando un boleto, sincronizando PC en shop_public_users y registrando la misma actividad y el mismo formato de resultado/recibo en shop_operations. Se conservan los bloqueos, el inventario FOR UPDATE y la reversión total ante cualquier error. No se reinician contadores, no se migran cuentas ni se cambian roles.

Un recibo histórico de compra con una política antigua, incluso max=100, puede recuperarse si identidad, acción y request coinciden y la cuenta está autorizada y Sorteos disponible: esto no realiza una compra ni modifica saldos. Una operación nueva con max>4 se rechaza. Una política del servidor inferior a cuatro sigue siendo un límite más estricto válido. No se normalizan ni eliminan recibos anteriores.

La autorización de cuentas mantiene la condición active IS TRUE existente en la RPC. El acceso tradicional y Google conservan su lógica y no se sustituyen por un nick o rol enviado por el navegador.

## Límite y reservas

Para comprar Boleto de Sorteo 2 se suman boleto_sorteo2 disponible y entradas reservadas de ese mismo tipo en eventos draft/open/closed. Reservar no libera cupo de compra. El máximo de nuevas inscripciones del mismo tipo también se comprueba entre todos los eventos pendientes, además del máximo cuatro por usuario/evento. Los movimientos utilizan el mismo bloqueo transaccional.

Los registros de eventos drawn/archived no consumen cupo del siguiente ciclo. Permanecen intactos, con sus reservas, recibos, boleto ganador y resultado. Los inventarios o participaciones heredados que ya superasen cuatro no se recortan: no se permiten nuevos movimientos que excedan el límite. No hay reparaciones automáticas ni devoluciones inventadas.

Antes de inscribir o sortear se mantiene la comprobación de respaldo real: suma de reservas, recibo de esa cuenta, evento, tipo de boleto y cantidades descontadas. Inscripciones sin respaldo no generan ganador. La migración no fabrica reservas para entradas antiguas: cancela para revisión.

## Retirada de Random Key

Se encontró activo en el código local `POST /api/shop/random-key/redeem`: con economía configurada todavía enviaba random-redeem a la RPC. Ahora devuelve 403 operation_disabled incluso con economía habilitada, sin invocar el adaptador ni Supabase. El adaptador económico acepta exclusivamente raffle-buy. La RPC corregida rechaza random-redeem antes de devolver recibos o consumir recursos.

Se conservan `GET /api/shop/random-key` como historial autenticado con operationsEnabled=false y `GET /api/shop/receipt` para recuperar recibos propios anteriores. No son rutas de venta/canje y no permiten leer los de otra cuenta. No se modifica la interfaz para recuperar Random Key. Los datos de claves, stock, tickets, reclamaciones, actividad, recibos y random_key quedan intactos.

Esto describe la corrección **local**. No se ha desplegado y no se afirma que el endpoint de producción haya quedado cerrado. La definición real facilitada todavía permite canjes a quien pueda ejecutar la RPC con permisos de servicio; por eso se bloquea también en la nueva definición SQL.

## Prevalidación de la migración

Antes de cualquier DDL se comprueban existencia y unicidad de la firma, nombres/tipos/defaults de argumentos, retorno, lenguaje, modalidad de seguridad, configuración, propietario y ACL. Se admiten exactamente tres cuerpos revisados: exportación real (2aa000...), canónico 001 equivalente (470869...), y definición corregida de esta revisión (10a0758a39ca77c04cb0301e447bfe9c). El borrador anterior de 004 no se acepta por aproximación. CRLF se normaliza; ningún otro formato desconocido se acepta automáticamente.

CREATE OR REPLACE conserva OID, propietario y permisos; no concede ejecución a PUBLIC, anon o authenticated. La migración es transaccional y rechaza tablas de origen desconocido, sanciones inválidas o participaciones sin respaldo sin alterar sus datos. No volver a ejecutar 001 como forma de saltarse una prevalidación fallida.

## Archivos modificados en esta revisión

- `sql/004-administracion-ampliada.sql`: definición completa explícita, guarda de cuenta previa al recibo, canje retirado, límite y reconocimiento de versión real.
- `sql/004-diagnostico-economia-solo-lectura.sql`: huellas de versiones revisadas.
- `backend/economy-definition.mjs`: huella exacta del cuerpo corregido para comprobar el arranque.
- `backend/economy.mjs`: solo compras de boletos; política máximo cuatro; errores de sanción reconocidos.
- `backend/app.mjs`: endpoint de canje deshabilitado e historial de Random Key no operativo.
- `backend/community.mjs`: límite de reservas del mismo tipo entre eventos pendientes.
- `tests/fixtures/economy-supabase-real.sql`, `tests/economy-supabase-real.test.js`, fixture administrativo y adaptación de las pruebas de economía/004 a la retirada expresa de canjes.
- Documentación de administración y este informe.

## Pruebas de la revisión

Las doce pruebas nuevas parten de la exportación real: huella y equivalencia lógica; firma, OID, propietario, ACL y configuración conservados; propietario inesperado rechazado; reproducción del bypass de active y su corrección; suspensión/baneo con un identificador anterior y recuperación tras expiración; cuatro boletos, política manipulada, saldo insuficiente, conflictos y reintentos simultáneos; conservación íntegra de históricos reales de canje; reservas y liberación de cupo solo tras resolver; límite entre eventos pendientes; mantenimiento separado; adaptador y endpoint de canje cerrados; historial propio conservado y aislamiento de otra cuenta.

Las pruebas antiguas de canje de 001 se conservan como regresión de la versión histórica. Las pruebas de 004 se han adaptado para exigir que el canje nuevo se rechace; no se han eliminado las comprobaciones de integridad ni de rollback. Las pruebas de autenticación tradicional y Google, tienda, Gemas, PC y minijuegos siguen en la batería completa.

Las pruebas utilizan PGlite local y un pool administrativo serializado. Las llamadas simultáneas comprueban idempotencia y límites, pero no sustituyen una prueba multiproceso con PostgreSQL remoto. OAuth usa proveedor simulado; móvil usa emulación de navegador. No se ha probado contra producción ni un teléfono físico.

No se ha ejecutado SQL en producción ni hecho Commit, Push o despliegue.


## Resultado final ejecutado

- `npm test`: **310 aprobadas, 0 fallos, 0 omitidas**.
- `npm run build`: correcto; 500 archivos públicos generados únicamente en `dist` local.
- `node tools/verify-admin-extended.mjs`: 16 recorridos agrupados en PC 1366×768 y móvil emulado 390×844; sin errores JavaScript ni peticiones externas.
- `node tools/verify-admin-local.mjs`: 27 comprobaciones agrupadas, incluyendo móvil 320×740; sin errores JavaScript ni peticiones externas.
- `git diff --check`: sin errores de espacios; solo avisos de normalización LF/CRLF de archivos existentes.
