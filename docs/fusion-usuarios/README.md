# Fusión de usuarios: siguiente paso sobre el diagnóstico real

## Parejas confirmadas por los grupos del diagnóstico
| Sobrevive con su contraseña original | Se absorbe después de fusionar y validar |
|---|---|
| Isoldequeen | isoldequeen |
| Kazzialtime | KazzialTime |
| Sr_vic_ | Sr_Vic_ |

Los valores anteriores incorrectos se han sustituido en el plan, herramientas y consultas. Se validan los grupos reales de duplicates, no las parejas escritas como constantes en la consulta antigua.

## Estructura real recibida y analizada (30/10/2026)
El CSV contiene una fila diagnostic, formato pw2-account-merge-schema-v1. Es un inventario de estructura, no de saldos ni progresos.
- PostgreSQL 17.6; rol postgres con BYPASSRLS.
- 72 relaciones catalogadas: 30 tablas públicas y tablas de infraestructura Auth/Storage/Realtime/Extensions/Vault.
- 30 claves foráneas públicas: 24 ON DELETE CASCADE, 3 SET NULL y 3 RESTRICT. Todas están validadas.
- Existe autorreferencia de mensajes mediante reply_to_message_id; no borrar/recrear mensajes a ciegas.
- shop_random_key_pool.assigned_to es referencia textual sin FK y también debe revisarse.
- shop_access contiene is_admin. No se fusionan privilegios mediante OR ni se conceden los del absorbido automáticamente.
- Hay seis disparadores activos: cinco UPDATE de inventarios y uno INSERT de tickets Random Key. Sus nombres sugieren notificaciones; su comportamiento exacto no puede deducirse solo del nombre.
- shop_ui_layouts existe aunque no figuraba en las primeras listas. La consulta busca referencias a los usuarios también allí; no modifica su diseño ni sus layouts.
- code_hash sigue siendo NOT NULL. En este diagnóstico no aparecen las tablas nuevas pw2_google_links / pw2_oauth_flows. No ejecutar aún la migración Google.
- Huella de catálogo: fa7d8e7fae89e04f83a85d2af1be2695.

No se ha consultado Supabase desde Codex: se ha leído exclusivamente el CSV local facilitado.

## Ejecutar AHORA solo la consulta 02
Abrir:
sql/fusion-usuarios/02-recursos-y-conflictos-solo-lectura.sql

Copiar todo en el editor SQL del mismo proyecto Supabase y ejecutar. Es un único SELECT: no contiene DML/DDL, no crea funciones y no ejecuta funciones de juego ni disparadores.

Exportar la celda merge_data como JSON o como CSV, igual que el diagnóstico anterior, y compartir ese resultado para analizarlo antes de emitir una migración. Los formatos CSV de una única celda y JSON están admitidos. No hace falta repetir 01 si el catálogo no ha cambiado.

La consulta 02 incluye:
1. Inventarios de los seis nicks, PC, monedas, gemas, objetos y consumibles.
2. Sumas propuestas exactas de los contadores de inventario, en texto para evitar pérdida de precisión. Informa de filas ausentes, negativos y desbordamientos; no inventa saldos cero.
3. Perrilogos, logros, títulos, estados y datos necesarios para comparar Pet/RPG/Casillas.
4. Equipo, loadout, recursos normalizados de Pet/RPG, ledger, historiales y notificaciones mediante sus IDs/datos seguros.
5. Tickets/cofres con estado y caducidad, manteniendo el historial separado del contador para no duplicar recursos.
6. Sesiones y enlaces pendientes sin exponer sus tokens; privilegios administrativos y límites diarios.
7. Claves de juegos repetidas o con propietarios incompatibles, mostrando IDs y cantidades sin mostrar las claves.
8. Comparación de PC del inventario con la caché de usuarios públicos.
9. Datos antiguos Pet de shop_operations, también por el ID derivado del nick normalizado aunque su propietario almacenado fuera distinto.
10. Revisión de funciones de los seis disparadores: nombre, lenguaje, security_definer, huella y señales de posibles escrituras/efectos externos. No devuelve cuerpos ni argumentos privados. Esas señales son heurísticas, no una demostración de su comportamiento.

SQL 04-integridad-solo-lectura.sql contiene las comprobaciones resumidas por separado, pero ya están incluidas en 02. No es necesario ejecutarlo también. SQL 03 es una restricción FUTURA, no se debe ejecutar todavía. Los SQL de tests/fixtures nunca se ejecutan en Supabase.

## Qué falta para emitir la fusión definitiva
Falta el resultado de la consulta 02. El CSV recibido no permite saber cuánto posee cada cuenta, si existen dos mascotas/tableros incompatibles, si difieren is_admin o límites diarios, o si hay registros duplicados reales.

No se ha generado una migración definitiva ni un script de restauración que pretenda conocer esos datos. Una copia de seguridad no equivale a conservar un progreso utilizable: dos mascotas o tableros distintos no se resuelven eligiendo arbitrariamente el nivel mayor.

El siguiente análisis mostrará, por pareja, recursos reales ANTES y DESPUÉS PROPUESTO, IDs a conservar y conflictos concretos. Cualquier conflicto no resuelto bloqueará el SQL de fusión.

## Herramientas locales y privacidad
Las exportaciones reales se guardan en private-merge, excluido de Git. No publicar CSV, datos de progreso, copias ni credenciales.

Si se necesita regenerar desde otro diagnóstico:
```powershell
Set-Location 'C:\Users\borja\Documents\GitHub\Perrisushi-shop'
node tools/prepare-account-merge.mjs 'RUTA_AL_DIAGNOSTICO.csv' private-merge
```

El comparador admite el CSV o JSON de merge_data:
```powershell
node tools/account-merge-report.mjs 'RUTA_AL_RESULTADO_02.csv' private-merge/informe.json
```

Ambas herramientas son offline. Las salidas dentro del repositorio solo se permiten en private-merge. No ejecutan SQL ni se conectan a servicios. El código fuente de las consultas puede versionarse; las exportaciones reales no.

Los valores sensibles se omiten; se conserva únicamente el estado Pet conocido del recibo antiguo. Textos de mensajes, cuerpos completos de notificaciones/recibos y otros campos arbitrarios omitidos deberán conservarse íntegros en la futura transacción, no descartarse porque no aparecen en el informe.

## Reglas para construir la migración específica, tras revisar los datos
- Recursos acumulables conocidos: suma exacta, sin redondeo ni recorte; abortar ante negativos, tipos no clasificados o desbordamiento.
- Nuevas columnas numéricas: clasificarlas antes de sumar. Niveles, versiones, rondas, estadísticas derivadas e identificadores no son recursos intercambiables.
- Perrilogos y colecciones: unión por ID, sin duplicar ID; contenidos contradictorios bajo un mismo ID cancelan la operación. Conservar la selección del superviviente si sigue siendo válida.
- Objetos RPG únicos (max_quantity=1): un único objeto del mismo ID. Acumulables: suma, pero cancelar si excede un máximo real; nunca truncar cantidades. Revisar equipo y loadout para conservar propiedad sin equipar simultáneamente estados incompatibles.
- Pet: contrastar estado normalizado y shop_operations/perripet_state. Comidas, semillas y otros recursos pueden ser espejos del inventario: contarlos una vez. Revisar cápsulas, criaturas, granja y encuentros por sus IDs/estados; no sumar niveles ni escoger el nivel mayor automáticamente.
- Casillas: no concatenar tableros ni reabrir casillas con recompensa cobrada. Dos rondas distintas necesitan una decisión compatible con el juego antes de continuar.
- RPG: no sumar HP, rondas o combates. Mantener reward_claimed y el ledger para impedir recompensas repetidas.
- Duelos: conservar los recursos cuantitativos, historial y equipo; resolver límites diarios y objetivos efímeros sin conceder turnos/recompensas adicionales.
- Tickets y cofres: conservar IDs, estados, propietarios y caducidades. No añadir por segunda vez las filas de su historial al contador que ya las representa. Los caducados no vuelven a estar vigentes.
- Historiales, operaciones, notificaciones y chat: preservar IDs y contenido original; solo reatribuir la identidad donde corresponda. Revisar assigned_to, redeemed_by, liked_by_nicks, reactions, JSON, IDs derivados del nick y relaciones sin FK.
- Acceso: conservar exactamente el hash del superviviente. No sumar ni transferir hashes. Una cuenta desactivada requiere resolución explícita; no reactivarla por fusión.
- Sesiones, enlaces de activación y OAuth pendientes: revocar de forma segura. No permitir que una sesión antigua del absorbido controle la cuenta consolidada.
- Nunca borrar primero al jugador ni confiar en ON DELETE CASCADE. Comprobar todas sus referencias antes de retirar el nick absorbido.

## Transacción y restauración que tendrá que incluir el SQL definitivo
1. Mantenimiento: detener nuevas escrituras de la web, juegos, bot y cualquier otro cliente. Una copia o una transacción no congela por sí sola todos los clientes.
2. Copia completa privada externa y ensayo de restauración en una copia aislada. Las credenciales de conexión no deben escribirse en el repositorio, chat ni argumentos publicados.
3. BEGIN con timeouts y bloqueos sobre todas las tablas realmente implicadas. Revalidar esquema, seis nicks exactos, recursos, revisiones, límites, IDs y todas las condiciones aprobadas.
4. Copia privada de TODAS las filas que cambien y de los vínculos afectados, incluidas columnas no exportadas. Restringirla al operador; los hashes/tokens del respaldo jamás serán datos públicos.
5. Resolver colisiones y reatribuir referencias explícitamente, con las restricciones activas y sin deshabilitar disparadores/FK. Si hay un disparador con efectos externos, resolverlo antes: ROLLBACK no revierte un correo ni una petición HTTP.
6. Revocar sesiones de ambas cuentas y pendientes asociados. Retirar los absorbidos solo después de demostrar que no quedan referencias o datos sin trasladar.
7. Reconciliar cada recurso, objeto/ID único, estado de progreso y número de registros antes/después. Si falla cualquier comparación, ROLLBACK de las tres parejas completas.
8. Instalar la unicidad normalizada dentro de la misma operación final y validar; COMMIT únicamente al final.

La restauración debe generarse desde ese mismo respaldo y esquema, respetando el orden de FK, los IDs originales y las referencias de terceros. Debe abortar si se detectan escrituras posteriores: no se sobreescribirá silenciosamente progreso nuevo. Las sesiones revocadas no se reactivan al restaurar; se vuelve a iniciar sesión. No basta con ejecutar DELETE/INSERT genéricos, porque podrían activar cascadas sobre mensajes, recompensas u otras relaciones.

Estos pasos son el contrato de la futura migración, **no un procedimiento de restauración ya probado contra producción**. No se fabricó un script genérico de borrado/fusión sin conocer las tablas reales.

## Restricción preparada para después
sql/fusion-usuarios/03-prevenir-duplicados-despues.sql crea índices únicos sobre lower(btrim(nick)) en shop_players y shop_access. No altera el nick que se ve ni su identificador.

Está protegida por una transacción: si quedan duplicados o nicks vacíos, aborta. No fusiona nada por sí misma. Su integración final depende del diagnóstico real y de comprobar las referencias canónicas; NO ejecutarla ahora.

## Validación local
Consultar RESULTADOS.md. Los esquemas tests/fixtures son solo PostgreSQL local de prueba, no una afirmación sobre las tablas reales. La interfaz y el backend de la web no se han cambiado en esta tarea.
