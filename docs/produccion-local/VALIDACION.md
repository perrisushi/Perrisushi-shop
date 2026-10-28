# Resultado de la validación local

Se ha trabajado exclusivamente en el código local. No se ha accedido a GitHub, Railway ni Supabase. No hay publicación ni validación de datos remotos.

- `npm test`: 83/83 pruebas aprobadas.
- `npm run build`: 480 archivos públicos; sin backend, SQL, tests, backups ni secretos.
- `node tools/verify-integration-final.mjs`: seis tamaños (1649×928, 1280×720, 1024×768, 390×844, 360×800 y 360×640), cero errores JavaScript.
- `node tools/verify-production-local.mjs`: PostgreSQL local y navegador en escritorio, móvil 390 y móvil 360; los cuatro juegos, canje, compra y prueba de respuesta perdida con reintento sin segundo cobro. Cero errores JavaScript/API inesperados y cero recursos 404. Capturas en capturas/ y registro en resultados.json.
- `node tools/verify-release-start.mjs`: nueve comprobaciones de arranque y archivos privados aprobadas. Los procesos temporales se cierran al terminar.
- `npm run check:live`: ejecutado sin variables privadas; se detuvo antes de consultar indicando que faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY. No se presenta como una comprobación real aprobada.

Las pruebas SQL cubren saldo, límite, tickets caducados, falta de stock, repetición/concurrencia de peticiones, vinculación de operación a cuenta/acción/política, rollback completo tras fallo al guardar el asiento y códigos duplicados del pool (incluyendo mayúsculas y espacios). La prueba de navegador pierde intencionadamente una respuesta de compra: dos peticiones conservan el mismo UUID, con un boleto y un solo cargo. En RPG se pierde la respuesta después de confirmar la compra y se inyecta después un HTTP 429: los tres intentos conservan el mismo UUID y producen un único objeto y un único gasto. El guardado de Pet utiliza su revisión original, comprobada dentro de la transacción; repetir una revisión antigua devuelve el estado vigente sin volver a gastar.

Los juegos se prueban con sus funciones originales: estado de los cuatro, guardado y reintento de Pet, apertura y premio de Casillas, ataque y reintento de Duelos, compra y consumo de RPG. Se comprueban también el rechazo de acciones administrativas, de identidades inyectadas, de objetivos de duelo de otra cuenta y la ocultación del inventario económico del rival. No se modifican sus reglas; se adapta el transporte, la transacción y el montaje. Los hashes comprueban los 389 recursos originales y el backend original descontando sus dos adaptaciones de integración.

En móvil se ajustó el contenedor de Casillas para evitar el escalado doble del tablero. Se comprobó la apertura de cartas y su ventana de premio desde el navegador. Duelos y Pet mantienen su proporción de 16:9 y disponen de acceso a pantalla completa cuando el navegador lo admite. El CSS de escala PC aprobado conserva su hash.

PGlite es PostgreSQL embebido de una conexión; estas pruebas no certifican un despliegue remoto multirréplica ni los triggers del proyecto real. La sincronización productiva se implementa con bloqueos de transacción PostgreSQL compartidos entre economía y juegos, no con un mutex de JavaScript. Las instrucciones manuales vigentes están en ../PUBLICAR_PRODUCCION.md; únicamente sql/001-economia-atomica.sql se proporciona para ejecución manual en el proyecto real.
