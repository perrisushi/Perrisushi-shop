# Preparación de integración — 28/10/2026

## Estado de esta fase

Se incorpora src/services/api-client.js y su batería de pruebas. El módulo no se importa desde la interfaz ni inicia peticiones al importarse o construir un cliente. La vista previa, su CSP connect-src 'none', la lista blanca del servidor y todos los controles desactivados permanecen intactos. No hay conexión a Supabase ni backend real. Las respuestas de las pruebas son dobles locales en memoria.

El paquete original y la copia de retorno de los archivos existentes se conservan en .preparacion-integracion/. No había repositorio Git inicializado. No se sustituyen README, HTML, CSS, vistas ni recursos con los del ZIP.

## Capa incorporada

Cliente del mismo origen con cookies de servidor, método GET/POST explícito, peticiones sin caché HTTP, sin redirecciones, timeout de 10 segundos, deduplicación de lecturas simultáneas y caché corta por instancia. No hay intervalos, reintentos automáticos, Google, almacenamiento persistente, claves de Supabase ni tokens en URL. Las acciones solo existen como métodos futuros y no tienen botones conectados.

Se corrigieron problemas del original demostrados mediante nuevas pruebas: acceso a una promesa aún no inicializada si el transporte lanza síncronamente, falta de deduplicación de getSession, paginación NaN/fraccionaria y base '/' que podía construir una ruta con doble barra. Los límites se convierten en enteros de 1 a 50; los no finitos usan 20. JSON y fallos de transporte se convierten en errores públicos estables sin mensajes internos.

clearCache separa generaciones de peticiones. Toda mutación invalida antes de empezar, también si login/logout falla; los resultados de una generación anterior se rechazan con session_changed y no repueblan la caché ni eliminan solicitudes nuevas. Una mutación exitosa vuelve a invalidar las lecturas que comenzaron durante ella. La invalidación no cancela una operación que el servidor ya haya recibido: si se pierde una respuesta, hay que reconciliar con el servidor y no repetir automáticamente. Un timeout tampoco demuestra que una escritura no haya ocurrido.

Crear una única instancia por sesión/controlador de la aplicación y ejecutar clearCache antes de reemplazar cuenta, ante expiración confirmada o cuando otro contexto informe de un cambio de sesión. No compartir la instancia entre usuarios. Las lecturas de sesión no se cachean, pero se deduplican mientras están pendientes. TTL: perfil 30 s, inventario 20 s, historial 10 s, usuarios 60 s, avisos 30 s, Random Key 20 s y sorteos 60 s. Un GET 401 de la generación vigente invalida la caché; un error antiguo no invalida el estado nuevo.

## Todos los puntos que pasarán de maqueta a datos verificados

| Archivo / punto exacto | Sustitución futura | Métodos disponibles / trabajo pendiente |
|---|---|---|
| src/main.js: inicialización final y render() | Controlador de sesión y carga por ruta; conservar renderizadores y navegación | getSession; estado de carga/error/vacío explícito, descartar resultados de rutas o sesiones anteriores |
| src/main.js: modalMarkup('auth'), evento auth | Formulario tradicional de usuario y contraseña; el campo actual es correo y deberá cambiar a nick tras acordar contrato | login(nick,password); no Google, no persistir contraseñas ni autologin simulado |
| index.html: identity-chip y profile-badge | Nombre y estado de la sesión auténtica | Texto mediante textContent; no tratar atributos data como prueba de identidad |
| src/main.js: setAuthenticatedProfile(), profileView(), selectedAvatar | Datos y avatar derivados de perfil propio | getProfile; el contrato debe incluir identidad canónica, nombre, avatar y datos autorizados. profileView sigue siendo estático: habrá que parametrizarlo |
| src/main.js: modalMarkup('album'), data-avatar y data-album-tab | Encontrados/desconocidos reales y guardado de elección | getProfile o endpoint de colección a definir; updateAvatar solo para un ID autorizado. Quitar selección demo; actualizar ambos avatares únicamente al confirmar el servidor |
| src/main.js: modalMarkup('history') | Historial propio paginado, sin movimientos inventados | getHistory({cursor,limit}); parametrizar el diálogo conservando su estilo |
| src/preview-pages.js: DEMO_USERS y renderUsersPreview() | Usuarios reales y campos públicos mínimos | listUsers({cursor,limit}); eliminar las 15 demos del flujo real; no migrarlas ni enviarlas al backend |
| src/preview-pages.js: DEMO_ITEMS, INVENTORY_SLOTS, renderInventoryPreview(), data-pw04-item | Casillas y detalle de objetos auténticos, monedas y boletos | getInventory; separar renderizado de DEMO_ITEMS, retirar cantidades 2/5 y notas de maqueta solo tras respuesta válida. No añadir aperturas, premios o transferencias |
| src/main.js: modalMarkup('notifications'), evento notifications | Avisos persistentes paginados y marcar como leído | getNotifications y markNotificationRead; carga al abrir/reconectar/acción confirmada, sin polling |
| src/preview-pages.js: renderShopPreview(), data-pw04-shop-tab/panel | Solo Random Key y Sorteos; estructura de llaves, canjes, tickets y participaciones | listRandomKeys y listRaffles. Estados desactivados hasta validar contratos, permisos y pruebas |
| src/preview-pages.js: pw04-shop-cta | Canje y compra posteriores, aún deshabilitados | redeemRandomKey y buyRaffleTicket; idempotencia verificada en servidor, costes/premios nunca calculados en cliente |
| src/main.js: modalMarkup('logout'), evento logout | Logout real y limpieza completa del estado privado visible | logout; clearCache, reiniciar avatar y datos, descartar respuestas viejas. Fallo de red no equivale a cookie invalidada: reconciliar antes de declarar cierre remoto |
| src/main.js: música, asistencia, navegación y gamesView | Se conservan | No requieren nueva API. No tocar los cuatro minijuegos |

El catálogo local de avatares es una lista de recursos válidos, no prueba de desbloqueo. Los registros reales y los títulos/logros de las capturas antiguas no deben copiarse ni reconstruirse como datos reales.

## Contrato provisional del backend propio

La base sugerida es /api. Rutas propuestas, no mapeos de tablas:

- GET /session, /profile, /inventory, /users, /history, /notifications, /shop/random-key y /shop/raffles.
- POST /auth/login, /auth/logout, /profile/avatar, /notifications/read, /shop/random-key/redeem y /shop/raffles/buy.
- Cursores opacos y máximo 50 filas para usuarios, historial y avisos. Random Key y sorteos también necesitarán paginación si el esquema revela listados extensos; no devolver tablas completas bajo un objeto agregado.
- Los datos privados se resuelven desde la sesión en servidor. No aceptar nick/user_id del navegador como autorización. Login usa nick únicamente como credencial para identificar la cuenta existente.
- Respuestas JSON objeto/array como mínimo; todavía falta acordar y validar sus campos, tipos y DTO por operación, así como errores públicos. No hay contrato de éxito definitivo ni tablas/columnas supuestas.

Errores preparados: session_expired (401), forbidden (403), too_many_requests (429), timeout (408), session_changed (409 local), invalid_server_response (502 local), network_error (0 local) y request_failed. No mostrar al usuario trazas ni datos de respuestas internas.

## Siguiente fase, después del diagnóstico auténtico

1. Revisar las salidas SQL de solo lectura que el propietario entregue, sin contraseñas, hashes, claves ni datos personales innecesarios. Este ZIP no contiene ese diagnóstico ni resultados de esquema: no se han ejecutado consultas ni supuesto tablas. Confirmar IDs/nick canónico, relaciones, catálogo de objetos, moneda/boletos, logros/Perrilogos, historial, avisos, Random Key, sorteos, restricciones y permisos. Acordar estrategia de contraseñas existentes y actualización segura, sin duplicar cuentas.
2. Diseñar contratos/DTO y backend separado en una carpeta nueva backend/ (a crear después de decidir runtime y estrategia de sesiones), fuera de public/ y del servidor estático. Secretos solo del servidor. No copiar server.js o supabase-shop-api.js antiguo. Preparar pruebas de autorización y concurrencia con una base de pruebas independiente.
3. Diseñar cookies HttpOnly, Secure bajo HTTPS, SameSite apropiado, expiración e invalidación real. Definir control CSRF, validación de Origin, CORS privado sin '*', rate limiting y protección de contraseñas. El cliente actual aún no obtiene ni envía tokens CSRF; cuando se elija el protocolo, extender src/services/api-client.js y sus pruebas antes de habilitar cualquier POST en la UI.
4. Archivos concretos a modificar entonces: src/services/api-client.js (contratos, CSRF y endpoints acordados), tests/api-client.test.js (contratos/errores), un nuevo src/services/session-controller.js (estado por sesión), src/main.js (puntos de la tabla) y src/preview-pages.js (renderizadores parametrizados y eliminación de demos). Mantener CSS y recursos actuales.
5. En index.html, cambiar connect-src 'none' a connect-src 'self' solo cuando exista backend probado del mismo origen. En dev-server.mjs permitir exclusivamente los módulos públicos nuevos por nombre y/o configurar proxy local a backend separado; no exponer backend/, .env, credenciales o SQL. Actualmente /src/services/api-client.js no está en la lista blanca ni importado: es deliberado para evitar activación accidental.
6. En pruebas de integración nuevas bajo tests/, verificar sesión A/B, IDs conservados, logout/expiración, privacidad, paginación/caché, CSRF, límites de consumo y notificaciones sin intervalos. Instrumentar métricas por ruta/estado/duración sin nick, contraseñas, tokens, payload privado o cursores en logs. La instrumentación de métricas no está implementada en esta fase.
7. Activar primero sesión y lecturas. Después, de forma separada, cambio de Perrilogo y lectura de avisos. Compras/canjes solo tras permisos, transacciones, idempotencia y ensayos de concurrencia. Toda modificación de Supabase será manual por el propietario, con SQL revisable, copia de seguridad y recuperación; no se incluye ninguna ahora.
8. Publicación primero en entorno de pruebas separado, con HTTPS y revisión humana, conservando el sitio antiguo hasta aprobación y plan de reversión. No hay despliegue en esta entrega. Google queda fuera hasta el final.

## Cómo verificar esta entrega

node --test tests/api-client.test.js; node --test tests/*.test.js; node tests/revision_sin_brillos.mjs; node tests/revision-04.mjs; node tests/validacion-estructural.mjs. Las pruebas usan fetchImpl simulado: nunca ejecutan compras ni peticiones reales. npm test equivale a la segunda orden; este entorno no tiene npm en PATH.
