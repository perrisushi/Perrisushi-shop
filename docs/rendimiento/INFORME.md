# Rendimiento PerriWeb 2.0 — 29/10/2026

## Estado honesto de la entrega

Optimización implementada y guardada en C:\Users\borja\Documents\GitHub\Perrisushi-shop, sin Commit, Push ni despliegue. Hay mediciones HTTP públicas reales de www.perrisushi.com y comparaciones locales reproducibles. **No se ha medido una sesión autenticada ni acciones de juego en producción; tampoco existe todavía una medición de producción después de publicar. No se declara eliminada la espera real de varios segundos.**

No se ha accedido a Railway o Supabase ni se han cambiado variables, regiones, certificados, tablas, índices, cuentas o recursos reales. No se ha accedido a la sesión Chrome del propietario. La solicitud de autorización de este encargo sigue sin respuesta; el intento del encargo anterior terminó bloqueado por la herramienta al comprobar la URL.

## 1. Producción real: línea base pública

Cinco GET por recurso con Node fetch sin cookies, reutilizando sus conexiones HTTP cuando el cliente lo permite. Son tiempos de red/descarga desde este equipo, no tiempos de renderizado, LCP ni procesamiento SQL. La raíz HTML por sí sola no es la portada autenticada. La sesión anónima no consulta las cuentas y el 401 de contexto no es una apertura de juego.

| Recurso | HTTP | Primera muestra ms | Mediana otras cuatro ms | Rango total ms |
| --- | --- | ---: | ---: | ---: |
| / | 200 | 339.8 | 182.1 | 172.6–339.8 |
| /api/session | 200 | 177.8 | 177.4 | 173.8–181.9 |
| /src/main.js | 200 | 221.4 | 193.0 | 187.4–385.5 |
| /public/assets/fondo-menu-web-pc.webp | 200 | 250.7 | 202.8 | 197.7–606.4 |
| /api/games/context | 401 | 176.1 | 176.9 | 171.8–187.7 |

En las respuestas reales no había Content-Encoding para JavaScript ni Server-Timing. main.js descargó 28462 bytes y el fondo PC 157872 bytes. Las cabeceras identifican Railway; el indicador de borde cdg1 no certifica la región de la aplicación ni la de Supabase. No se atribuyen los retrasos a una distancia geográfica sin conocer ambas regiones.

Después de publicar: repetir node tools/measure-public-performance.mjs y conservar el JSON con PW2_PERF_OUTPUT apuntando a otro archivo. Aún no hay resultados de ese «después» remoto.

## 2. Causas comprobadas en código y correcciones

1. Cada recurso de juego verificaba sesión, acceso y jugador mediante tres llamadas REST. Ahora una consulta agrupada comprueba los mismos datos. Si PostgREST no tiene esas relaciones, se mantienen las tres comprobaciones originales sin exigir migraciones. Errores de permisos/conexión no se ocultan con ese fallback. No se cachea una sesión resuelta: las peticiones simultáneas de recursos con el mismo token comparten únicamente la verificación mientras está pendiente; tokens distintos no comparten resultados. Las mutaciones usan su validación independiente.
2. La portada consultaba la sesión inmediatamente después del login exitoso, aunque la respuesta ya acreditaba esa sesión. Ahora reutiliza esa respuesta y el perfil continúa validándose en servidor. La apertura de juegos repetía contexto en padre e iframe y consultaba otra vez /api/session. El padre entrega al iframe concreto su contexto autenticado y CSRF mediante un intercambio mismo origen y nonce; las acciones continúan verificando cookie, sesión y CSRF en servidor. En acceso directo, el iframe consulta su contexto por HTTP.
3. Inventario y disponibilidad del contexto se consultaban en secuencia; ahora se consultan independientemente en paralelo. No se anticipa ningún premio o consumo.
4. El backend de juegos volvía a leer la sesión/acceso recién verificados dentro de la misma transacción. Ahora reutiliza esas filas una sola vez y solo para el filtro exacto propio. Lecturas idénticas se deduplican únicamente dentro de esa operación; cualquier escritura invalida lecturas y comprobaciones de jugador, incluidos posibles efectos de triggers. No se deduplican escrituras ni se guarda inventario entre transacciones. Los dos límites SQL se fijan con un comando, manteniendo 5 s de lock_timeout y 10 s de statement_timeout locales a la transacción.
5. Los estáticos se releían y enviaban completos sin compresión ni ETag. Se añade gzip para texto, ETag, respuestas 304 y caché de archivos estáticos limitada a 64 MiB, invalidada por modificación/tamaño. HTML de juegos y API continúan no-store. Los otros recursos privados usan private,no-cache y Vary:Cookie: **también se comprueba sesión antes de cualquier 304**. La caché de archivos no contiene datos de usuario. No se reduce la calidad ni se elimina ningún recurso.
6. «Cargar más» reconstruía la tabla completa. Ahora añade las filas recibidas y conserva las ya existentes. La prueba de navegador comprueba la identidad del primer nodo antes/después. Se descartan respuestas de una lista sustituida. La tarjeta de juego se desactiva y anuncia aria-busy mientras espera; no simula resultados.

## 3. API local: comparación controlada

Mismos datos de laboratorio y código anterior obtenido mediante lectura de HEAD, frente al código modificado. Cuatro muestras por ruta; tabla con mediana de las tres posteriores a la primera. Se añaden 20 ms **nominales y sintéticos** por petición REST (la resolución del temporizador de Windows puede alargar la espera). Esto mide recorridos y sensibilidad a la red; no demuestra esos tiempos en Railway. Los datos de este laboratorio nunca se sirven en el arranque normal.

| API | Antes ms | Después ms | Llamadas REST antes → después | Cambio, positivo es mejora |
| --- | ---: | ---: | ---: | ---: |
| /auth/login | 123.5 | 124.1 | 4 → 4 | -0.4 % |
| /session | 61.3 | 29.8 | 3 → 1 | 51.3 % |
| /profile | 93.1 | 61.9 | 6 → 4 | 33.5 % |
| /users | 92.7 | 61.7 | 4 → 2 | 33.4 % |
| /inventory | 93.0 | 62.7 | 4 → 2 | 32.6 % |
| /shop/random-key | 93.3 | 60.0 | 6 → 4 | 35.7 % |
| /shop/raffles | 93.2 | 62.5 | 4 → 2 | 32.9 % |
| /games/context | 123.8 | 62.5 | 4 → 2 | 49.5 % |

No hay una optimización demostrada del POST de login en servidor: conserva las cuatro consultas/escrituras necesarias y su SHA-256 tradicional. La mejora del recorrido posterior consiste en quitar una petición, no en afirmar un login real más rápido sin medirlo.

## 4. Juegos: PostgreSQL local y misma secuencia

PGlite, mismas cuentas locales, esquema original, misma semilla aleatoria 123456789 aplicada únicamente al proceso de benchmark y 20 ms sintéticos por consulta. No se ha cambiado la aleatoriedad ni las mecánicas de producción. Casillas obtiene el mismo tipo de premio en ambas versiones. Cada estado se consulta una primera vez y otras tres; las acciones de compra/consumo/apertura/guardado son una sola muestra controlada cada una.

Estado inicial de backend; **no incluye descargas o renderizado**:

| Estado | Antes ms | Después ms | SQL antes → después |
| --- | ---: | ---: | ---: |
| PerriDuelos | 625.9 | 539.5 | 20 → 17 |
| PerriPet | 431.0 | 347.5 | 18 → 15 |
| PerriCasillas | 465.5 | 369.5 | 15 → 12 |
| PerriRPG | 436.8 | 339.7 | 19 → 16 |

Estados posteriores, mediana de tres:

| Estado | Antes ms | Después ms | SQL de cada muestra | Cambio |
| --- | ---: | ---: | ---: | ---: |
| PerriDuelos | 555.9 | 465.7 | 18/18/18 → 15/15/15 | 16.2 % |
| PerriPet | 404.7 | 313.5 | 17/16/16 → 14/13/13 | 22.5 % |
| PerriCasillas | 433.1 | 340.4 | 14/14/14 → 11/11/11 | 21.4 % |
| PerriRPG | 435.5 | 339.7 | 19/19/19 → 16/16/16 | 22.0 % |

Acciones, una muestra por versión; no deben interpretarse como percentiles de producción:

| Acción | Antes ms | Después ms | SQL antes → después |
| --- | ---: | ---: | ---: |
| RPG:purchase | 530.7 | 432.5 | 22 → 19 |
| RPG:consume | 430.4 | 341.8 | 14 → 11 |
| Casillas:open | 1399.7 | 1300.3 | 45 → 42 |
| Pet:save | 588.9 | 495.6 | 19 → 16 |

Las operaciones siguen usando transacción, bloqueo económico compartido, validación de saldo/consumo/premio y recibo idempotente. **El bloqueo global no se ha eliminado para ganar velocidad.** Puede seguir siendo un límite con usuarios simultáneos: debe medirse su espera en producción antes de cambiar esa coordinación. No se promete que toda acción remota sea instantánea.

## 5. Descargas y navegador local

Transferencia de recursos anterior/actual en el servidor local; el código actual incluye los cambios necesarios. Los originales de los juegos siguen verificando sus hashes. La revalidación no elimina el coste de red de comprobar una sesión.

| Recurso | Antes bytes | Después bytes | Reducción primera descarga | Segunda descarga actual |
| --- | ---: | ---: | ---: | --- |
| /src/main.js | 28461 | 8405 | 70.5 % | HTTP 304; 0 bytes |
| /perrirpg.js | 42540 | 11589 | 72.8 % | HTTP 304; 0 bytes |
| /public/assets/fondo-menu-web-pc.webp | 157872 | 157872 | 0.0 % | HTTP 304; 0 bytes |

Las imágenes WebP no se vuelven a comprimir: se conservan los mismos bytes. El coste de la primera compresión se paga una vez por versión de archivo y se reutiliza, con el límite de memoria indicado.

Navegador Edge, API real y PostgreSQL solo en memoria; tres tamaños 1649×928, 390×844 y 360×800. El recorrido completo hace 1743 → 577 llamadas REST locales (66.9 % menos). Incluye jugadas y reintentos provocados a propósito; no representa una acción individual ni una prueba autenticada de producción. Los estados y premios aleatorios pueden hacer variar ligeramente el total entre ejecuciones.

Tiempos de diagnóstico de la interfaz (una muestra por ancho, sin retraso de red artificial). El marcador de iframe mide carga inicial y acciones previas a la captura; en RPG escritorio incluye las pruebas de respuesta perdida/429. Pet puede seguir recuperando estado después del marcador. **Estos valores no se usan como promesa de tiempo hasta juego interactivo.**

| Ancho | Marcador | Antes ms | Después ms | REST dentro del marcador |
| --- | --- | ---: | ---: | ---: |
| 1649 | login-to-profile | 129.5 | 222.5 | 15 → 10 |
| 1649 | PerriDuelos:iframe-and-initial-actions | 283.0 | 87.9 | 43 → 15 |
| 1649 | PerriPet:iframe-and-initial-actions | 53.5 | 49.0 | 13 → 5 |
| 1649 | PerriCasillas:iframe-and-initial-actions | 373.8 | 217.5 | 338 → 93 |
| 1649 | PerriRPG:iframe-and-initial-actions | 204.8 | 172.5 | 92 → 29 |
| 390 | login-to-profile | 51.8 | 48.0 | 13 → 8 |
| 390 | PerriDuelos:iframe-and-initial-actions | 75.2 | 66.6 | 46 → 15 |
| 390 | PerriPet:iframe-and-initial-actions | 45.8 | 43.0 | 13 → 5 |
| 390 | PerriCasillas:iframe-and-initial-actions | 376.9 | 248.3 | 341 → 95 |
| 390 | PerriRPG:iframe-and-initial-actions | 98.0 | 79.5 | 65 → 16 |
| 360 | login-to-profile | 42.4 | 65.8 | 13 → 8 |
| 360 | PerriDuelos:iframe-and-initial-actions | 65.0 | 61.0 | 43 → 15 |
| 360 | PerriPet:iframe-and-initial-actions | 44.9 | 41.2 | 13 → 5 |
| 360 | PerriCasillas:iframe-and-initial-actions | 362.3 | 266.4 | 341 → 95 |
| 360 | PerriRPG:iframe-and-initial-actions | 87.8 | 77.1 | 50 → 17 |

El primer login de escritorio pasó de aproximadamente 129 a 223 ms en esta ejecución local; algunas otras muestras fluctúan. No se oculta esa regresión de la muestra ni se atribuye su causa sin perfilado suficiente. El número de peticiones sí baja, pero esta muestra no demuestra una mejora del tiempo de login. Los resultados controlados de API y los tiempos HTTP remotos están separados en sus tablas.

## 6. Observabilidad añadida, sin datos privados

Server-Timing muestra app, rest, sql, pool, lock, sqlq y restq únicamente en respuestas autenticadas. En un login rechazado o una sesión anónima solo muestra app, sin contadores que faciliten distinguir cuentas existentes. Se conserva al atravesar el proxy Pages y el proxy local. app es procesamiento de API hasta preparar la respuesta; rest suma esperas HTTP a Supabase; sql suma tiempos de consulta observados por el cliente, **incluidas red y cola del cliente, no exclusivamente ejecución dentro de PostgreSQL**. Las sumas pueden solaparse cuando hay consultas concurrentes. pool incluye espera por conexión y, cuando hay una conexión nueva, su establecimiento/TLS. lock es la espera del bloqueo transaccional. Los contadores no contienen textos SQL, parámetros, nombres, tokens ni credenciales.

El pool PostgreSQL ya se creaba una vez en el arranque y se reutilizaba, con máximo cuatro conexiones; no se ha cambiado su tamaño ni la duración de conexiones sin medidas reales de saturación. Tampoco se ha desactivado TLS ni cambiado DATABASE_SSL_CA. No se preparan índices especulativos: no hay EXPLAIN ni estadísticas de consultas reales que justifiquen una migración, y las claves originales de sesión/usuario ya están indexadas en los esquemas locales recuperados.

Opcionalmente BACKEND_METRICS=true habilita los registros agregados que ya existían, ahora con estos tiempos; no es requisito para publicar. El objetivo es localizar si el tiempo remoto que quede está en REST, SQL, cola/pool o bloqueo, en vez de confundir una prueba rápida local con latencia geográfica real.

## 7. Validaciones y archivos

128 pruebas automatizadas superadas, ninguna fallida ni omitida. Comprueban autenticación antigua, TLS/CA/nombre, revocación, aislamiento A/B, caché e invalidación tras escrituras/triggers, 304 autenticado, integridad de recursos originales, controles de tiempo de transacción, saldos, rollback e idempotencia. Compilación: 481 archivos públicos. Navegación general en seis tamaños, paginación conservando nodos, cambios personales, logout/expiración y nueve comprobaciones de arranque. Los cuatro juegos se abren en las tres resoluciones locales; sin errores JavaScript, recursos ausentes ni fallos API inesperados. Capturas revisadas, sin rediseño.

Archivos de producción modificados: backend/app.mjs, backend/repository.mjs, backend/games.mjs, backend/game-transport.cjs, backend/metrics.mjs, backend/site.mjs, src/main.js, src/game-bridge.js, src/services/api-client.js, src/services/live-ui.js, functions/api/[[path]].js, functions/_middleware.js y dev-server.mjs. Pruebas: tests/backend.test.js, tests/games.test.js y nuevo tests/performance.test.js. Herramientas de comparación: tools/benchmark-performance.mjs, tools/benchmark-api-performance.mjs y tools/measure-public-performance.mjs; se amplían tools/verify-production-local.mjs y tools/verify-integration-final.mjs. Los JSON de este informe son las mediciones originales, no números estimados de producción.

## 8. Única intervención pendiente: publicar y comprobar el rendimiento real

1. En GitHub Desktop revisar Changes de Perrisushi-shop y hacer Commit y Push origin cuando el propietario apruebe el conjunto. No hay migraciones, índices, paquetes nuevos ni variables obligatorias nuevas para esta optimización. Conservar todas las variables privadas, incluido DATABASE_SSL_CA y la configuración de despliegue actual.
2. Tras terminar el despliegue, avisar para repetir las mediciones públicas y contrastar compresión/ETag y Server-Timing. Los resultados de «producción después» están pendientes; el agente no publica automáticamente.
3. Para medir perfil, usuarios, inventario, tienda y apertura real de juegos hace falta la sesión del propietario en Chrome con autorización explícita y una herramienta que pueda verificar su URL. Sin ese acceso no se dan por medidas esas pantallas en producción. Si vuelve a fallar el control, se puede obtener un resumen de tiempos sin cookies ni cuerpos desde DevTools; no compartir HAR completo con credenciales.
4. Abrir juegos originales puede inicializar/guardar datos aunque no se compre nada. Medir acciones o persistencia reales requiere una cuenta de prueba autorizada y permiso específico para sus cambios/gastos; no se han ejecutado sobre usuarios reales. No confirmar premios o saldos antes de su respuesta del servidor.

La sensación de fluidez comparable a la web antigua y la eliminación de esperas de varios segundos permanecen pendientes de esa comparación autenticada posterior. No se afirma una mejora porcentual de producción a partir del laboratorio.
