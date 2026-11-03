# Correcciones de rendimiento de Inventario y PerriTienda

Implementación local de las tres correcciones del diagnóstico: conservar instantáneas mientras se revalidan, reutilizar datos con invalidación selectiva y retirar preparación auxiliar de la ruta crítica. No se han ejecutado cambios en Supabase ni migraciones de una base instalada. Los ensayos SQL utilizan únicamente fixtures PGlite desechables.

## Comportamiento final

Después de validar la sesión, la interfaz abre y se precarga Inventario en segundo plano. Perfil ya leía la fila completa: su respuesta ahora incluye inventorySnapshot, sin consultas adicionales, y el cliente la comparte con Inventario. Si la respuesta no contiene esa instantánea, se conserva la lectura independiente como alternativa. Primera visita sin datos: indicador de carga, nunca cantidades inventadas.

Al cerrar/reabrir una sección se conserva su última instantánea de la misma sesión. Si su vigencia ha terminado, se muestra y se actualiza en segundo plano; un fallo temporal no la sustituye por una pantalla vacía. Logout, cambio de cuenta o sanción recibida al revalidar eliminan todos los datos privados. La señal de cambio de identidad entre pestañas solo transporta una invalidación, nunca tokens, nombres o inventarios.

El catálogo y la información personal se guardan en dominios separados. Catálogo: 60 segundos; Inventario: 20 segundos; Perfil/cosméticos: 30 segundos. Se revalida al navegar o volver a una pestaña visible cuando corresponda. Las solicitudes idénticas pendientes se comparten. La información no se persiste en localStorage ni se usa para autorizar acciones.

Una edición administrativa en esta sesión invalida el catálogo y actualiza la sección. Para otros clientes se aplica la caducidad/revalidación; no se añade un sistema de publicación en tiempo real. Si el servidor rechaza precio/versión/disponibilidad antiguos, la interfaz recupera automáticamente el catálogo actualizado. La compra sigue enviando identificador, versión e idempotencia; el servidor consulta su precio, saldo, propiedad, sanciones y disponibilidad reales.

Las respuestas de compras cosméticas permiten aplicar únicamente PC y la nueva propiedad confirmados por el servidor. No se equipa automáticamente el artículo. Equipar usa la composición verificada devuelta por el servidor y no descarga de nuevo el catálogo. Las actualizaciones parciales no prolongan la validez de campos que ya habían caducado. Los identificadores de operación y la lógica económica no cambian.

## Política central de invalidación

| Acción | Datos afectados | Datos conservados |
|---|---|---|
| Leer una notificación | Notificaciones | Inventario, catálogo, perfil, cosméticos |
| Equipar | Perfil/equipamiento y ficha pública | Inventario y catálogo |
| Comprar | Saldo, propiedad, actividad y catálogo si su disponibilidad puede cambiar | Instantáneas anteriores mientras llega la confirmación/revalidación |
| Abrir un cofre/recibir recompensa | Inventario, perfil, cosméticos y registros/notificaciones relacionados | Catálogo general |
| Editar producto | Catálogo y datos administrativos | Inventario y propiedad actuales |
| Emitir aviso | Notificaciones y administración | Economía y catálogo |
| Login/logout/cambio de cuenta | Limpieza privada completa | Ningún dato de la cuenta anterior |

Las versiones por dominio impiden que una respuesta iniciada antes de una mutación vuelva a introducir información obsoleta. Una notificación no cancela una lectura de Inventario que sigue siendo válida. Las transiciones de identidad tienen además una generación global independiente. Se mantiene el borrado completo para operaciones desconocidas como alternativa conservadora.

## Backend y seguridad

El cliente moderno solicita /api/inventory?deferReadiness=1. Esa ruta verifica sesión, jugador/acceso activos y sanciones antes de leer el inventario, pero no espera al catálogo y al historial de cofres. /api/inventory sin ese parámetro conserva su respuesta de preparación para compatibilidad.

La preparación informativa está disponible en /api/inventory/readiness. Comprueba sesión compartida, sanciones, catálogo, esquema, permiso SELECT y RLS. Para esta respuesta solo se necesita disponibilidad: se omite el agregado de recuentos que no se entregaba. El agregado original sigue disponible para los consumidores que solicitan recuentos. La apertura real conserva íntegros sus controles transaccionales, stock, propiedad, permisos e idempotencia. No se modifica el motor de minijuegos ni sus recompensas.

Se instrumentan las consultas de community y moderation mediante el mismo medidor de juegos, con envoltorio idempotente. Así Server-Timing contabiliza esas sentencias y la espera de su pool. Esto corrige el punto ciego demostrado: por ejemplo, la lectura del catálogo registra ahora sus once sentencias, en lugar de cero. No se suprimen sus verificaciones para acelerar el caso frío.

## Pruebas reproducibles

- npm test: 361 pruebas aprobadas, cero fallos. Incluye nueve pruebas nuevas de instantáneas, caducidad, invalidación, compra, carreras, cambio de cuenta, sanciones y preparación de cofres, además de un caso nuevo que distingue carga inicial de catálogo vacío.
- npm run build: 531 archivos públicos, sin cambios de estilos o recursos gráficos.
- verify-perrilogos.mjs: 11 grupos de comprobaciones reales PC/móvil.
- verify-admin-extended.mjs: 16 comprobaciones reales de administración.
- verify-persistent-sessions.mjs: 14 comprobaciones reales de sesiones.

Las expectativas antiguas que exigían invalidación global al equipar o leer notificaciones se actualizan a los dominios solicitados. Las pruebas de aislamiento de identidad, precios del servidor y respuestas anteriores siguen activas y pasan. El caso de catálogo vacío utiliza explícitamente un catálogo cargado sin artículos; sin respuesta todavía se exige Cargando, no Sin artículos.

Ejecutar npm run build, node tools/benchmark-section-backend.mjs y node tools/benchmark-section-performance.mjs. Los bancos utilizan datos ficticios autocontenidos en tests/fixtures/section-performance-payloads.json, el historial local y Edge/Playwright ya instalado en este ordenador. No leen .env, no consultan servicios externos y cierran sus servidores y navegadores al terminar.

La referencia anterior es 8d34ca9e49a045489012c5af1e18d78765e58d63. La comparación de interfaz usa main.js, api-client.js y live-ui.js de esa revisión y la compilación actual. Se inyectan 500 ms en todas las respuestas API y se toman tres muestras por caso a 1366×768. La apertura se mide con performance.now y el primer frame que muestra los datos. Los contextos son nuevos por muestra; los casos de reapertura conservan los datos que cada implementación conserva por diseño.

También se simula la caducidad avanzando Date.now 70 segundos, sin avanzar performance.now ni los temporizadores. El servicio de prueba cambia una cantidad y el precio/versionado de un producto: se mide por separado cuándo aparecen los datos anteriores y cuándo se ve el cambio confirmado. El precio 700/777 de esos ensayos existe únicamente en el simulador, no cambia los precios reales de PerriTienda.

Se prueban además lectura de notificación, compra real del flujo visual contra el simulador, apertura de una bolsa, cambio A/B, login sin caché, rechazo de precio antiguo sin descontar saldo y limpieza de datos entre dos pestañas. Los ensayos de navegador simulan las respuestas de negocio; las verificaciones de seguridad/atomicidad usan también los tests del backend con PostgreSQL local. Ninguno es una prueba de producción.

## Archivos

- src/services/cache-policy.js: dominios e invalidación centralizada.
- src/services/api-client.js: vigencias, instantáneas, deduplicación, invalidación y actualización desde respuestas verificadas.
- src/main.js: precarga, visualización progresiva, conservación al navegar y revalidación tras errores de versión/disponibilidad.
- src/services/live-ui.js: indicador de carga genuina de tienda.
- src/services/admin-ui.js: notifica la acción concreta para refrescar solo lo pertinente.
- backend/app.mjs: instantánea reutilizable de Perfil y lectura rápida/separada de preparación.
- backend/games.mjs: opción exclusivamente de lectura de preparación; sin cambios al motor ni lógica de aperturas.
- backend/metrics.mjs, community.mjs y moderation.mjs: recuento completo de sus consultas, sin cambiar las verificaciones.
- backend/public-paths.mjs y scripts/build.mjs: inclusión del módulo de política en los recursos servidos.
- tests/section-performance.test.js, api-client.test.js, startup-performance.test.js y store-layout.test.js: comprobaciones y contratos actualizados.
- tools/benchmark-section-performance.mjs y benchmark-section-backend.mjs: mediciones reproducibles.

## Límites

Los tiempos pertenecen a un banco local con latencias artificiales. No demuestran una reducción del tiempo real de Railway o Supabase. La primera visita a tienda sin catálogo y un acceso inmediato antes de terminar la precarga siguen esperando sus datos; se muestra carga. Mantener una instantánea no significa que ya haya terminado la revalidación.

No se cambian estilos, escalado, recursos gráficos, Twitch/YouTube, lógica económica, motor de minijuegos, permisos administrativos ni datos de producción. No hay migraciones nuevas. No se han hecho Commit, Push ni despliegues. Frontend y backend deben publicarse juntos cuando se autorice; esta entrega no requiere ejecutar SQL en Supabase.

## Mediciones finales

Edge local, respuestas API simuladas de 500 ms; mediana de tres muestras. Las cifras son tiempo hasta datos visibles, no duración de Supabase.

| Caso | Sección | Antes (ms) | Después (ms) |
|---|---|---:|---:|
| Primera apertura tras precarga | Inventario | 521 | 14 |
| Primera apertura tras precarga | PerriTienda | 520 | 519 |
| Reapertura | Inventario | 25 | 21 |
| Reapertura | PerriTienda | 534 | 8 |
| Caducado: mostrar mientras actualiza | Inventario | 526 | 6 |
| Caducado: mostrar mientras actualiza | PerriTienda | 522 | 9 |
| Después de leer notificación | Inventario | 516 | 8 |
| Después de leer notificación | PerriTienda | 526 | 8 |
| Después de compra confirmada | Inventario | 521 | 11 |
| Después de compra confirmada | PerriTienda | 528 | 10 |
| Después de recompensa confirmada | Inventario | 8 | 8 |
| Después de recompensa confirmada | PerriTienda | 532 | 9 |
| Otra cuenta, precarga terminada | Inventario | 524 | 12 |
| Otra cuenta, precarga terminada | PerriTienda | 533 | 519 |
| Login sin caché: precarga pendiente | Inventario | 528 | 512 |

Los casos de primera apertura tras precarga esperan a que termine el arranque de cada implementación. En el login sin caché se abre Inventario inmediatamente: aún espera unos 500 ms de la precarga pendiente, sin inventar datos. Una primera tienda sin catálogo también necesita su primera respuesta. Cambiar de cuenta descarta deliberadamente el catálogo y los datos anteriores.

Para datos caducados, se observan dos hitos distintos:

| Sección | Instantánea anterior visible después (ms) | Cambio nuevo visible después (ms) |
|---|---:|---:|
| Inventario | 6 | 528 |
| PerriTienda | 9 | 523 |

Las respuestas siguen tardando alrededor de 500 ms en este simulador; la interfaz ya no obliga a esperar para mostrar la instantánea previa. Los registros de recursos en resultados.json separan inicio/fin de peticiones de los hitos de visualización. En el caso de precarga pendiente, las peticiones comenzaron antes de abrir la sección y no aparecen como solicitudes nuevas de esa apertura.

Backend: tres muestras por ruta, PGlite local y 25 ms artificiales por operación REST/sentencia. Se mide el handler anterior en la misma ejecución con las mismas dependencias de seguridad y medición completas; su consulta de Inventario sigue ejecutando el agregado original. No se interpreta esto como rendimiento de la base real.

| Ruta | REST | SQL directa | Mediana local (ms) |
|---|---:|---:|---:|
| /inventory-before | 2 | 8 | 283 |
| /inventory?deferReadiness=1 | 2 | 2 | 122 |
| /inventory/readiness | 1 | 7 | 248 |
| /store | 1 | 11 | 372 |

La ruta rápida pasa de ocho a dos sentencias SQL directas. Cuando Perfil ya aportó la instantánea, ni siquiera necesita esa petición adicional. La preparación conserva siete sentencias fuera de la visualización crítica; las aperturas reales siguen verificadas. El catálogo frío mantiene sus comprobaciones: las ganancias de reapertura provienen de evitar consultas innecesarias, no de eliminar seguridad.

Muestras de interfaz registradas: 90. Errores JavaScript: 0. Peticiones externas: 0. Precio antiguo rechazado sin cobrar y catálogo recargado: aprobado. Cambio de identidad entre dos pestañas: aprobado.

Capturas comparativas: [Inventario antes](before-inventory-first.png), [Inventario después](after-inventory-first.png), [Tienda antes](before-shop-repeat.png), [Tienda después](after-shop-repeat.png). Datos: resultados.json y backend.json.
