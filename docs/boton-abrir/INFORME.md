# Botón de apertura: visibilidad y diagnóstico

## Confirmado con la captura de producción

La respuesta autenticada incluye `canOpenContainers: false`. El frontend publicado usaba ese indicador global como condición para generar el botón: desaparecía sin explicar por qué. Esa respuesta no incluía un código que permitiese distinguir el origen del bloqueo. No se conoce todavía la causa concreta que hace que el backend de producción devuelva false.

La comprobación pública de direcciones confirmó que `https://perrisushi.com/` redirige a `https://www.perrisushi.com/`, mientras la ruta `/api/inventory` sin www no hace esa redirección. El diagnóstico debe consultarse en el mismo dominio que la sesión: `https://www.perrisushi.com/api/inventory`. No se ha modificado el dominio de cookies ni las reglas de autenticación.

## Cambio integrado

El botón real Abrir se muestra para los seis tipos de contenedores implementados cuando tienen unidades, así como para consultar aperturas pendientes. No depende de un indicador global que pueda fallar o no existir. Al pulsarlo se sigue llamando al endpoint autenticado existente.

No se ha alterado ninguna validación de apertura: el servidor continúa exigiendo sesión, CSRF, conexión configurada, propiedad, consistencia del inventario, transacción y recibo idempotente. Si rechaza una apertura, la ficha muestra un error comprensible y no presenta recompensas inexistentes ni descuenta objetos.

La API autenticada incorpora `containerOpeningReason`: ready, games_disabled, database_not_configured, database_project_mismatch, original_backend_missing, session_not_shared, catalog_unavailable, inventory_mismatch, storage_permissions, storage_schema_missing, database_credentials o database_unavailable. Son códigos de diagnóstico, no textos añadidos a las pantallas de usuarios. Los registros internos tampoco incluyen contraseñas, tokens ni URLs privadas.

## Validación

- 142 pruebas superadas; compilación correcta de 485 archivos públicos.
- Comprobador de navegador: nueve escenarios, sin errores JavaScript. Incluye las seis resoluciones de PC/móvil, cuentas antiguas y seis tipos de contenedores, recuperación de respuestas perdidas, un indicador false que no oculta el botón y una apertura realmente rechazada por discrepancia en PostgreSQL local. Se ha comprobado que el rechazo conserva exactamente el inventario y muestra el mensaje correspondiente.
- El comprobador aísla cada resolución en su propia instancia de backend para no acumular artificialmente toda la batería sobre la cuota por minuto de una cuenta. Las cuotas de producción no se han aumentado ni desactivado.
- Regresiones HTTP y de disponibilidad distinguen los códigos de bloqueo y comprueban que no se exponen detalles privados.

## Archivos y publicación manual

Modificados: `src/main.js`, `backend/app.mjs`, `backend/games.mjs`, `tests/backend.test.js`, `tests/games.test.js` y `tools/verify-inventory-production.mjs`, además de este informe y las evidencias.

Los cambios están guardados en el repositorio local y todavía no se han publicado. El propietario debe revisar los archivos en GitHub Desktop, hacer Commit en su rama habitual y Push origin. Se debe desplegar tanto el frontend como el backend actuales mediante su configuración existente; no basta con actualizar solo la interfaz.

Después del despliegue, consultar `https://www.perrisushi.com/api/inventory` con la sesión de la web permitirá leer `containerOpeningReason` si continúa el bloqueo. Sin ese código o registros autorizados no se declara identificado ni resuelto el bloqueo específico de producción. No se ha realizado ninguna apertura real ni accedido a Supabase o Railway. No hay cambios de SQL, variables privadas, diseño, cuentas o minijuegos. Sin Commit ni Push automáticos.
