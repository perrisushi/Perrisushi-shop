# Validación y archivos — Conexión 02

## Verificado localmente

42/42 pruebas aprobadas con:

`node --test tests/*.test.js tests/revision_sin_brillos.mjs tests/revision-04.mjs tests/validacion-estructural.mjs`

Incluye las pruebas anteriores, 15 del cliente API, 11 del backend HTTP/adaptador/seguridad, 3 de renderizado/escape/conservación y las comprobaciones de las correcciones anteriores. npm test tiene el mismo comando configurado, pero no pudo arrancar en este entorno porque npm no está en PATH. Se usó Node directamente. Las pruebas HTTP locales necesitaron ejecución fuera del aislamiento por EACCES del loopback; las fallas iniciales por permisos se repitieron y pasaron sin conexiones externas.

`node tools/verify-connection-02.mjs`: login y logout completos con cookie/CSRF, Perfil, Usuarios, Inventario, Tienda, Historial, avisos y colección, con datos ficticios locales. Cuatro viewports: 1649×928, 1280×720, 390×844 y 360×800. 45 peticiones API locales en el recorrido completo, cero errores JavaScript, ninguna petición de navegador a Supabase u otro origen. Se comprueban rutas internas inaccesibles y módulos públicos accesibles. Los importes y códigos de las capturas son ficticios de laboratorio.

Se inspeccionaron capturas de PC y móvil, incluido un nombre propio largo que inicialmente se cortaba y ahora se parte en líneas sin desbordar. Se conserva el aspecto, la escala y los recursos, con estados de datos distintos de la maqueta. La función de pantalla Minijuegos y el CSS de escalado PC mantienen su hash anterior; no se tocaron los archivos de los cuatro juegos ni los gráficos originales. No se afirma identidad binaria de las pantallas con maqueta, porque ahora reflejan datos/estados del backend.

Pruebas de aislamiento: sin sesión no se accede a lecturas privadas; no se aceptan nick ajenos como autorización; A no recibe los datos/canjes de B; expiración y desactivación bloquean acceso; logout de A no cierra B. Origin/CSRF inválido impide logout. Se comprueban intentos limitados, cookie Secure para origen HTTPS, JSON/tamaños acotados y errores sin detalles internos. Pruebas del adaptador constatan que las lecturas producen exclusivamente GET, sin pool global de claves ni tablas de minijuegos.

Los perfiles ausentes devuelven null sin crear filas. El backend no produce defaults/upserts. Las acciones económicas y de avatar/avisos permanecen bloqueadas incluso con sesión válida. Persistencia v2 solo se ensayó con transporte falso: no se insertó ni borró ninguna sesión remota.

## Archivos nuevos

- backend/app.mjs: API, autorización, sesiones y DTO.
- backend/repository.mjs: adaptador PostgREST con lista cerrada de lecturas y escrituras de sesión bajo aprobación.
- backend/security.mjs, backend/logo-assets.mjs y backend/metrics.mjs: criptografía/rate limit, recursos locales y métricas por petición.
- backend/server.mjs y backend/.env.example: arranque privado y configuración vacía.
- src/services/live-ui.js: renderizadores conectados y escape de datos.
- tests/backend.test.js, tests/frontend-contract.test.js: pruebas nuevas.
- tools/verify-connection-02.mjs: prueba integral offline con fixtures solo locales, no accesibles desde HTTP.
- Documentación, resultados y capturas en docs/conexion-02.

## Archivos modificados

- src/services/api-client.js y tests/api-client.test.js: CSRF en memoria y errores públicos del backend.
- src/main.js: sesión, acceso tradicional, lecturas a demanda, paginación, cierre de sesión y limpieza de datos privados. No conserva respuestas de una cuenta anterior tras cambiar de sesión.
- src/preview-pages.js: retira los datos demo y delega a los renderizadores conectados; mantiene navegación de pestañas.
- src/styles.css: únicamente ajuste de nombres largos del perfil; resto de layout preservado.
- src/preview-pages.css: soporte acotado a etiquetas de objetos y códigos largos.
- index.html: CSP permite solo comunicación del mismo origen.
- dev-server.mjs: proxy API loopback y módulos públicos exactos, sin publicar backend o configuración.
- package.json: comando backend y batería completa en test, sin paquetes adicionales.
- tests/assets.test.js, tests/correcciones-01.test.js y tests/revision-04.mjs: actualizados al contrato de la nueva fase (CSP same-origin, economía desactivada y ausencia de demos), manteniendo sus objetivos y comprobaciones.
- .gitignore y README.md: secretos/copias locales ignorados y ejecución actual documentada.

No había repositorio Git inicializado; se conservó copia de los archivos principales originales en .conexion-02/backup. El ZIP de instrucciones y los CSV de metadatos se extrajeron a .conexion-02, que no está expuesto por HTTP y queda ignorado por Git.

## Lo que NO se ha validado aún

No hay backend/.env ni cuenta autorizada para verificar filas reales. No se ha conectado con Supabase, no se ejecutó SQL, no se modificaron usuarios/saldos/progreso y no se ha desplegado. La compatibilidad con SHA-256 y los nombres/FK se basan en las instrucciones y metadatos adjuntos; el funcionamiento real del esquema, RLS, restricciones operativas, formatos JSON y lógica heredada requiere la prueba posterior. Ver ESTADO_Y_EJECUCION.md para pasos y limitaciones.
