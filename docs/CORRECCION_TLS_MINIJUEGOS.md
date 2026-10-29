# Incidencia de producción: TLS PostgreSQL

## Evidencia real disponible

El propietario ha aportado la respuesta autenticada de `/api/games/context`: available=false, los cuatro juegos a false y reason=database_unavailable. Después ha aportado el código del registro de Railway: SELF_SIGNED_CERT_IN_CHAIN. Esta evidencia sitúa el fallo en la validación de la cadena TLS PostgreSQL. No se ha verificado la cadena concreta del servidor, su configuración privada ni el esquema remoto; el código por sí solo no identifica qué certificado intermedio o raíz falta o qué extremo presenta esa cadena.

Las consultas realizadas por el agente a www.perrisushi.com sin credenciales devolvieron /api/session 200 authenticated=false y /api/games/context 401 session_expired. No equivalen a pruebas autenticadas. El intento de inspeccionar Chrome se detuvo por una restricción de la herramienta al verificar la URL; no se ha accedido a la sesión. No se han modificado servicios ni datos reales.

## Corrección preparada

- Nueva configuración TLS común en backend/database-config.mjs, utilizada por backend/server.mjs, scripts/check-games.mjs y scripts/check-auth.mjs.
- DATABASE_SSL_CA permite cargar la CA PEM del proyecto desde las variables privadas del servicio, incluyendo saltos de línea reales o escapados. El PEM se valida sin imprimirlo.
- Se conservan las autoridades de Node cuando no se configura una CA propia, y los certificados en archivos que ya pudiera indicar la URL. Los parámetros de la cadena no pueden sustituir la CA ni anular rejectUnauthorized=true. La verificación del nombre permanece activa.
- No cambia autenticación, inventarios, economía, interfaces, reglas de juegos ni esquema. No hay SQL que ejecutar.
- Ejemplo de variable en backend/.env.example, regresiones en tests/database-tls.test.js e instrucciones completas en PUBLICAR_PRODUCCION.md.

## Validación y estado

Las pruebas automatizadas verifican las opciones efectivas del cliente pg instalado: CA cargada, validación activa, parámetros de URL que antes podían reemplazar SSL, compatibilidad con rootcert existente, rechazo seguro de PEM inválido y reproducción del diagnóstico SELF_SIGNED_CERT_IN_CHAIN sin filtrar credenciales.

La prueba adicional de TLS utiliza certificados efímeros y un servidor exclusivamente local, fuera de producción: reproduce el rechazo de cadena no confiable, comprueba la conexión con su CA explícita y el rechazo de un nombre de servidor incorrecto. Sus claves de laboratorio no se añaden al repositorio.

Resultados de esta ejecución: **119 pruebas superadas, 0 fallidas, 0 omitidas**; compilación de 481 archivos públicos correcta y git diff --check sin errores. La conexión TLS local sin CA devolvió exactamente SELF_SIGNED_CERT_IN_CHAIN; con CA explícita fue aceptada; con nombre erróneo devolvió ERR_TLS_CERT_ALTNAME_INVALID. Ninguna de estas pruebas acredita el funcionamiento de Supabase real. Los cuatro juegos permanecen **pendientes de verificación en producción** hasta que el propietario configure la CA correcta y publique este conjunto de cambios. Tampoco se han realizado pruebas de persistencia o gastos con cuentas reales.

## Acción manual y verificación posterior

Seguir el apartado «Corrección del error TLS confirmado en producción» de [PUBLICAR_PRODUCCION.md](PUBLICAR_PRODUCCION.md): descargar la CA del proyecto, configurar DATABASE_SSL_CA, realizar Commit y Push desde GitHub Desktop y devolver el diagnóstico autenticado después del despliegue. No se declara la incidencia resuelta antes de esa comprobación. Para abrir los juegos y comprobar progreso, puede ser necesaria autorización adicional: sus pantallas originales pueden inicializar o guardar estado automáticamente aunque no se pulsen acciones de gasto.
