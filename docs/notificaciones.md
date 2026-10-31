# Notificaciones: bandeja e historial

Cambios locales, sin despliegue ni escrituras en Supabase de producción.

## Funcionamiento comprobado en el código y esquema exportado

- `shop_notifications` conserva `id` UUID, `nick`, `kind`, `title`, `message`, `payload`, `action_url`, `created_at`, `updated_at` y `read_at`. El propietario referencia `shop_players(nick)`.
- Los desencadenadores originales generan avisos cuando aumentan determinados recursos. El backend original también crea comunicaciones y avisos de bienvenida. Estos productores no se modifican.
- La lectura existente hace PATCH únicamente de `read_at`, filtrando por nick autenticado, UUID y `read_at IS NULL`. Es persistente e idempotente, no borra ni traslada filas físicamente.
- Antes se consultaban juntas nuevas y revisadas, ordenadas por UUID ascendente. La lectura era manual y no existía actualización de la campana.

## Corrección

- GET `/api/notifications?state=unread` devuelve exclusivamente nuevas; `state=read` devuelve revisadas. GET nunca marca lectura.
- Orden descendente por `created_at,id`, con cursor compuesto que conserva microsegundos. No utiliza offset: marcar como leída una página no salta los siguientes avisos.
- La interfaz deduplica por UUID al paginar, sin fusionar ni borrar comunicaciones de contenido coincidente.
- Campana roja si existe al menos un aviso pendiente. Consulta al entrar, navegar, regresar a la pestaña y cada 30 segundos mientras la aplicación esté visible.
- Solo se confirma lectura de tarjetas renderizadas y visibles en el panel abierto. Lo que queda fuera del scroll o no llega a mostrarse sigue pendiente. Se conserva la tarjeta durante esa apertura para permitir leerla; al volver a abrir, ya solo aparecen las nuevas pendientes.
- Si falla la confirmación, el panel ofrece reintentar. No se inventa un éxito ni se elimina el aviso.
- Historial desde un segundo botón junto al historial de actividad, con las mismas clases y dimensiones. Fechas en español y zona Europe/Madrid.
- Se conservan Origin, CSRF, cookie de sesión, identidad derivada del servidor y filtros por propietario. Las respuestas de una sesión anterior no actualizan otra cuenta.

## Validación local

`npm test`, `npm run build` y `node tools/verify-notifications.mjs`.
Las pruebas utilizan PostgreSQL efímero y navegador local con sesiones y credenciales exclusivas de prueba. Verifican cuentas Alpha/Beta, sin nuevas, una nueva, varias páginas, tarjetas visibles y ocultas, persistencia tras recargar y volver a iniciar sesión, nuevos avisos posteriores, cierre durante la carga, lectura idempotente y rechazo de CSRF/cursores manipulados.

## Supabase real

La separación entre nuevas y revisadas no requiere migración. La política exclusiva de los siete premios sí requiere el SQL 003 descrito más abajo. No hay credenciales locales configuradas para comprobar la base de producción; por ello no se declara verificada su conexión real ni la ausencia de avisos duplicados en sus datos.

Se incluye `sql/diagnostico-notificaciones-solo-lectura.sql` para consultar columnas, restricciones, índices, productores y recuentos reales sin modificar filas. Sus coincidencias no autorizan borrar ni combinar avisos: pueden representar eventos legítimos.

## Política exclusiva de recompensas (003)

Se ha identificado el problema en los disparadores originales: notificaban fragmentos, llaves y Random Key, pero no las cuatro bolsas/cajas. La solución está preparada en `sql/003-notificaciones-recompensas.sql`. NO se ha ejecutado en producción.

Identificadores únicos permitidos: `perri_cofres`, `perri_cofres_minijuego`, `cajita_armas`, `bolsa_especial`, `bolsa_chatarra`, `bolsa_gemas`, `monedas`. `saco_chatarra` es distinto de `bolsa_chatarra` y está excluido.

La migración es transaccional: comprueba columnas, bloquea brevemente las tablas y cancela si detecta otros disparadores que escriben avisos. Sustituye exclusivamente productores de recompensas conocidos, instala un productor para los siete campos y filtra futuros avisos de recursos excluidos. No contiene DELETE de filas, no cambia inventarios ni cantidades y no modifica avisos históricos ni comunicaciones sociales. Volver a ejecutarla no duplica disparadores ni crea notificaciones retroactivas.

Antes de aplicarla manualmente, el diagnóstico `sql/003-notificaciones-diagnostico.sql` permite consultar y guardar las definiciones actuales de los disparadores. Si la migración informa un productor desconocido, no retirarlo: debe revisarse primero. No se ha comprobado el esquema vivo ni aplicado DDL en Supabase.

### Cobertura de entregas

- PerriCasillas escribe sus premios en `shop_inventories`. Se prueban los siete tipos mediante el juego real. Las monedas se notifican por premio bruto cuando se cobran y entregan juntas, sin alterar el coste ni el saldo final.
- PerriDuelos incrementa `perri_cofres_minijuego` en el inventario compartido. Sus filas auxiliares de cofres no generan un segundo aviso; se notifica la subida del contador efectivo.
- PerriPet guarda PC, gemas, chatarra y objetos propios; esos recursos están excluidos. Sus escrituras frecuentes no generan avisos de esos recursos.
- PerriRPG guarda equipo y consumibles fuera del inventario compartido; no se añaden productores de avisos a sus tablas. Si una recompensa modifica cualquiera de los siete contadores, el mismo disparador la cubre.
- Abrir PerriCofres entrega monedas y otros premios; los cofres de minijuego entregan cajitas y bolsas. Se prueban las aperturas reales, sus consumos y la repetición de recibos. Abrir bolsas de gemas/chatarra o cajitas entrega recursos excluidos y no crea avisos por ellos.
- Los pases diarios, concesiones tradicionales y otros mecanismos que actualicen los siete campos quedan cubiertos en la escritura de la fila. El acceso a sus herramientas y sus reglas no se cambia. Cartas conserva contexto del premio bruto de monedas; no se habilitan acciones antiguas ni administrativas.
- Aumentos positivos generan un aviso por tipo de recurso y entrega; cantidades mayores de uno se agrupan en ese aviso. Reducciones, escrituras idénticas, consumo, operaciones revertidas y repetición de un recibo ya confirmado no generan nuevos avisos.

### Tarjetas y panel

Las tarjetas reutilizan imágenes originales de los siete objetos, con un icono original de comunicación/social para otros avisos. Conservan título, mensaje y fecha; la imagen nunca procede de una URL arbitraria del payload. El API expone únicamente `itemId` y `amount` del payload, sin otros metadatos internos.

El panel calcula su altura con la composición anterior antes de aplicar la tarjeta visual y conserva esa medida; mantiene el CSS exterior, anchura, centrado, límites de pantalla y scroll interior. Se recalcula igual al redimensionar la ventana. El verificador compara geometría con el commit aprobado `445eda4` en 15 escenarios (1, 7 y 20 avisos, cinco resoluciones).

Pruebas adicionales: `node --test tests/reward-notifications.test.js`, `node tools/verify-notification-cards.mjs`. Las pruebas de backend utilizan PostgreSQL efímero y el código original de los juegos, nunca cuentas de producción.

**Publicación pendiente:** revisar y ejecutar manualmente 003 en Supabase y publicar el código conjuntamente. El código sin ese SQL no sustituye los disparadores actuales ni garantiza la nueva lista exclusiva en producción.

## SQL definitivo con copia y restauración

El filtro final reconoce recompensas explícitas (`payload.category = reward`) y los cuatro formatos exactos de los productores legados excluidos. Nunca descarta un aviso únicamente porque su `kind` coincida con un objeto: conserva categorías administrativas, sociales o de otros sistemas y mensajes no identificados como entregas.

Ejecutar manualmente **solo** `sql/003-notificaciones-recompensas.sql` completo. Antes de modificar disparadores crea automáticamente una copia consistente de `shop_inventories`, `shop_notifications` y `shop_random_key_tickets`, así como las definiciones de los disparadores afectados, en el esquema privado `pw2_backup_003`. Se revoca su acceso a PUBLIC, anon, authenticated y service_role; no se publica en la web. Repetir el SQL no sobrescribe esa primera copia. Al terminar muestra fecha y recuentos de la copia. Si falla, no continuar con fragmentos: la transacción se cancela.

La copia real de producción aún NO existe: se creará al ejecutar el SQL. La copia dentro de la misma base permite deshacer este cambio; no sustituye una copia externa para pérdida total del proyecto.

`sql/003-notificaciones-restaurar.sql` es exclusivamente para deshacer 003. Restaura los disparadores anteriores y recupera avisos de la copia que falten. Conserva todos los avisos nuevos y los estados de lectura actuales; no sobrescribe inventarios ni tickets y nunca rebobina recursos ganados después. Las instantáneas de ambas tablas permanecen guardadas para recuperación manual si surgiera un incidente ajeno a esta migración. No se ejecuta normalmente después de 003.

Comprobadas en PostgreSQL efímero: conservación de avisos sociales/administrativos, siete premios reales de Casillas, aperturas reales de cofres y bolsas, ausencia de duplicados por reintentos, aislamiento de la copia, repetición de la migración y restauración sin pérdidas. No se ha modificado producción ni se han publicado las tarjetas.
