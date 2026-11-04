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

Límites: los guardados siguen esperando confirmación de PostgreSQL. Monedas, caídas y acciones administrativas conservan su transacción completa y pueden causar parones si PostgreSQL está lejos o lento. El movimiento sigue siendo autoritativo en servidor, sin predicción local; reducir 50 ms de búfer no elimina el RTT de Internet. Si persiste el retraso tras subir los cambios, comprobar el indicador de ms, la región de Railway respecto a los jugadores y la cercanía entre Railway y PostgreSQL. No se garantiza la resolución total del lag sin medir producción. No hace falta volver a ejecutar la migración SQL.
