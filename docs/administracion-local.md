# Administración de PerriWeb: implementación local

El diagnóstico confirmado por el propietario indica que Perrisushi ya tiene shop_access.is_admin=true y que es la única cuenta administradora. Esta implementación utiliza ese permiso existente. No lo vuelve a asignar, no añade UUID, no crea usuarios y no necesita ejecutar ninguna migración SQL.

## Funciones implementadas

- Reconocimiento del permiso después de validar la cookie de sesión. La interfaz no contiene ninguna excepción por el texto Perrisushi.
- Botón Administrar dentro de Mi perfil, Usuarios, Inventario, PerriTienda y Sorteos, visible únicamente cuando el servidor reconoce el rol.
- Mi perfil: avisos individuales o generales y consulta de registros administrativos.
- Usuarios: búsqueda y consulta de cuentas, PC, Gemas y estado; suspensión/reactivación de cuentas no administradoras y revocación de sus sesiones anteriores.
- Inventario: consulta de contadores y corrección de recursos permitidos, incluyendo PC y Gemas. Se exige cantidad anterior y motivo; un cambio concurrente cancela la corrección. Las modificaciones de PC actualizan también el listado público.
- PerriTienda: consulta del catálogo de Perrilogos existente. No se presenta como catálogo de productos a la venta.
- Sorteos: consulta agregada de boletos registrados y últimas compras existentes. No crea eventos ni decide resultados.
- Registro de cada modificación, actor, motivo, destinatario y antes/después en shop_operations. Avisos registrados con audiencia y cantidad. Se reutiliza el almacenamiento actual.
- Identificador de operación y transacción para impedir cambios/avisos duplicados. Si se pierde la respuesta, la interfaz conserva la operación y permite repetir exactamente la misma petición.

## Seguridad

Cada ruta administrativa exige sesión autenticada y consulta fresca de shop_access.is_admin en servidor. El servicio SQL vuelve a verificar el token, nick vinculado a esa sesión, vigencia, cuentas activas y rol. En escrituras bloquea las filas de identidad y utiliza la misma exclusión transaccional compartida con economía y juegos.

Se exige Origin, Content-Type y CSRF existentes para modificar datos. Se rechazan roles o actores enviados por el navegador. No hay operaciones para cambiar nicks, contraseñas, correos, roles o vinculaciones Google, ni para crear cuentas. No se exponen hashes, tokens ni claves Random Key. No se puede suspender una cuenta administradora.

No se ha encontrado un endpoint para cambiar nick en el backend actual. Las funciones administrativas heredadas del archivo de minijuegos siguen fuera de la lista pública de acciones permitidas; no se han habilitado como atajo. Un cambio de nick manual desde el propietario de la base queda fuera del alcance de la aplicación y no se ha probado ni ejecutado.

Los fallos de permisos o RLS que puedan ocultar filas cancelan la operación. Los errores internos solo registran códigos de fallo permitidos, sin cadenas de conexión ni cuerpos de petición. Las herramientas no permiten editar ni borrar sus registros de operaciones.

## Pendiente, sin controles que aparenten funcionar

- Gestión de mantenimiento: falta definir e integrar su alcance sobre la web y los accesos ya iniciados.
- Alta/edición/ocultación de productos y precios: PerriTienda todavía no tiene un catálogo de productos persistente y administrable. El catálogo de Perrilogos no se reutiliza como tabla de precios.
- Crear/administrar eventos de sorteo, inscripciones y resultados: no existe un modelo completo de eventos expuesto por el backend actual.
- Corrección de cofres, boletos y Random Key: tienen registros auxiliares de emisión, consumo o caducidad; cambiar su contador aislado produciría inconsistencias. Se permite consultarlos, no corregirlos de esa forma.
- No se ha verificado ninguna operación contra Supabase real ni se han realizado pruebas OAuth reales en esta tarea.

## Archivos principales

- backend/administration.mjs: consultas, permisos, transacciones y operaciones autorizadas.
- backend/app.mjs, repository.mjs y server.mjs: integración con sesión, rol existente y conexión del servidor.
- src/services/admin-ui.js y src/admin.css: interfaz integrada con los marcos actuales.
- src/main.js, services/api-client.js, index.html, backend/public-paths.mjs y scripts/build.mjs: acceso y empaquetado de recursos.
- tests/administration.test.js y tests/helpers/admin-fixture.mjs: PostgreSQL local y HTTP.
- tools/verify-admin-local.mjs: navegador Edge con datos ficticios en memoria, sin servicios externos.

La consulta antigua sql/administracion/01-verificar-perrisushi-solo-lectura.sql ya no es un requisito para continuar. No ejecuta asignaciones y no hace falta repetirla.

## Pruebas

Las capturas de docs/admin-capturas proceden exclusivamente de cuentas simuladas en PostgreSQL local. La variante perrisushi que aparece en ellas se incluye para probar que un nombre parecido no concede privilegios; no es un diagnóstico de cuentas reales.

Comprobaciones visuales en Edge: PC 1366×768 y móviles emulados 390×844 y 320×740; las cinco secciones, corrección de Gemas desde formulario, aviso individual, registros, teclado y Escape. No se ha probado un teléfono físico.

Resultado final: 252 pruebas automatizadas superadas, 27 comprobaciones agrupadas de navegador superadas, cero errores JavaScript y cero peticiones externas; npm run build correcto. La concurrencia local se prueba con un pool serializado sobre PGlite: no equivale a una prueba de carga con varias conexiones PostgreSQL reales.

Ejecutar npm test para la batería de pruebas y npm run build para preparar dist. El script visual requiere el Playwright de este equipo y Edge, sin instalar dependencias de producción adicionales. Los resultados visuales están en docs/admin-capturas/resultados.json.

No se ha hecho Commit, Push ni despliegue. No se han tocado servicios externos ni datos reales.
