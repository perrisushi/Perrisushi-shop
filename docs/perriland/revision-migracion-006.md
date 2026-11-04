# Revisión local de la migración 006

Fecha: 4 de noviembre de 2026. No aplicada en producción.

## Correcciones

- Las capturas de `regexp_matches` se nombran explícitamente `AS matches(capture)`. Cada coincidencia devuelve un `text[]`; `capture[1]` extrae el primer grupo. La sintaxis anterior `v[1]` también era válida: el problema era el orden, no los subíndices.
- `array_agg(capture[1] ORDER BY capture[1] COLLATE "C")` fija el orden binario que siguen los dos arrays esperados. Admite el CHECK existente de siete ámbitos y el de ocho con PerriLand, independientemente del orden de los literales. Conserva el rechazo de ámbitos ausentes o inesperados.
- `ON CONFLICT(scope) DO UPDATE SET active=EXCLUDED.active,message=EXCLUDED.message` fuerza siempre `active=true` y `PERRILAND no está activado.`. No hay incompatibilidad con el esquema de 004: `scope` es clave primaria y los campos admiten esos valores. Las otras columnas de la fila existente se conservan.

## Revisión del SQL completo

- El bloque DO, las consultas de catálogo, DDL, CHECK, FK, RLS, REVOKE y GRANT se ejecutaron como SQL real en PostgreSQL local.
- `BEGIN`/`COMMIT` abarcan toda la migración. Un error tardío de GRANT revierte también el cambio de CHECK, el upsert y la creación de tablas. En las pruebas, después de un error se envía `ROLLBACK` para salir de la transacción abortada.
- La repetición conserva el checkpoint, revisión y eventos existentes, sin duplicar `main`. Repite deliberadamente el cierre de PerriLand y el mensaje, incluso si alguien había abierto el juego después de una ejecución anterior.
- Se comprobaron PK, FK a `shop_players(nick)`, restricciones de sala, tipo de evento, saldo no negativo e igualdad `after_pc=before_pc+applied`. La migración no añade reglas sobre premios por tipo; esa validación sigue en el backend existente.
- RLS se activa en las dos tablas. PUBLIC, anon y authenticated pierden todos sus privilegios sobre ellas. El servicio recibe SELECT/INSERT/UPDATE en sala y SELECT/INSERT en eventos; en el esquema nuevo se verificó que no puede borrar ni modificar eventos.
- No se modifica ninguna función económica, inventario, cuenta, sesión ni control de otro ámbito.

## Pruebas reproducibles

```powershell
node --test tests/perriland-migration.test.js tests/perriland.test.js tests/perriland-gateway.test.js
```

Resultado: **47/47 correctas**, sin omisiones, incluidas 14 subpruebas nuevas específicas de migración. Ejecutadas con PostgreSQL **18.6 mediante PGlite 0.5.12**, en memoria y sin leer credenciales ni conectar a una base de datos externa.

Cobertura nueva: capturas reales de regexp_matches; entrada con intercalación ICU y orden explícito C; CHECK de siete/ocho ámbitos y orden invertido; fila inexistente; PerriLand existente con active=false y active=true y mensaje anterior; segunda ejecución conservando todos los datos; permisos reales con SET ROLE; RLS; CHECK/PK/FK; ámbitos desconocidos o ausentes; dependencia ausente; tabla ajena; rollback por fallo tardío de permisos; ejecución sin propiedad.

Las pruebas existentes cubren además economía transaccional, duplicados, recuperación de sala, identidad, permisos y HTTP/WebSocket con servidor loopback. El primer intento de esta última prueba fue bloqueado por EACCES del entorno sobre 127.0.0.1; la repetición autorizada con acceso al bucle local pasó. No se ejecutó la batería general de sistemas ajenos a PERRILAND.

## Advertencias y límites

- Cada nueva ejecución vuelve a poner PerriLand en mantenimiento. La apertura posterior sigue siendo una operación administrativa independiente.
- Se necesita un rol con propiedad/permisos para ALTER/CREATE/COMMENT/REVOKE/GRANT y escritura en controles; los roles anon, authenticated y service_role deben existir. No se crean ni se alteran roles con esta migración. El acceso de service_role requiere el BYPASSRLS habitual o ser propietario; se probó con BYPASSRLS en el fixture aislado.
- `CREATE TABLE IF NOT EXISTS` y el comentario `pw2_perriland_v1` reconocen las tablas previas, pero no certifican su estructura completa. Una tabla etiquetada manualmente con ese comentario y luego alterada no se repara automáticamente. Tampoco se eliminan políticas o permisos de otros roles que alguien haya añadido a tablas ya existentes. Las garantías de privilegios mínimos probadas corresponden al esquema creado por esta migración.
- La prevalidación reconoce la forma de CHECK generada por el esquema existente de 004 y su ampliación prevista; no es un parser de cualquier expresión CHECK equivalente escrita a mano.
- No se ensayó contra la versión ni configuración de Supabase; no se ejecutó SQL remoto ni se alteraron datos reales. No hubo commit, push ni despliegue.

Archivos escritos en esta revisión: `sql/006-perriland.sql`, `tests/perriland-migration.test.js` y este informe. El repositorio ya contenía cambios de la integración anterior; se dejaron intactos.