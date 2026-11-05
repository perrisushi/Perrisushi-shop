# Ajustes locales de latencia de PERRILAND

5 de noviembre de 2026. Sin commit, push, despliegue ni SQL remoto.

El usuario informa de retraso constante al mover y de parones en producción. La revisión del código identifica esperas evitables; no se ha medido la red ni la base de datos de producción.

Cambios:
- El checkpoint periódico sin eventos económicos ni acciones administrativas pasa de nueve consultas consecutivas a un UPDATE atómico. Conserva revisión optimista, ID de commit y repetición sin cambiar estado/revisión/fecha. El lease existente excluye otras instancias; la sala sigue serializando sus operaciones. No lee ni escribe inventarios.
- La lectura de acceso pasa de siete consultas a tres en el fixture con moderación: comprobación de esquema, lectura conjunta de sesión/cuenta/rol/control/saldo/perfil y comprobación de sanciones. No cachea identidad, roles ni disponibilidad. La implementación de moderación en producción puede realizar consultas adicionales propias.
- La interpolación visual usa 50 ms en PERRILAND frente a los 100 anteriores. No modifica la física ni anticipa posiciones o saldos. Un búfer menor puede hacer más visible el jitter en conexiones irregulares.
- Un ping/pong limitado por el rate limit existente muestra el RTT del WebSocket en ms. Se responde fuera de la cola de simulación para distinguir red de espera en base de datos. No mide la latencia de PostgreSQL ni el tiempo completo de respuesta a una tecla.

Validación:

```powershell
node --test tests/perriland-latency.test.js tests/perriland-migration.test.js tests/perriland.test.js tests/perriland-gateway.test.js
npm run build
```

57/57 pruebas correctas en PostgreSQL local PGlite y HTTP/WebSocket loopback. Build correcto: 561 archivos públicos. Las pruebas nuevas comprueban número de consultas, sesión revocada, sanciones, cambio de rol, mantenimiento, repetición de commit, conflicto de revisión, preservación de inventarios, transacción económica, ping con cola ocupada y reloj visual acotado/monótono.

Límites de esta primera revisión (sustituida por la actualización siguiente): los guardados aún detenían el tick mientras esperaban PostgreSQL. El movimiento sigue siendo autoritativo en servidor, sin predicción local; reducir 50 ms de búfer no elimina el RTT de Internet. Si persiste el retraso tras subir los cambios, comprobar el indicador de ms, la región de Railway respecto a los jugadores y la cercanía entre Railway y PostgreSQL. No se garantiza la resolución total del lag sin medir producción. No hace falta volver a ejecutar la migración SQL.


## Actualización: quitar PostgreSQL de la cola de movimiento

El usuario informa de unos 172 ms de RTT, órdenes demoradas unos dos segundos y una congelación de unos tres segundos al recoger cada moneda. El RTT indicado no mide PostgreSQL. Se identificó en el código que advance esperaba flush y que join y command administrativo retenían la misma cola de física durante consultas/guardados.

La simulación de producción ahora inicia guardados sin esperarlos en el tick. Solo hay un lote en curso; los eventos nuevos se acumulan para el siguiente, con captura inmutable del estado correspondiente. Se conserva el orden de persistencia y la transacción existente de dinero, recibo, ledger y checkpoint. Las lecturas de permisos admin y la espera del guardado al entrar tampoco retienen la cola de movimiento. Las pruebas manuales de advance pueden esperar explícitamente la persistencia para mantener una barrera determinista.

El saldo transmitido procede de confirmedBalances, nunca del contador provisional del motor. Se ocultan popups monetarios de actores con eventos sin confirmar. Un resultado tardío de acceso no pisa un saldo más reciente gracias al contador de versiones incrementado al iniciar y finalizar cada guardado. Una sesión revocada se vuelve a comprobar en la transacción; si falla el guardado, se detiene la sala y se cierran conexiones. El cierre espera los lotes pendientes y libera el lease incluso si falla la última escritura.

Prueba reproducible nueva: tests/perriland-persistence.test.js. Se añade una espera real artificial de 3000 ms al guardado de una moneda recogida por el motor, con el temporizador de producción activo. Mientras tanto se comprueba que las órdenes responden antes de 300 ms en el entorno de prueba, la física avanza, siguen llegando snapshots y los PC no se publican hasta confirmar. Se prueban además eventos acumulados sin solapamiento ni duplicados, entrada/guardado periódico/permisos admin lentos, revocación, rollback y cierre/reinicio. Las siete pruebas nuevas pasan localmente.

No se ha medido esta versión en Railway. El movimiento todavía depende del viaje de red al servidor; 172 ms de RTT y el búfer visual siguen existiendo. El saldo de una moneda puede tardar en confirmarse con PostgreSQL lento, pero esa espera ya no debe congelar el movimiento. No se necesita otra migración SQL. Cambios de esta actualización: backend/perriland/room.mjs, tests/perriland-persistence.test.js y este informe.

Validación final de la actualización: npm test, **425/425 correctas**, sin omisiones (incluye las siete pruebas nuevas de persistencia lenta). npm run build correcto, 561 archivos públicos. No se ejecutó SQL remoto ni se hizo commit, push o despliegue.


## Respuesta local a las teclas y confirmación del servidor

El usuario confirma 172 ms de RTT y retraso perceptible incluso tras quitar las esperas de persistencia. Esos 172 ms sí se sienten si el personaje espera una respuesta a cada tecla; no demuestran por sí solos el origen de pausas de varios segundos.

Se añade predicción exclusivamente visual para el personaje propio usando un bundle acotado de la misma física pura (motor, terreno, equipamiento físico y propulsor). No incluye sala, persistencia, sesiones, cuentas, transporte ni economía. Se genera en cada build mediante scripts/perriland-prediction.mjs. Las pruebas comparan coordenadas y velocidades con el motor del servidor para caminar, frenar, saltar, embestir y volar.

Cada snapshot confirma inputAck por conexión y aporta el cuerpo propio empaquetado para reconciliar. La predicción descarta órdenes confirmadas, reaplica las pendientes, corrige su posición con la autoridad del servidor y solo reemplaza campos visuales permitidos; conserva los PC confirmados y todos los demás jugadores. Se limita el horizonte a 250 ms al reconciliar y se detiene la extrapolación tras 150 ms sin otro snapshot; a los 500 ms usa directamente el estado recibido. Cola máxima de 64 órdenes; como máximo doce cuerpos cercanos para la física visual. Pausa, muerte, otra pestaña controladora, agarres, reconexión y errores desactivan o reinician la predicción. Agarrar/subir e impactos complejos siguen esperando al servidor; pueden producir correcciones visuales.

Además, el reloj de interpolación de la sala queda limitado a 150 ms detrás del último estado recibido para evitar acumular segundos por deriva de su reloj. Esto no limita ni oculta el tiempo de red o del servidor: limita únicamente la espera añadida al dibujar snapshots ya recibidos.

El encabezado muestra Red (ping/pong) y Control (tiempo entre una orden local y el snapshot que confirma haberla aplicado). El snapshot también incluye inputWaitMs, la espera en la cola del servidor. Esto permite distinguir red, cola y dibujo si el síntoma continúa. No requiere cambios de configuración ni más SQL. Deben desplegarse juntos frontend y backend para recibir confirmaciones compatibles.

Pruebas nuevas: tests/perriland-prediction.test.js (nueve casos), más un caso de confirmación por WebSocket en tests/perriland-gateway.test.js. Con 172 ms simulados el personaje empieza a moverse en el siguiente frame, antes de confirmación; se comprueba que no altera posiciones reales ni PC. Prueba de navegador local con la cuenta ficticia Alpha: carga sin errores, salto mediante el botón visible y confirmación en encabezado (Red 1 ms / Control 21 ms, solo loopback). No se ha medido el resultado en producción; el intento de inspeccionar la ventana real no permitió observarla porque estaba minimizada.

Validación de esta fase: batería completa npm test, 434/434 correctas; tras separar el historial de diagnóstico (hasta 10 s/128 órdenes) de la ventana corta de predicción, 21/21 pruebas afectadas correctas. Build final correcto, 563 archivos públicos. Servidor de prueba local detenido. No hubo SQL remoto, commit, push ni despliegue.


## Modo ventana frente a pantalla completa

El usuario informa de mejora tras cambiar la región, pero de lag en ventana que no aparece en pantalla completa. La presentación normal colocaba el iframe bajo #design-viewport (transformación CSS de toda la interfaz) y un backdrop-filter blur. Se cambia exclusivamente la apertura de PERRILAND en PC: su overlay se mueve al body, utiliza medidas del viewport nativo y no aplica desenfoque. Continúa siendo una ventana con sus botones; no se fuerza fullscreen. Al cerrar, el overlay vuelve a su posición original y se retira la clase específica. Los demás juegos usan el comportamiento anterior por defecto; móvil mantiene su presentación inmersiva existente.

Archivos: src/main.js (opción solo para game:PerriLand), src/game-window.js (portal opcional y limpieza), src/global-scale.css (reglas solo bajo body.perriland-windowed), tests/game-view.test.js (ciclo de apertura/fullscreen/cierre y restauración), este informe.

Validación: 14/14 pruebas afectadas correctas y npm run build correcto (563 archivos públicos). Navegador local con Alpha: abrir desde Minijuegos, iframe fuera del contenedor escalado, backdrop-filter none, salto (Control 37 ms en loopback), fullscreen de tarjeta y vuelta a ventana, cierre que restaura el portal y reapertura; sin errores de consola. No se ha comparado FPS en la máquina real del usuario ni verificado producción, por lo que el efecto sobre su lag queda por comprobar. Sin SQL remoto, commit, push ni despliegue.
