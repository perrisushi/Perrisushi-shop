# Integración de los cuatro minijuegos — 29/10/2026

## Resultado y alcance

Los cuatro juegos originales quedan integrados y comprobados localmente: PerriDuelos, PerriPet, PerriCasillas y PerriRPG. Las tarjetas abren sus interfaces originales dentro de la web y permiten regresar al menú. No se han cambiado sus mecánicas, gráficos ni el diseño general. Los 389 recursos del manifiesto y las reglas del backend original conservan las comprobaciones de integridad.

No se ha accedido a GitHub, Railway ni Supabase. No se ha publicado ni gastado recursos de usuarios reales. No se declara que los juegos estén operativos en producción: faltan la configuración y las comprobaciones del propietario con la base real.

## Fallos corregidos

El servidor exigía PW2_GAMES_ENABLED=true y lo consideraba desactivado si faltaba esa variable, incluso teniendo DATABASE_URL. Ahora el modo automático utiliza la conexión privada existente; false conserva el apagado explícito. Esto demuestra el bloqueo en el código, pero no prueba qué variables tiene actualmente Railway.

Antes, cualquier fallo de PostgreSQL acababa reducido a indisponibilidad genérica. Ahora se distinguen configuración, proyecto diferente, sesión no compartida, conexión, tablas y permisos. Los diagnósticos internos utilizan códigos seguros: no registran identidades, contraseñas, hashes, tokens ni cadenas de conexión. La disponibilidad se comprueba por juego, por lo que una dependencia específica ausente no desactiva los demás si sus dependencias comunes están disponibles.

Se revalida la sesión compartida antes de ejecutar acciones y antes de devolver operaciones guardadas. El adaptador impide que el ensurePlayer antiguo cree o reactive cuentas y evita prolongar la sesión tradicional al jugar. El puente conserva la identidad del servidor, CSRF e idempotencia, reconoce la caducidad y admite Request y los cuerpos Blob de los autoguardados originales. Los envíos pequeños al salir pueden utilizar keepalive; los grandes conservan fetch normal por el límite del navegador. No se garantiza un último guardado si el navegador termina antes de completarlo.

## Mecánicas y persistencia conservadas

- **PerriDuelos:** selección de rival y reglas originales de ataque, equipo, tickets y premio. No se añade multijugador en tiempo real. El destino firmado se vincula al atacante; no permite gastar desde otra identidad.
- **PerriPet:** mascota, evolución, alimentos, granja, encuentros y autoguardado originales. Se comprueba la recuperación del formato antiguo de shop_operations y su almacenamiento persistente original, con revisión de servidor para rechazar guardados obsoletos.
- **PerriCasillas:** tablero, casillas abiertas, premios, coste y límites temporales originales; se recupera el mismo tablero al volver a abrir.
- **PerriRPG:** catálogo, equipo, selección, compras, consumos, combate y recompensa original del jefe. Se conserva la eliminación deliberada de combate al abandonar que ya establecía el juego; no se convierte en una regla nueva de reanudación.

La cookie de la web identifica una única sesión existente en shop_sessions. Todos utilizan los inventarios originales y sus tablas específicas, sin cuentas paralelas ni saldos autoritativos en el navegador. La transacción PostgreSQL agrupa saldo, consumo, premio y recibo; los reintentos conservan el identificador de operación. Pet y RPG comparten únicamente los objetos que relaciona el código original. Se conserva el bloqueo transaccional común con la economía de tienda; no se cambia su activación.

## Pruebas realizadas

- Suite completa del proyecto: 115 pruebas superadas; ninguna fallida ni omitida. Incluye 18 pruebas de juegos con PostgreSQL embebido PGlite y las implementaciones originales.
- Compatibilidad de sesiones, aislamiento A/B, revocación, cuenta desactivada sin reactivación, recuperación de Pet antiguo tras renovar sesión, recuperación de tablero/equipo, saldos e inventario compartidos Pet/RPG, rechazo de guardado obsoleto, rollback y repetición sin duplicar costes/premios.
- Jefe RPG: resultado falsificado sin consumo rechazado; consumo original verificado, entrega de una Pinza Real y un solo asiento de recompensa al repetir la petición, incluso usando otro identificador.
- Compilación: 481 archivos públicos, sin publicar backend, secretos o pruebas.
- Navegador Edge local con API real y PostgreSQL en memoria: los cuatro juegos a 1649×928, 390×844 y 360×800; apertura/cierre, jugadas de Casillas, compra RPG con respuesta perdida y posterior 429, mismo identificador y un solo consumo. Sin errores JavaScript, 404 de recursos ni errores API inesperados. Capturas revisadas visualmente.
- Regresión de navegación general: seis tamaños PC/móvil, sin errores; arranque desde el mismo comando de producción con nueve comprobaciones superadas, sin solicitudes a Supabase.
- El comprobador check:games se prueba en una transacción de solo lectura local, sin crear partidas ni operaciones.

PGlite serializa las conexiones locales: estas pruebas no demuestran comportamiento de réplicas remotas, sus permisos, triggers ni todos los posibles resultados aleatorios. Tampoco constituyen una auditoría antitrampas completa del código original. No se ha ejecutado check:games ni check:live contra servicios externos.

## Archivos cambiados

backend/app.mjs, backend/server.mjs, backend/games.mjs, backend/game-transport.cjs, backend/game-readiness.mjs (nuevo), backend/.env.example, src/main.js, src/game-bridge.js, scripts/check-games.mjs (nuevo), tests/games.test.js, package.json, README.md y los dos documentos de publicación/integración. Los archivos de juegos originales no se han modificado.

## Configuración y publicación manual: instrucciones en un único lugar

Seguir [PUBLICAR_PRODUCCION.md](PUBLICAR_PRODUCCION.md): revisar DATABASE_URL privada del mismo proyecto, el valor de PW2_GAMES_ENABLED, ejecutar check:games de solo lectura y publicar desde el repositorio actual mediante GitHub Desktop. No hay una migración nueva requerida por este cambio. No ejecutar los fixtures en producción. La compatibilidad del esquema y el funcionamiento con datos auténticos quedan pendientes hasta esas comprobaciones; no se ocultan como pruebas superadas.

Las capturas y JSON de esta ejecución se archivan localmente en la carpeta temporal perriweb-games-final/qa; no se sustituyen las capturas históricas del repositorio. No se ha realizado Commit ni Push.
