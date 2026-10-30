# Validación final: Google Login listo en código local

## Resultado
- npm test: **197 pruebas superadas**, 0 fallos, 0 omitidas.
- **33 pruebas específicas** de Google/legales, incluidas las regresiones nuevas.
- npm run build: correcto, **485 archivos públicos**.
- git diff --check: correcto.
- node tools/verify-google-auth.mjs: **19 comprobaciones**, 0 errores JavaScript.
- Configuración railway.json, minijuegos originales y mecánicas conservados.

## Funciones terminadas
- Acceso Google mediante Supabase Auth y PKCE S256 en el backend.
- Vinculación con sesión válida, CSRF y contraseña actual; revalidación del origen de la sesión.
- Registro explícito con nick disponible y aceptación versionada de condiciones.
- Cuenta nueva sin contraseña ficticia y sin permisos de administrador.
- Vínculo único en ambos sentidos y reserva de nick en PostgreSQL.
- Sesiones PerriWeb persistentes compartidas con la interfaz y minijuegos.
- Cierre de sesión y entrada tradicional independientes de fallos de limpieza Google.
- Retorno OAuth seguro y cookies preservadas a través del proxy.
- Mensajes comprensibles y reintento funcional si falla la consulta de vinculación.
- Publicación controlada de documentos legales completos; rechazo de borradores.
- Asistente local para completar los textos sin editar HTML y sin sobrescribir versiones.

## Cobertura
Conservación de hash/nick/inventario/Perrilogo existentes; registro y rollback; peticiones concurrentes; vínculo incompatible; cuentas desactivadas; sesión revocada; caducidad, cancelación y repetición del código; RLS/permisos; compatibilidad del dispatcher original; validación remota del usuario simulado; ausencia de tokens en respuestas; sesiones entre instancias; SQL repetible y fallo transaccional ante índice incompatible.

La aceptación legal exige que la versión del formulario coincida con la del servidor. Los documentos se generan solo con datos completos y aprobados, con contenido escapado. El comando CLI y la publicación HTML con CSP están probados.

## Navegador local
- Edge headless, escritorio: 1440×900 y 1000×550.
- Móvil emulado/táctil: 320×568, 390×844 y 667×375.
- Formulario enfocado y altura reducida 390×500.
- Acceso, vinculación, registro, nick ocupado, recarga/persistencia y logout.
- Recuperación de un fallo inicial simulado de consulta de vinculación.
- Política/condiciones públicas en PC y móvil; sin desbordamiento horizontal y con cabeceras de seguridad.

Se revisaron capturas. En pantallas bajas el formulario desplaza internamente su contenido y mantiene accesibles las acciones. La prueba de altura reducida no equivale a un teclado físico de Android/iOS.

## Límites de verificación y configuración manual
El proveedor OAuth está sustituido exclusivamente en las pruebas; el resto del recorrido usa frontend/backend y PostgreSQL PGlite locales. Las páginas legales de prueba contienen datos sintéticos en TEMP, nunca en el build ni en backend/legal-reviewed.

**No se ha comprobado Google con las credenciales reales ni ejecutado check:live contra producción.** La prueba real se realiza por el propietario después de ejecutar el SQL, aportar/aprobar los documentos y activar las variables. Android/iOS físicos requieren esa comprobación.

Los documentos legales reales no están generados porque faltan identidad/dirección/contacto y decisiones jurídicas del responsable. El código y asistente están terminados; no se inventaron esos datos.

## Entrega
Guía de activación: ACTIVACION_PASO_A_PASO.md.
Único SQL: sql/002-google-auth.sql.
Comando para los documentos: npm run legal:prepare -- --interactive.

Sin Commit, Push, despliegue, ejecución de migraciones, acceso a servicios de producción ni modificaciones de datos reales.
