# PERRILAND — integración local preparada

Fecha: 4 de noviembre de 2026.

Checkout: `C:\Users\borja\Documents\GitHub\Perrisushi-shop` (origen `perrisushi/Perrisushi-shop`). Se identificó como la copia reciente con administración, sesiones persistentes, cosméticos y optimizaciones. No se modificó la copia antigua de F:.

El prototipo independiente `C:\Users\borja\Desktop\overlay fi` y su servidor 8792 permanecen intactos. La integración utiliza una copia versionada de su motor en `backend/perriland/vendor`, con huellas en `source-manifest.json`. Los PNG del terreno, Slimes, bomba y propulsor son los originales; los Perrilogos se obtienen del catálogo y del equipamiento de cada cuenta de PerriWeb.

## Lo implementado

- Entrada **PERRILAND** en Minijuegos, dentro de la ventana de juego existente. Un usuario normal solo puede entrar cuando el servicio está activo.
- Una simulación autoritativa de sala en el backend, con paso fijo y el mismo motor. No depende del localhost del visitante ni crea un mundo por pestaña.
- Un personaje por nick autenticado, independientemente de cuántas pestañas o sesiones abra esa cuenta. El nick proviene de la sesión HttpOnly; el navegador no elige usuario, rol, posición, velocidad ni recompensa.
- El permiso administrativo se consulta en servidor. Solo la cuenta existente **Perrisushi** con `shop_access.is_admin = true` puede generar Slime, Slime bomba y propulsor, pausar o reiniciar la sala. Cada acción se revalida y se audita en `shop_operations`.
- La disponibilidad se administra desde las herramientas existentes: Mi Perfil → administración → controles → **PerriLand**. Como en el resto de la web, `active=true` significa mantenimiento/acceso cerrado. La migración lo deja cerrado inicialmente.
- Vista normal con escenario, saldo PC real, controles y pantalla completa. Controles táctiles simultáneos y teclado: A/D, Espacio, E, F, Q, G; WASD con la mochila. Las banderas son independientes por jugador y conservan duración y cambio pendiente.
- Control exclusivo por pestaña mediante lease; entradas antiguas se rechazan. Perder foco, cerrar la pestaña controladora o dejar de enviar pulsaciones libera el movimiento.
- Al cerrar la última conexión se retira el cuerpo de la física para evitar premios o penalizaciones estando desconectado. Reentrar conserva el ID y no duplica personaje ni créditos.
- Sin máximo de participantes impuesto por producto. Se amplía la búsqueda de posiciones seguras fuera de las cuatro posiciones centrales del prototipo. Si el terreno está ocupado, se espera espacio libre en vez de solapar personajes.
- Se mantienen Slimes normales y automáticos, resistencia, empuje actual e inercia; bomba de 8 s, mecha y explosión originales; propulsor de 30 s con suspensión y empuje aumentado; monedas y caídas. Se conserva el búfer visual de 100 ms del renderizador.

## PC reales: cómo se confirman

| Evento autoritativo | Cambio en PC |
|---|---:|
| Moneda normal | +5 |
| Moneda especial | +20 |
| Caída definitiva | −2, con mínimo cero |
| Golpes, generación o reinicio | Sin cambio de saldo |

La física genera un ID de evento con época y secuencia. El backend verifica sesión/cuenta, sanciones y disponibilidad, toma el mismo bloqueo transaccional `pw2:shared-games-economy` de los demás juegos y bloquea la fila del inventario. En una sola transacción actualiza `shop_inventories.pc`, `shop_public_users.pc`, actividad, recibo en `shop_operations`, ledger de PERRILAND y checkpoint de sala. Un ID repetido no vuelve a aplicarse. Un fallo revierte el conjunto.

Nunca se utiliza un saldo del navegador ni la puntuación local como saldo absoluto para escribir en la cuenta. Un cambio simultáneo desde otro sistema se respeta porque se lee el saldo real bajo bloqueo. El reinicio de sala conserva los PC; no ejecuta un reset económico. Los eventos rechazados tampoco muestran un premio confirmado.

`pw2_economy_operation` no se modifica ni se sustituye. La nueva ruta no reactiva Random Key ni altera precios, boletos, inventarios u operaciones de otros minijuegos.

Los checkpoints periódicos son de cinco segundos y se confirman también al incorporarse, ante una acción administrativa y ante cada evento económico. Estado y dinero se confirman juntos en los eventos económicos. Tras un fallo de persistencia se detiene la sala y se cierran sus conexiones; reiniciar el backend recupera el último checkpoint confirmado. Ante una interrupción puede perderse movimiento reciente sin confirmar, nunca se reconstruyen saldos a partir del cliente.

## Sesiones, red y seguridad

- `/api/perriland/context` y `/api/perriland/join` reutilizan autenticación, sanciones, Origin y CSRF de PerriWeb. La entrada no acepta identidad ni campos económicos.
- El WebSocket `/perriland/socket` requiere un ticket efímero de un solo uso, asociado a esa misma sesión, y el Origin configurado. No se pasan credenciales en la URL.
- Se revalida la sesión en segundo plano; las operaciones admin se comprueban de nuevo en cada acción y los efectos económicos dentro de su propia transacción.
- Payloads acotados, secuencias monotónicas, controles limitados a direcciones/acciones y protección contra conexiones lentas. Son límites técnicos de transporte, no de participantes.
- Los recursos públicos de PERRILAND son código e imágenes sin identidad ni saldos, de modo que su descarga no repite consultas privadas. Su HTML, API, conexión y acciones sí están protegidos. Los demás juegos conservan sus reglas de acceso anteriores.
- Una conexión PostgreSQL de sesión mantiene el bloqueo de líder. Otra instancia no crea una segunda sala independiente. Para esta versión se configura **una réplica de Railway**; no se ha añadido un sistema de enrutamiento entre varias réplicas.
- La conexión de sesión dedicada requiere PostgreSQL directo o pooler en modo sesión. No se admite el pooler de transacciones 6543. Se mantienen las comprobaciones TLS existentes.

## Pendiente antes de activar en producción

No se ha ejecutado SQL remoto, no se han cambiado saldos reales de producción y no hay Commit, Push ni despliegue.

1. Revisar y aprobar `sql/006-perriland.sql`. Crea dos tablas privadas (`pw2_perriland_room`, `pw2_perriland_events`), amplía únicamente el ámbito permitido de mantenimiento y añade PerriLand cerrado. No cambia cuentas, saldos ni funciones económicas existentes. Ejecutarla solo cuando el propietario lo autorice y después de la copia de seguridad correspondiente.
2. Mantener las variables ya usadas por la web para Supabase, PostgreSQL, sesiones persistentes y CSRF. PERRILAND exige que REST y PostgreSQL se identifiquen como el mismo proyecto, `SESSION_STORE=supabase` y las escrituras de sesión ya autorizadas. No se crean usuarios ni se asigna de nuevo el rol administrador.
3. Añadir `PW2_PERRILAND_ENABLED=true` cuando esté aprobado; usar conexión directa/de sesión y una réplica. El backend sirve el sitio y el WebSocket bajo el mismo `PUBLIC_ORIGIN`.
4. Ejecutar `npm ci` y `npm run build` en el proceso normal de preparación. La dependencia nueva es `ws`, fijada en el lockfile. Solo se empaquetan recursos públicos; motor de servidor, fixtures y credenciales no se publican en dist.
5. Tras el despliegue que se autorice, abrir el control existente de PerriLand y quitar el mantenimiento para permitir usuarios normales. Antes, comprobar dos cuentas reales autorizadas, latencia y recuperación de conexión en Railway.

Desarrollo local con el backend real: `npm run backend` y, si se usa la vista previa, `npm run dev`. El dev-server ahora reenvía también el WebSocket al backend loopback. `PUBLIC_ORIGIN` debe coincidir con el origen de la página: por defecto 4173 si se usa el frontend de desarrollo, o el puerto del backend si sirve directamente el sitio. No conectar pruebas que alteran inventarios a producción.

## Pruebas reproducibles y resultados

- `node --test tests/perriland.test.js tests/perriland-gateway.test.js`: **32/32**, incluyendo sus subpruebas. PostgreSQL local mediante PGlite; no Supabase. Se comprueban migración idempotente, permisos, PC +5/+20/−2, mínimo cero, duplicados, rollback, revocación, disponibilidad, reinicio de backend, avatares propios, ocho participantes, banderas y checksum del motor copiado.
- `npm test`: **393/393 correctas**, batería completa de PerriWeb en `tests-completos.txt`, incluyendo autenticación tradicional/Google, permisos, economía y juegos anteriores. No se retocan pruebas ajenas para esconder fallos.
- `node tools/verify-perriland.mjs`: **11 grupos funcionales en Edge**, tres cuentas autenticadas y dos movimientos/recogidas simultáneos; SQL verifica saldos por cuenta. Recarga sin premio repetido, pausa y generación admin, reinicio con saldo intacto, entrada desde Minijuegos, pantalla completa, móvil 844×390 con dos toques reales del protocolo del navegador y 390×844 sin scroll horizontal. Cero errores JS, cero recursos del juego fallidos y cero peticiones externas.
- Render local: coste medio de dibujo aproximado de **0,08 ms**, búfer de 100 ms y sin fotogramas sin estado tras calentar. Esto no mide la latencia de Railway/Supabase ni garantiza rendimiento de dispositivos distintos.
- Capturas revisadas en `capturas/`: PC usuario y admin, móvil horizontal y vertical. Las cuentas y saldos de esas capturas son fixtures locales; el código productivo usa exclusivamente las cuentas y los inventarios autenticados de la web.

No se ha probado en teléfono físico ni en Railway. La prueba de exclusión de líder utiliza clientes de sesión emulados sobre el PostgreSQL local de pruebas; falta verificar failover real y el modo de conexión del pooler en el despliegue. Las confirmaciones económicas dependen de la latencia de PostgreSQL, todavía no medida en producción.

## Archivos

- `backend/perriland/`: transporte, sala, persistencia, validación de configuración, codec y copia del motor original.
- `games/perriland/`: interfaz, renderer/timeline adaptados y sprites originales. Los Perrilogos usan el catálogo existente de la web; el bundle del juego se regenera desde ese catálogo en cada build, sin mantener una lista comercial distinta.
- Integración mínima en `backend/app.mjs`, `server.mjs`, `site.mjs`, `public-paths.mjs`, `service-scopes.mjs`, `management.mjs`, `dev-server.mjs`, `src/main.js` y `src/services/api-client.js`.
- `sql/006-perriland.sql`: migración pendiente de revisión/aprobación remota.
- `scripts/perriland-manifest.mjs`, `scripts/build.mjs`, `games/manifest.json`, `package.json` y lockfile: compilación y WebSocket.
- `tests/perriland*.test.js` y `tools/perriland-*.mjs`, `tools/verify-perriland.mjs`: pruebas aisladas. Sus fixtures no son importados por producción ni copiados a dist.
- Copias previas en `local-backups/antes-perriland/`, excluidas de Git. No se cambiaron imágenes de Perrilogos, marcos, escalado global, botones Twitch/YouTube ni lógica de los juegos originales.
