# PerriWeb 2.0: configuración y publicación manual

El código está integrado directamente en `C:\Users\borja\Documents\GitHub\Perrisushi-shop`. No se ha accedido a GitHub, Railway ni Supabase ni se ha cambiado ningún dato remoto. Este documento reúne la configuración y publicación manual vigentes. El informe de la integración de juegos está en `MINIJUEGOS_INTEGRACION_COMPLETA.md`.

## Qué contiene ahora

- Backend de cuentas tradicionales, cookies HttpOnly/CSRF y datos auténticos desde las tablas existentes. No hay cuentas demo ni inventarios simulados en el arranque normal.
- Perfil, colección poseída, selección de Perrilogo, usuarios públicos, inventario con iconos, historial y notificaciones. Los saldos no se inicializan ni reinician al iniciar sesión. El cambio de avatar también actualiza su imagen pública después de verificar la propiedad; si falla esa sincronización, se informa del fallo y se puede reintentar sin gasto.
- Random Key y compra de boletos de Sorteo 2 mediante una única función transaccional, con identificador persistente y validación en servidor. Sin SQL instalado y sin activación explícita no se habilita ningún cobro.
- Cuatro juegos originales recuperados: `/perriduelos-app/index.html`, `/perripet-app/index.html`, `/perricasillas` y `/perrirpg.html`. Se abren desde el menú aprobado. Se conservan los scripts y gráficos originales; `games/manifest.json` permite comprobar sus hashes. El montaje, transporte y servidor están adaptados a las cookies nuevas; no se rediseñan las mecánicas.
- Los juegos usan la misma cuenta y el mismo inventario dentro de una transacción PostgreSQL. El dispatcher administrativo antiguo no está publicado. Los mensajes del iframe no se usan como autoridad para conceder premios.

## 1. SQL existente de tienda; los juegos no añaden migraciones

Esta integración de juegos no requiere ejecutar SQL nuevo. Si ya instalaste `sql/001-economia-atomica.sql`, no hace falta repetirlo por este cambio. Ese archivo corresponde a la economía de la tienda y solo debe instalarlo manualmente el propietario si aún falta y quiere habilitar compras o canjes.

El archivo crea/reemplaza dos funciones privadas: estado de compatibilidad y operación económica. No borra, reinicia ni altera tablas y no migra contraseñas. Reutiliza `shop_operations`, inventarios, tickets, pool, claims, actividad y snapshot público existentes. El SQL se ejecuta dentro de BEGIN/COMMIT y solicita recarga del esquema PostgREST. No conceder permisos a anon/authenticated ni desactivar RLS.

No ejecutar en Supabase los archivos de `tests/fixtures`: son únicamente el esquema de una base de pruebas local. No ejecutarlos como migraciones. Los juegos esperan las tablas y las funciones RPG originales que ya utilizaban; el código no instala ni reemplaza esas mecánicas remotamente.

## 2. Variables privadas del servicio Railway existente

Mantener `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` que ya tiene el servicio. No introducir sus valores en GitHub ni enviarlos por chat. Configurar/revisar:

| Variable | Valor |
| --- | --- |
| NODE_ENV | `production` |
| PUBLIC_ORIGIN | El origen HTTPS exacto de la web definitiva, sin rutas. Elegir el dominio canónico que utilizas, con o sin www según corresponda. |
| SESSION_STORE | `supabase` |
| ALLOW_SUPABASE_SESSION_WRITES | `true` |
| CSRF_SECRET | Un secreto aleatorio estable de al menos 32 caracteres. |
| DATABASE_URL | Cadena PostgreSQL privada de la misma base, con TLS, obtenida manualmente por el propietario. Puede ser el pooler compatible con transacciones. Solo se utiliza en el backend. |
| DATABASE_SSL_CA | Certificado CA PEM descargado desde Database Settings → SSL Configuration del proyecto Supabase. Necesario si aparece SELF_SIGNED_CERT_IN_CHAIN. Acepta el PEM completo multilínea o con saltos escritos como `\n`. No es la contraseña ni la URL de conexión. |
| PW2_GAMES_ENABLED | Ausente o `auto`: utiliza DATABASE_URL existente. `true`: solicita habilitación explícita. `false`: desactiva los juegos; si todavía tiene ese valor, cambiarlo manualmente a `auto` o `true`. |
| PW2_ECONOMY_ENABLED | `false` inicialmente; `true` después de instalar el SQL y completar la comprobación real del propietario. |
| PW2_RAFFLE_PRICE | Precio vigente confirmado por el propietario; el código antiguo indicaba 3500 PC, no se presupone que siga vigente. |
| PW2_RAFFLE_MAX | Máximo vigente confirmado; el código antiguo indicaba 3. |

La nueva variable DATABASE_URL es necesaria para mantener una única transacción durante las acciones originales de los juegos. Una secuencia de peticiones REST independientes no ofrece esa garantía. No usar una URL de otra base ni desactivar la comprobación TLS para hacer que conecte. La URL puede contener contraseña: debe existir únicamente en las variables privadas del backend.

### Corrección del error TLS confirmado en producción

El registro aportado por el propietario contiene SELF_SIGNED_CERT_IN_CHAIN. Indica que Node rechaza la cadena de certificados presentada por la conexión PostgreSQL, antes de poder comprobar las tablas o abrir los juegos. No demuestra un fallo de contraseña, de sesión ni de esquema. El login usa la API HTTPS y puede funcionar aunque esta conexión PostgreSQL falle.

1. En el proyecto Supabase correcto, abrir **Database Settings → SSL Configuration → Download Certificate** y descargar su certificado CA. Solo descargarlo; no cambiar la configuración SSL ni las tablas.
2. Abrir el certificado con un editor de texto. Copiar el contenido completo desde `-----BEGIN CERTIFICATE-----` hasta `-----END CERTIFICATE-----`, incluidas ambas líneas. No copiar una clave privada ni la contraseña de la base.
3. En las variables del servicio Railway existente, añadir **DATABASE_SSL_CA** y pegar ese PEM completo, con sus saltos de línea (también se aceptan `\n` literales). Mantener DATABASE_URL, las credenciales y el resto de variables. No subir el certificado/configuración privada al repositorio.
4. Publicar el conjunto de cambios de esta corrección mediante **Commit y Push origin** en GitHub Desktop, y aplicar los cambios de variables que Railway tenga pendientes para el mismo despliegue. Se conserva el servicio y el comando de arranque existentes.
5. Después de terminar el despliegue, comprobar `/api/games/context` en el navegador que ya tiene sesión. El diagnóstico anterior debe desaparecer; si aparece otra razón, copiar únicamente `available`, `reason` y `games`. No compartir inventarios ni tokens. `npm run check:games`, ejecutado manualmente con las mismas variables privadas del servicio, usa la misma política TLS y hace solo lectura.

El código mantiene rejectUnauthorized=true y la verificación normal del nombre del servidor. No usar NODE_TLS_REJECT_UNAUTHORIZED=0, rejectUnauthorized=false ni sslmode=no-verify como solución. Los parámetros TLS de DATABASE_URL se integran de forma explícita para impedir que pg reemplace el objeto SSL y pierda la CA; los archivos sslrootcert/sslcert/sslkey existentes se conservan si están configurados. Sin DATABASE_SSL_CA ni sslrootcert, se usan las autoridades predeterminadas de Node. No hay cambios SQL ni migraciones para esta corrección.

Referencias: [SSL de node-postgres](https://node-postgres.com/features/ssl), [certificados y conexión de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

Conservar la configuración de login que ya funciona. No reemplazar sus secretos ni importar todo el archivo de ejemplo sobre las variables actuales. El modo automático de juegos no activa las compras de la tienda ni crea tablas o cuentas.

Antes de abrir partidas reales, ejecutar manualmente `npm run check:games` en un proceso privado que tenga las variables existentes. Para una configuración local privada opcional puede ejecutarse `node --env-file=backend/.env scripts/check-games.mjs`; nunca guardar ese archivo en Git. La comprobación usa BEGIN READ ONLY y ROLLBACK: no inicia juegos ni consume recursos. Comprueba tablas, permisos SELECT y funciones RPG/EXECUTE; no garantiza permisos de escritura, columnas, RLS, catálogos ni triggers remotos. Una coincidencia de proyecto `unknown` tampoco certifica el proyecto: la apertura exige además encontrar la misma sesión autenticada en PostgreSQL.

Si falla, el resultado distingue `database_not_configured`, `database_project_mismatch`, `database_unavailable` o `schema_incomplete`, sin mostrar contraseñas. Los registros `games_runtime` distinguen además `games_disabled` y `session_not_shared`. Los códigos PostgreSQL 28P01 y 42501 indican autenticación y permisos respectivamente; los códigos TLS deben resolverse con la conexión/cadena de confianza correcta, sin desactivar la validación de certificados. Si faltan tablas o funciones, no ejecutar los fixtures de pruebas: comprobar primero el esquema original y preparar únicamente el cambio compatible que se haya demostrado necesario. No se ha inspeccionado la base real ni identificado una migración necesaria.

No usar `PW2_ENABLE_LEGACY_ECONOMY`: esa variable antigua no activa compras. El código nuevo comprueba además que la función SQL instalada anuncia la versión compatible. Random Key puede habilitarse sin configurar precio de sorteos; los boletos siguen desactivados hasta definir su política válida.

Las sesiones nuevas se guardan con prefijo `v2:` y token resumido, sin reemplazar las antiguas. Login/logout persistentes escriben exclusivamente las sesiones propias; cambiar avatar, leer notificaciones y jugar generan las escrituras normales del usuario. Nada se inicializa automáticamente al arrancar el servidor.

## 3. GitHub Desktop: Commit y Push al repositorio que ya usa Railway

1. Abrir **el repositorio existente conectado a Railway**. No crear otro repositorio ni otro proyecto.
2. Seleccionar la carpeta `C:\Users\borja\Documents\GitHub\Perrisushi-shop`. Los cambios ya están guardados allí: no copiar otra entrega ni sustituir el repositorio. Conservar el Root Directory y la configuración de despliegue existentes.
3. En Changes comprobar que se incluyen backend, src, scripts, games, public, sql, package.json, package-lock.json y railway.json. No incluir `.env`, credenciales, node_modules, ZIP/RAR ni las carpetas ocultas de paquetes y backups; `.gitignore` ya los excluye.
4. Escribir, por ejemplo, `Integrar PerriWeb 2.0 y juegos originales`, pulsar **Commit to la rama conectada** y después **Push origin**. Si Railway tiene auto-deploy, este Push inicia la sustitución de la web actual.

Se conserva el arranque `npm start` → `node backend/server.mjs`, el puerto PORT y la comprobación `/healthz`; la construcción es `node scripts/build.mjs`. El servidor sirve `dist` y las rutas nuevas: no publicar backend como carpeta estática. `/healthz` confirma configuración presente, no certifica una cuenta ni un gasto real. El despliegue necesita instalar dependencias desde package-lock.json (`npm ci`).

Si el frontend sigue alojado en Cloudflare Pages, conservar el proxy autenticado existente de `functions/api/[[path]].js`, su origen de Railway y su secreto compartido. El build incluye las redirecciones de los recursos antiguos. Las claves Supabase y DATABASE_URL permanecen exclusivamente en Railway. No añadir un segundo hosting si el servicio existente sirve toda la web.

## 4. Comprobación real que debe hacer el propietario

Desde un proceso privado con las variables del servicio, ejecutar `npm run check:live`, proporcionando temporalmente `PW2_VERIFY_NICK` y `PW2_VERIFY_PASSWORD` de una cuenta propia. No guardarlos en el repositorio ni dejarlos como variables permanentes tras la prueba.

Ese comando hace solo GET hacia Supabase, usa una sesión en memoria y compara identidad, perfil, Perrilogos, cantidades originales, historial, usuarios y notificaciones. No cobra, entrega premios ni modifica datos. En este encargo se ejecutó sin credenciales y se detuvo antes de consultar, como corresponde.

Después, en la web publicada, comprobar con esa misma cuenta: login, inventario y Perrilogo conservados, historial/notificaciones, cambio a un logo poseído, marcado de aviso, logout y reconexión. Comprobar los cuatro juegos, guardado y consumo reales. Las pruebas de escritura real cambian datos normales de esa cuenta: no se han hecho automáticamente ni sobre cuentas ajenas.

Mantener la economía desactivada hasta completar esas comprobaciones y confirmar el precio/máximo. Tras habilitarla, probar una operación propia controlada y revisar su asiento: reintentar la **misma** operación no debe repetir el cobro ni el premio. No intentar una prueba de gasto real copiando los datos ficticios de los tests. No se afirma que el esquema remoto o sus triggers hayan sido verificados.

## Garantías y límites comprobados localmente

La operación económica bloquea en PostgreSQL, valida saldo y límite, consume ticket vigente, asigna una clave no entregada, entrega premio, registra actividad y guarda la respuesta en la misma transacción. Si falla cualquiera de esos pasos, se revierte todo. La clave de operación se vincula a usuario, acción y política; una reutilización incompatible se rechaza. Los juegos comparten el bloqueo de transacción para evitar sobrescribir saldos de la economía entre instancias nuevas. No ejecutar en paralelo un servidor antiguo que siga escribiendo mediante lectura/modificación/guardado fuera de este mecanismo.

Las protecciones transaccionales no cambian las reglas originales de combate o evolución ni constituyen una auditoría antitrampas completa de todos los juegos. Se han probado en PostgreSQL local, no en el esquema remoto. Los procesos externos que concedan recursos deben respetar la compatibilidad de sus escrituras; el endpoint administrativo público antiguo permanece bloqueado.

La verificación visual principal cubre seis tamaños PC/móvil; la de los cuatro juegos y las operaciones completas cubre escritorio y móvil de 390 y 360 píxeles. Se revisaron capturas y errores JavaScript/API. Los registros de laboratorio se generan únicamente en las pruebas y en memoria; sus capturas están documentadas dentro de docs y no se incorporan a las cuentas ni a las pantallas normales.

El motor de pruebas es PostgreSQL embebido (PGlite), que serializa sus consultas locales; no se ha probado un despliegue remoto con múltiples réplicas ni sus triggers reales. La serialización entre conexiones de producción se implementa mediante los bloqueos de transacción PostgreSQL, no mediante un bloqueo de JavaScript. La activación final y la prueba con una cuenta auténtica corresponden al propietario.
