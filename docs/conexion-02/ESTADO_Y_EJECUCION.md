# Conexión 02 — estado real y ejecución local

## Resultado y límites

Se construyó el backend Node sin dependencias externas y se conectó la interfaz a sus lecturas. Se conservaron escala PC, marcos, disposición móvil, navegación, música y asistencia. Se sustituyen datos demo por estados de carga, sin sesión, vacío y error; no hay modo demo en el arranque normal. La elección de Perrilogo se muestra en modo lectura y todos los POST salvo login/logout se bloquean también en servidor.

**Verificado con fixtures y transportes locales, no contra Supabase real.** No existe backend/.env en este proyecto. No se usaron credenciales, no se leyeron filas de producción, no hubo SQL ni escrituras remotas. Las capturas de esta entrega contienen exclusivamente cuentas, saldos, códigos y avisos ficticios del laboratorio local. No demuestran que las cuentas reales estén ya conectadas.

La comparación autorizada contra una cuenta propia del propietario sigue pendiente. No se considera lista para producción, no se ha desplegado y no se cambia perrisushi.com.

## Ejecutar sin configurar Supabase

Requiere Node 20.6+ para --env-file (se ha probado con Node 24.22.1). No hace falta instalar paquetes. Dos terminales desde F:\Perriweb 2.0:

1. `node backend/server.mjs` — backend de desarrollo en http://127.0.0.1:4177.
2. `node dev-server.mjs` — interfaz en http://127.0.0.1:4173.

La web indicará que falta configurar el backend. Si solo arranca el frontend, indicará que el backend no está disponible. Hay que reiniciar procesos antiguos: el proxy y la lista de módulos permitidos cambian en esta entrega. Ctrl+F5 después.

## Configurar posteriormente una comprobación de solo lectura

El propietario debe crear backend/.env a partir de backend/.env.example y completar los valores **fuera del chat**. El archivo está ignorado por Git y bloqueado por el servidor HTTP. Variables:

| Variable | Función |
|---|---|
| SUPABASE_URL | Origen HTTPS del proyecto, sin rutas, query ni credenciales |
| SUPABASE_SERVICE_ROLE_KEY | Credencial privilegiada exclusivamente en servidor |
| PUBLIC_ORIGIN | Origen exacto del frontend, por defecto http://127.0.0.1:4173 |
| BACKEND_PORT | Puerto privado del backend, por defecto 4177 |
| SESSION_STORE | memory por defecto; supabase solo tras aprobación adicional |
| ALLOW_SUPABASE_SESSION_WRITES | false por defecto; no cambiar durante la fase de lectura |
| CSRF_SECRET | Secreto aleatorio del servidor; obligatorio estable y >=32 caracteres en producción |
| BACKEND_METRICS | true permite métricas JSON sin identidades ni payload privado |

Arranque con configuración local: `node --env-file=backend/.env backend/server.mjs`. El frontend usa API_TARGET=http://127.0.0.1:4177 por defecto; si se cambia el puerto, ajustar API_TARGET. Si cambia el puerto/origen del frontend, ajustar PUBLIC_ORIGIN también. El servidor no carga .env por su cuenta ni necesita que las claves estén en el navegador.

**Modo memory**: valida el acceso tradicional mediante lecturas de shop_access y shop_players y guarda las sesiones v2 solo en RAM del servidor, como hash del token. Permite probar login, lecturas y logout sin insertar ni borrar ninguna fila de Supabase. Reiniciar el proceso termina esas sesiones. No es el modo de producción, no se comparte entre instancias y no utiliza los tokens legados de shop_sessions.

**Modo supabase**: código preparado para nuevas filas de shop_sessions con token `v2:` + SHA-256 del token aleatorio de 256 bits. Crear y eliminar únicamente esa sesión requiere SESSION_STORE=supabase y ALLOW_SUPABASE_SESSION_WRITES=true, pendiente de consentimiento explícito y validación en pruebas. Se envían nick, token hash, expires_at, created_at y updated_at, sin upsert. No se elimina ninguna sesión antigua ni se actualizan cuentas. No se ha ejecutado este modo contra una base real.

Para la prueba real posterior se necesita autorización para una cuenta propia, con contraseña introducida por el propietario en la interfaz local. Comparar perfil, inventario, historial, avisos y canjes desde las lecturas conocidas, sin capturar ni publicar códigos de juegos o datos personales. No exportar contraseñas/hashes. No se ha realizado esta comparación en la presente entrega.

## Qué está implementado

- POST /api/auth/login: nick canónico exacto (sin renombrarlo ni normalizarlo), SHA-256 legado comparado en tiempo constante, shop_access.active y shop_players.active estrictamente true. Errores genéricos para inexistente/desactivado/clave incorrecta; límites de intentos por IP y hash del usuario. Sin registro ni actualización de hashes.
- Cookie pw2_session: aleatoria, HttpOnly, SameSite=Strict, Path=/, Secure si PUBLIC_ORIGIN es HTTPS. No hay tokens de sesión en JSON ni almacenamiento web. El token CSRF independiente viaja en cabecera X-CSRF-Token y se conserva únicamente en memoria del cliente.
- GET /api/session: valida expiración y actividad de la cuenta, sin escrituras. POST /api/auth/logout: Origin exacto y CSRF, revoca solo la sesión del navegador según el almacén seleccionado.
- GET /api/profile: perfil propio, IDs poseídos y catálogo habilitado; no se otorgan logos por defecto. Un recurso original reconocido se traduce a un archivo local de una lista cerrada, nunca se carga asset_path remoto. La elección actual debe estar en owned_logo_ids; si falta la fila, devuelve profile:null, sin crearla.
- GET /api/users: página de shop_players activos con joins a shop_access activo y shop_public_users; DTO público mínimo, sin N+1. El snapshot público se conserva como fuente histórica: su actualización/correspondencia canónica aún debe verificarse con datos reales.
- GET /api/inventory: columnas explícitas de todos los campos de inventario adjuntos, sin normalizar valores ni calcular premios. El DTO conserva ceros, negativos y cantidades originales. La interfaz muestra cantidades no nulas/no cero en casillas; los ceros siguen en el DTO. No se accede al inventario de PerriPet ni RPG.
- GET /api/history y /api/notifications: por nick de la sesión y paginados, con DTO mínimo. Los enlaces y payload arbitrarios de notificaciones no se activan. Carga a demanda, no polling.
- GET /api/shop/random-key: tickets y canjes propios paginados, más random_key de inventario. Solo devuelve claves de shop_random_key_claims del propietario autenticado. **No consulta shop_random_key_pool**. No se interpreta arbitrariamente qué estados heredados son «activos»; se muestran los valores con aviso de reglas pendientes.
- GET /api/shop/raffles: informa indisponibilidad por reglas sin confirmar y devuelve los tres campos de boletos existentes del inventario propio. No inventa tabla shop_raffles, precios, calendario, premios o límites.
- POST de avatar, lectura de avisos, compra y canje: operation_disabled, aunque se invoquen manualmente. No existen acciones de abrir cofres, premiar o administrar.

Cursores opacos con límite máximo 50. Random Key tiene ticketCursor y claimCursor independientes; historial, avisos y usuarios usan cursor. Las lecturas siguen orden determinista por nick o id ascendente; el historial no presupone orden por fechas heredadas. Los IDs bigint no representables con seguridad por JSON numérico generan un error controlado en lugar de paginación con pérdida de precisión.

## Seguridad y ejecución

El adaptador usa PostgREST HTTPS solo desde backend, proyecciones explícitas, filtros por nick derivados de sesión, timeout y sin redirecciones. Solo permite escrituras en shop_sessions bajo la doble configuración anterior. GET no llama INSERT/UPDATE/DELETE, upsert o RPC. Las credenciales solo se consultan para login; la validación de sesión selecciona nick/active sin code_hash. Cookies, contraseñas, hashes y claves nunca se registran en métricas.

El proxy solo apunta a un backend HTTP loopback configurado, filtra cabeceras y no publica rutas de backend/, .env, CSV de metadatos ni package.json. Se permiten únicamente los dos módulos de servicios nuevos por nombre. CSP del navegador permite connect-src 'self', no acceso directo a Supabase. Se validan Origin y JSON en POST, tamaño máximo 4096 bytes, nick 1–80 caracteres sin controles y contraseña 1–1024. No se confía en X-Forwarded-For ni isAdmin del navegador.

En este proxy de desarrollo, el rate limit por IP del backend agrupa el loopback; el límite por usuario sigue separado. Antes del alojamiento público debe definirse una lista explícita de proxies de confianza y un límite distribuido para varias instancias, sin aceptar cabeceras de IP arbitrarias. No basta con copiar este despliegue local a producción.

El cliente conserva deduplicación y caché corta por sesión. Cambio de cuenta, expiración y logout limpian datos privados y descartan respuestas de generaciones anteriores. No hay reintentos automáticos de POST. Un timeout no demuestra que una escritura futura no haya ocurrido; las operaciones económicas no se habilitan sin idempotencia/transacciones verificadas.

## Consultas por acción, medidas con transporte PostgREST simulado

| Acción / endpoint | Consultas GET en modo memory |
|---|---:|
| Login tradicional | 2 |
| Sesión con cookie válida | 2 |
| Perfil + catálogo | 4 |
| Usuarios públicos | 3 |
| Inventario | 3 |
| Página de historial o avisos | 3 |
| Random Key (tickets + canjes + inventario) | 5 |
| Estado de boletos de sorteos | 3 |

Las cifras incluyen la revalidación de cuenta de cada lectura. Modo persistente añade una consulta a shop_sessions por lectura autenticada y la escritura explícita en login/logout, si se aprueba. Son conteos de pruebas, no consumo medido en Supabase. El arranque de una página autenticada consulta sesión y perfil (6 lecturas en memory), y la navegación SPA usa caché. No hay consultas cada cinco segundos. BACKEND_METRICS registra exclusivamente ruta conocida, método, estado, duración y número de consultas.

## Pendiente de confirmar antes de conectar producción

1. Configuración privada y cuenta autorizada para una verificación real de solo lectura. Comparación de IDs/nick y todos los campos; compatibilidad de contraseñas reales y límites de longitud. No se han leído secretos o filas de producción.
2. Ejecución real de los joins PostgREST según las FK adjuntas, estado del caché de esquema y vigencia de shop_public_users.
3. Formato real de owned_logo_ids y achievements (no solo su tipo jsonb); si owned_logo_ids no es un array de strings, actualmente se trata como colección vacía, sin conceder derechos. Los logos sin recurso local reconocido muestran un icono genérico. El catálogo se limita a 51 entradas y señala si requiere paginación adicional.
4. Correspondencia visual completa de los objetos: solo se disponen de los recursos del proyecto, por lo que los objetos no mapeados se muestran con su nombre de campo y cantidad, sin inventar imágenes. Las cantidades se conservan.
5. Reglas/status de tickets, sorteos y canjes legados. No habilitar economía ni acciones de perfil/avisos hasta verificarlas.
6. Persistencia v2, longitud/constraints/triggers de shop_sessions, infraestructura de sesiones, rate limiting distribuido y revisión de seguridad en entorno de pruebas. Los CSV no contienen defaults, triggers ni todas las restricciones operativas.
7. Actualización de contraseñas SHA-256 sin sal y nuevas altas requieren diseño aparte. No se ha escrito ni migrado ningún hash.

## Alojamiento y publicación

GitHub aloja código; GitHub Pages no ejecuta este backend Node. Hace falta un servicio Node y un proxy HTTPS que sirva recursos públicos y /api bajo el mismo origen. Mantener backend y secretos fuera de los estáticos; no CORS '*'. Usar PUBLIC_ORIGIN HTTPS y cookies Secure. En NODE_ENV=production el backend exige HTTPS, persistencia aprobada y CSRF_SECRET estable. Estas comprobaciones no sustituyen la revisión previa ni habilitan por sí solas un despliegue.

Antes de Railway u otro alojamiento: confirmar binding/red privada, proxy confiable, variables fuera del repo, pruebas aisladas y recuperación. El servidor de frontend incluido sigue siendo de desarrollo. No se cambió configuración de producción, DNS o dominio ni se subió nada a GitHub.
