# Botón de apertura y cierre desde PERRILAND

5 de noviembre de 2026. Preparado en local, sin commit/push/despliegue ni SQL remoto.

Dentro del juego, al inicio de la barra administrativa, Perrisushi ve el estado Abierta/Cerrada al público y el botón Abrir PERRILAND/Cerrar PERRILAND. Los usuarios normales no ven el botón. Perrisushi conserva el acceso administrativo con la sala cerrada y puede reabrirla allí mismo.

El botón usa GET /api/admin/controls y POST /api/admin/execute existentes, con CSRF, UUID de operación, versión esperada y alcance fijo PerriLand. El servidor existente exige sesión activa, is_admin=true y nick exacto Perrisushi para ese control. La pulsación establece un estado explícito; no se añade otra bandera de disponibilidad. Cerrar usa active=true y mensaje PERRILAND está cerrado temporalmente.; abrir usa active=false y limpia el mensaje. Se conserva la auditoría administrativa de actor, motivo, antes/después y operación.

Mientras guarda, el botón se deshabilita. Ante conflicto no sobrescribe el cambio ajeno. Si se pierde la respuesta, consulta la disponibilidad real antes de permitir otra pulsación. El cambio notifica al contenedor para refrescar comunidad y controles. Los usuarios normales conectados se cierran mediante la revalidación existente (aproximadamente un segundo, más la latencia de comprobación); Perrisushi sigue dentro. No se reinicia la sala ni se modifican saldos.

No hay cambios en los endpoints ni permisos de producción, ni migraciones nuevas. Los dos helpers de pruebas locales ahora incluyen los catálogos vacíos requeridos por la comprobación administrativa y conectan createAdministration real al servidor de pruebas.

Validación: node --test tests/perriland*.test.js, 84/84 correctas, sin omisiones. Nueve comprobaciones nuevas del botón incluyen usuario normal/otro admin/permisos revocados, CSRF y Origin, apertura/cierre con WebSockets, auditoría sin tocar saldos, conflicto de versión, rollback por fallo de auditoría, doble pulsación y respuesta perdida tras COMMIT. npm run build correcto: 564 archivos públicos.

Prueba visual local en navegador: inicio con cuenta ficticia Perrisushi, entrada desde Minijuegos con sala cerrada, abrir, comprobar Abierta al público/Cerrar PERRILAND, cerrar, comprobar Cerrada al público/Abrir PERRILAND y permanencia del administrador; sin errores de consola. No se han pulsado botones ni modificado estados de producción.
