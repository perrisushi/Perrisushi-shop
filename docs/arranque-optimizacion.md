# Optimización local del arranque

La sesión sigue siendo el requisito previo. Tras validarla se muestra la interfaz y arrancan por separado perfil, cosméticos, reconocimiento administrativo, comunidad y notificaciones. La configuración de Google ya no precede a la sesión; su estado de vinculación se consulta al abrir Mi Perfil o a petición explícita.

El perfil resumido conserva las tres lecturas principales en Promise.all. El cliente solicita /api/profile?deferCosmetics=1 y, en paralelo, GET /api/profile/cosmetics. El formato completo anterior de /api/profile se conserva para consumidores existentes. La nueva lectura pasa por las mismas comprobaciones de sesión, cuenta activa, sanciones y límites por cuenta; no cambia permisos, CSRF ni operaciones de escritura.

Se conserva la deduplicación HTTP existente y se comparte la lectura del perfil entre los componentes. Comunidad y Google status tienen una caché de 30 segundos. Las mutaciones, el cambio de sesión y el cierre de juegos invalidan las lecturas; las respuestas de una generación anterior no repueblan la caché. Las notificaciones mantienen sus lecturas sin caché y su refresco tras marcar como leídas. Se elimina la llamada a comunidad desde el callback de la campana, que duplicaba la consulta inicial; se conserva refresco al volver a la pestaña y el forzado después de acciones administrativas.

La composición del avatar se muestra como un conjunto completo cuando están disponibles sus tres selecciones. Hasta entonces se conserva el espacio con un estado accesible de carga, sin combinar un Logo real con fondos o marcos inventados. El resumen del perfil ya puede mostrar saldos y logros. Un único punto actualiza el estado compartido: se corrigió y comprobó la carrera en la que una respuesta del resumen sobrescribía los cosméticos recién cargados.

## Mediciones reproducibles

Ejecutar npm run build y node tools/benchmark-startup.mjs. Requiere las dependencias locales del proyecto y Edge/Playwright instalados en este ordenador. El script no lee .env ni accede a producción. Usa PGlite y sesiones ficticias locales; cierra navegador y servidor al terminar.

Se comparan las versiones de main.js y api-client.js del commit de referencia indicado en resultados.json con la versión compilada local. Puede seleccionarse otra referencia con PW2_STARTUP_BASE. El backend local conserva el contrato anterior completo del perfil para la comparación; los recursos gráficos y datos de prueba son los mismos. Se realizan tres muestras por ruta y versión, 12 cargas en contextos nuevos de Edge, sin limitación de CPU ni de ancho de banda. Google se simula; no es una autenticación con Google real.

Latencias artificiales por petición: session 60 ms, admin/context 180 ms, Google status 160 ms, profile 140 ms, community 220 ms y notifications 280 ms. El trabajo cosmético añade 300 ms tanto al perfil completo anterior como a la lectura separada nueva. Son pausas de prueba, no estimaciones de Supabase. La ejecución incluye el trabajo real del servidor y PostgreSQL local.

Se mide con performance.now() y el primer requestAnimationFrame que observa la estructura autenticada, el valor real de PC y la composición autenticada. Esto no equivale a descargar todas las imágenes ni a medir LCP en producción. Las tablas adjuntas muestran medianas de tres muestras. Resultados individuales, cronología de recursos y medidas están en arranque-mediciones/resultados.json.

La API Performance del navegador conserva medidas pw2:session, pw2:startup-to-screen, pw2:profile, pw2:cosmetics, pw2:admin, pw2:community, pw2:notifications y pw2:google-status cuando corresponde. Son duraciones/etapas locales; no se registran identidades, cookies ni cuerpos de respuesta.

Además se prueba el fallo de cosméticos, comunidad, administración y notificaciones en móvil emulado: el perfil principal y el menú siguen accesibles y no se dibuja un avatar incorrecto. Se prueba el orden inverso de terminación, con resumen más lento que cosméticos, equipamiento y posterior navegación a tienda.

## Validación

- npm test: 351 pruebas aprobadas, cero fallos; seis nuevas pruebas de arranque, deduplicación, invalidación, respuestas obsoletas, perfil resumido y acceso protegido a cosméticos.
- npm run build: 530 archivos públicos.
- verify-persistent-sessions.mjs: 14 comprobaciones locales de navegador aprobadas.
- verify-admin-extended.mjs: 16 comprobaciones locales aprobadas.
- verify-perrilogos.mjs: 11 grupos PC/móvil aprobados tras corregir la carrera del equipamiento.
- Sin errores JavaScript ni peticiones externas en esas verificaciones.

## Archivos y alcance

Modificados: src/main.js; src/services/api-client.js; backend/app.mjs; backend/public-paths.mjs; scripts/build.mjs. Nuevos: src/services/startup.js; tests/startup-performance.test.js; tools/benchmark-startup.mjs; este informe y docs/arranque-mediciones.

No se modifican CSS, diseños, escalados, minijuegos, economía, migraciones ni datos de Supabase. No se han hecho Commit, Push o despliegues. Las capturas de verificaciones anteriores regeneradas por las herramientas se retiran del diff; las nuevas comparativas están en arranque-mediciones.

No se han medido Railway, la red del usuario o Supabase real. No se atribuye la lentitud original a ninguno de ellos ni se extrapolan estos porcentajes a producción. Separar cosméticos añade una petición HTTP protegida; esta optimización reduce la cadena de esperas y una petición duplicada de comunidad, sin afirmar que reduce todas las consultas de base de datos. Frontend y backend deben publicarse juntos cuando se autorice.

## Resultado final medido

Referencia anterior: 08e628888256d218a32b8e1b6b82f0cf2c66e68a. Medianas en milisegundos de tres cargas por caso.

| Hito | Antes | Después |
|---|---:|---:|
| Estructura de Inicio | 1163 | 128 |
| Estructura de Mi Perfil | 1176 | 142 |
| Datos principales de Mi Perfil | 1176 | 291 |
| Perrilogo completo en Mi Perfil | 1176 | 454 |

En ambas rutas community pasa de dos peticiones a una; profile y session permanecen en una. Google status pasa de una a cero en Inicio y conserva una en Mi Perfil. Se añade una lectura separada de cosméticos, simultánea al resumen, comprobando el solapamiento mediante Resource Timing. La medida pw2:notifications del coordinador registra el arranque del observador, no la descarga completa; la duración de la petición está en Resource Timing.

Fallo de servicios secundarios en móvil: aprobado. Orden inverso de resumen/cosméticos y selección conservada en tienda: aprobado. Errores JavaScript: 0.
