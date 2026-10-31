# Reparación del acceso Google ya vinculado

Fecha: 31 de octubre de 2026. Cambios locales; sin Commit, Push, despliegue ni acceso a registros de usuarios de producción.

## Fallos reproducibles corregidos

1. Retorno de Supabase a Site URL, /?code=..., visible en una captura anterior: el frontend no procesaba ese código. Una sesión tradicional aún activa podía hacer parecer completada la vinculación; después de logout el mismo retorno dejaba al usuario en el acceso. Ahora el frontend conduce ese retorno al único callback local, que exige la cookie y el verificador PKCE originales. No se aceptan destinos de redirección enviados en la consulta ni se salta la validación de identidad.
2. El proxy podía reenviar como una sola cabecera la limpieza de pw2_oauth y la nueva pw2_session si el runtime ofrecía una API vacía o un Set-Cookie combinado. Ahora recupera y conserva ambas cookies separadas, respetando las comas de Expires.
3. Un callback marcado como satisfactorio seguido de sesión ausente terminaba en un login sin explicación. Ahora muestra un error normal. Si falla la vinculación pero sigue activa una sesión tradicional, también muestra el error y no presenta esa sesión como prueba de vínculo correcto.

No se afirma que estos fallos expliquen por sí solos todos los retornos reales: no se han observado las respuestas de la cuenta del propietario en producción. La prueba posterior al despliegue y los diagnósticos permiten confirmarlo.

## Verificación y diagnósticos seguros

- Antes de emitir la nueva cookie, el backend comprueba que la sesión recién creada puede recuperarse mediante el mismo repositorio que /api/session.
- google_provider: distingue configuración, intercambio de código, consulta de identidad, validación y restricción de cuenta autorizada.
- google_auth: distingue búsqueda de flujo, guardado/consulta del vínculo, creación y COMMIT de sesión y visibilidad posterior de la sesión. El éxito se registra después de COMMIT.
- google_auth_proxy: indica el número de cookies reenviadas, si se reenvía pw2_session y si el retorno está permitido.
- session_auth: diferencia cookie ausente/inválida, sesión no recuperable/inactiva, expiración y sesión válida.
- requestId permite correlacionar el callback, su proveedor y el proxy. No contiene identidad ni credenciales.

No se registran nicks, correos, identificadores Supabase, contraseñas, hashes, tokens, cookies, códigos OAuth, respuestas completas ni URLs con consultas en estos diagnósticos. No compartir la dirección con ?code= ni valores de Set-Cookie.

## Pruebas realizadas

- npm test: 208 superadas, cero fallos.
- Compilación: 485 archivos públicos, correcta; git diff --check correcto.
- Navegador privado con retorno /?code: 14 comprobaciones sin errores JavaScript.
- Navegador privado con callback directo: 14 comprobaciones sin errores JavaScript.
- PC y tamaños móviles: vincular, salir, entrar Google, recargar, vínculo persistente, restricción de otra cuenta y errores visibles ante pérdida de sesión.
- Las pruebas usan proveedor OAuth simulado y base PostgreSQL efímera. No acreditan por sí solas el acceso real de la cuenta del propietario.

No se han cambiado SQL, inventarios, economía, minijuegos, tablas o datos reales. Se conservan el modo privado, el correo autorizado, el bloqueo de altas, las cookies HttpOnly/Secure/SameSite, CSRF y las restricciones del proxy.

## Publicación y comprobación mínimas

1. Cuando el propietario decida publicar, Commit y Push origin desde GitHub Desktop; esperar el despliegue existente. No cambiar variables ni repetir SQL para esta corrección.
2. Abrir una ventana privada y entrar con la contraseña tradicional. En Mi perfil, comprobar si aparece Google vinculado. Solo si no aparece, realizar la vinculación una vez; no borrar ninguna asociación para probar.
3. Cerrar sesión, pulsar Continuar con Google y elegir el correo autorizado. Comprobar nick, recarga y datos habituales sin consumir objetos.
4. Si falla, copiar únicamente las líneas nuevas de google_provider, google_auth, google_auth_proxy o session_auth de los registros del servicio. No enviar claves, cookies, URLs con code ni capturas de credenciales.
