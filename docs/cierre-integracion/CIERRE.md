# Cierre de integración: estado y publicación en el servicio existente

**Estado histórico.** La economía y los juegos se han implementado posteriormente. Consultar únicamente docs/PUBLICAR_PRODUCCION.md para las instrucciones actuales.

Este documento sustituye las instrucciones anteriores que proponían crear otro servicio de prueba. No se ha publicado ni cambiado ningún dominio. El propietario se encarga de Railway y GitHub; no se ha abierto ni modificado su configuración privada.

## Integración selectiva

Se comparó PerriWeb_2_0_Cierre_Integracion_Codex.zip con la carpeta actual. Sus 77 recursos gráficos/sonido coinciden con los existentes: no se sustituyeron. El backend CommonJS y src/live.js del ZIP son anteriores y pierden protecciones del backend actual: utilizan lecturas legacy que pueden inicializar datos y permiten habilitar economía no transaccional con una variable. No se han incorporado ni expuesto. Se conserva el backend reciente, la UI conectada, las cookies/CSRF, el catálogo poseído, la paginación, los iconos, la configuración Railway y todas las mejoras anteriores.

La copia extraída y la copia previa de los archivos modificados están en .cierre-integracion, excluida de Git y de la distribución pública. No se ha incorporado un segundo runtime ni un segundo cliente de API.

## Qué se ha comprobado y qué no

Resultados locales: `npm test` 54/54; pruebas del candidato en su propia carpeta 29/29; revisión de navegador 6 tamaños con 91 peticiones locales y 0 errores JavaScript; build 87 archivos públicos; comprobación del arranque de `npm start` equivalente y 9 rutas/cabeceras correctas. El servidor temporal se cerró. Se conservan las capturas y browser-results.json en docs/integracion-final. Las nuevas comprobaciones de arranque y auditoría están en esta carpeta. Ninguno de estos resultados se presenta como una prueba con datos reales.

Acceso tradicional, lecturas personales, usuarios públicos, inventario, álbum, marcado de notificaciones y cierre de sesión: implementados y cubiertos por pruebas locales. Las pruebas no acreditan compatibilidad real de una cuenta concreta hasta ejecutarlas con la configuración del servicio.

No existe backend/.env ni configuración Railway local, ni variables SUPABASE en esta sesión. La carpeta F:\Perriweb 2.0 todavía no pertenece a un repositorio Git. No se dispone del nombre/checkout del repositorio conectado al servicio actual. No se han leído secretos ni probado cuentas reales. El intento de comprobación real se detuvo antes de consultar: faltan las variables de Railway y una cuenta propia autorizada.

**Los cuatro minijuegos no están conectados en esta entrega.** Sus accesos siguen siendo visuales y su implementación no forma parte del paquete. No se ha tocado su código. Para sustituir la web actual sin perderlos hay que conservar sus recursos y su enrutamiento en el repositorio/servidor existentes y comprobar sus accesos. No basta con copiar la nueva interfaz encima y afirmar que funcionan.

## Economía: bloqueo demostrado, operaciones no terminadas

La compra legacy de boletos no recibe una clave de idempotencia: repetir una petición puede cobrar dos veces. Random Key lee la operación guardada y registra la respuesta después del premio; dos instancias pueden ejecutar el premio antes de registrar la misma clave. Si falla el registro final, reintentar puede repetir el premio. Además, la búsqueda por operation_id no comprueba la identidad/acción al recuperar la respuesta guardada.

`node tools/audit-legacy-economy.mjs` ejecuta solo esas funciones concretas contra memoria, sin red ni BD. El informe auditoria-economia.json registra las reproducciones. Esto demuestra defectos del legado, no una implementación económica nueva ni transaccional.

El backend conservado bloquea ambos endpoints antes de consultar o escribir. Se prueban 128 peticiones repetidas/concurrentes repartidas en dos instancias: cero consultas, cobros o premios. PW2_ENABLE_LEGACY_ECONOMY=true no elude ese bloqueo. No se ha creado ninguna transacción ni migración SQL. No hay evidencia de una transacción atómica existente para estas dos operaciones; habilitarlas exige identificar y verificar una existente o autorizar por separado la solución transaccional necesaria. No es posible garantizarlo únicamente mediante bloqueos en memoria o una clave guardada al final.

## Comprobar la cuenta desde Railway sin tocar datos

Se añadió `scripts/check-live.mjs`. Ejecutarlo dentro del entorno del **servicio Railway existente**, donde ya están SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. No copiar sus valores al repositorio ni al chat. Facilitar PW2_VERIFY_NICK y PW2_VERIFY_PASSWORD solo al proceso de comprobación, con una cuenta propia autorizada; no guardarlos en Git ni dejarlos en variables permanentes después de la prueba.

Comando: `node scripts/check-live.mjs` (también `npm run check:live`).

El script pasa por las rutas del backend actual, crea la sesión solo en memoria y fuerza exclusivamente GET hacia Supabase. Comprueba credenciales, identidad, perfil, Perrilogos originales sin sustitución silenciosa, cantidades exactas, consistencia de saldos, páginas de usuarios/historial/notificaciones, lecturas de Random Key/Sorteos y logout. No imprime claves, contraseñas, nick ni registros. Si faltan registros o hay inconsistencias, falla; no los repara ni concede objetos. Un inventario vacío de movimientos es válido, un inventario inexistente no se da por verificado.

Esta prueba no verifica escrituras reales de avatar, notificaciones ni sesiones persistentes; esas pruebas cambiarían datos y no se han realizado con la prohibición actual. Los tests de esas escrituras siguen usando un repositorio aislado.

## Acción manual para publicar sobre la web actual

1. En GitHub Desktop, abrir **el repositorio que ya tiene asociado el servicio Railway actual**, no crear otro ni publicar esta carpeta como un repositorio distinto. Integrar los cambios de esta carpeta en su checkout conservando sus archivos existentes, variables y minijuegos. El arranque esperado es package.json → `npm start` → `node backend/server.mjs`, con build `node scripts/build.mjs`, puerto PORT y healthcheck /healthz. Conservar el commit/despliegue anterior para volver atrás. Si hay que cambiar el servidor que atiende los minijuegos, revisar su enrutamiento antes de desplegar.
2. Revisar en Railway las variables ya existentes SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY; reutilizarlas. Añadir/revisar NODE_ENV=production, PUBLIC_ORIGIN con el origen HTTPS definitivo exacto, SESSION_STORE=supabase, ALLOW_SUPABASE_SESSION_WRITES=true y CSRF_SECRET aleatorio estable >=32 caracteres. Las sesiones persistentes escriben únicamente filas v2: de shop_sessions; las pruebas de lectura no lo hacen. No activar PW2_ENABLE_LEGACY_ECONOMY. Si ya existe proxy Pages, conservar la configuración autenticada documentada en docs/integracion-final/PUBLICAR.md; no añadirlo si no se utiliza.
3. Ejecutar el verificador de cuenta anterior con esas variables. Confirmar los accesos de los cuatro minijuegos y que no se pierde ningún recurso de la web actual. Solo después hacer Commit/Push al repositorio conectado para el despliegue del servicio existente. Si el servicio tiene auto-deploy, el Push ya inicia el reemplazo: no hacerlo antes de completar estas comprobaciones. Dejar desactivadas compras y canjes.

Si el código nuevo todavía no está disponible dentro del servicio, ejecutar el verificador localmente mediante el mecanismo privado de variables del propietario antes del Push, sin escribirlas en el repositorio ni en el chat. El proyecto no puede reutilizar variables remotas sin acceso al entorno que las contiene.

**No hay un botón o Push que complete los bloqueos pendientes:** sin comprobar la cuenta y preservar el enrutamiento de los minijuegos, la sustitución definitiva no está validada; la economía necesita la garantía transaccional indicada. La configuración de despliegue queda lista, la web no se declara terminada ni publicada.
