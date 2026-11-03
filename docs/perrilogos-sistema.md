# Sistema de Perrilogos: entrega local

Se reutilizan Mi Perfil, PerriTienda, las sesiones, los perfiles, productos, compras, inventarios y la administración existentes. No se crea una tienda o aplicación paralela.

## Recursos y composición

26 PNG originales de la carpeta conjunto-logo: 4 fondos, 16 Logos y 6 marcos. Todos son 850×850 con transparencia, copiados sin transformación y comprobados mediante SHA256 y Canvas del navegador. El inventario completo está en perrilogos-inventario.md y perrilogos-recursos.json.

Un único componente presenta exactamente fondo → Logo → marco, en un mismo cuadrado. Se emplea en cabecera, Mi Perfil, el álbum existente, miniaturas de tienda y Usuarios. No se añaden avatares a pantallas que antes no los mostraban. Las referencias ausentes tienen alternativa visual sin modificar la selección guardada. Usuarios obtiene las composiciones en una consulta por lote, sin consulta por imagen o usuario.

## Propiedad, selección y base de datos

005-perrilogos-capas.sql es una migración local preparada para aplicar manualmente después de 004. NO se ha ejecutado contra producción y no reemplaza pw2_economy_operation ni otras migraciones.

Añade únicamente cosmetics JSONB en shop_profiles para propiedad de fondos/marcos y sus dos selecciones. Logos continúa utilizando owned_logo_ids y selected_logo_id. No crea tablas, cuentas ni identificadores de usuario nuevos. Añade tres triggers: predeterminados del perfil, inicialización diferida de nuevos jugadores y concesión administrativa. El marcador de instalación y los tres triggers se comprueban en el servidor; PW2_COSMETICS_ENABLED=true exige su instalación completa al iniciar.

El fondo negro y marco básico se añaden idempotentemente a perfiles existentes y nuevos, incluido registro tradicional y Google. La inicialización diferida respeta el perfil explícito creado durante el registro. No cambia Logos seleccionados ni selecciones existentes de fondo/marco.

Solo la cuenta exacta Perrisushi, comprobada contra shop_access.is_admin desde el servidor, obtiene logo-perrisushi-adm sin equiparlo forzosamente. Peticiones del navegador, cofres y concesiones administrativas genéricas no pueden otorgarlo a otros. Propiedad histórica de logo-perriweb1 y marco-logo-2026 se conserva; se rechazan nuevas concesiones. No se inventan propietarios históricos cuando no existe registro previo.

## Compras y administración

Se reutiliza la transacción económica de la tienda: sesión y CSRF, cuenta activa/sanciones, mantenimiento, producto vigente, precio del servidor, saldo, propiedad permanente, compra, entrega y recibo. Bloqueos transaccionales e idempotencia evitan doble entrega y cobro; cualquier fallo revierte todo. Comprar no equipa; cada selección se valida y guarda independientemente en el servidor.

Catálogo inicial: básico/cuadrícula/piedra a 500 PC; metálico/morado gema/planta a 1.500 PC. La administración existente permite gestionar disponibilidad, publicación, precio y compras. Recursos gratuitos, exclusivos, históricos y Logos no se convierten en productos comprables. Las semillas no sobrescriben ediciones administrativas al repetir la migración. Productos Logo anteriores se conservan ocultos y deshabilitados, junto con compras e históricos.

Los cofres mantienen su probabilidad de Logo del 30 % y su sistema original de entrega. La única modificación en games-original.cjs es excluir expresamente logo-perriweb1 y logo-perrisushi-adm del listado de Logos desconocidos elegibles, según la solicitud. No cambia ninguna otra mecánica ni recompensa de minijuegos.

## Archivos del proyecto

Nuevos: backend/cosmetics.mjs; src/services/perrilogo.js; src/services/perrilogo-catalog.js; src/perrilogo.css; sql/005-perrilogos-capas.sql; public/assets/perrilogos (26 originales); tests/perrilogo-cosmetics.test.js; tools/verify-perrilogos.mjs; inventarios, informe y capturas en docs/perrilogos*.

Modificados: backend/administration.mjs, app.mjs, community.mjs, games-original.cjs, logo-assets.mjs, management.mjs, public-paths.mjs, server.mjs; index.html; scripts/build.mjs; src/main.js; src/services/admin-ui.js, api-client.js, live-ui.js; tests/games.test.js, helpers/admin-fixture.mjs, profile-achievements.test.js y store-layout.test.js.

Las expectativas antiguas de WebP y venta de Logos/accesorios se actualizan a PNG y Fondos/Marcos conservando las verificaciones de logros y saldos. La comprobación del código original de juegos normaliza únicamente la exclusión autorizada de los dos Logos especiales.

## Pruebas ejecutadas y límites

- npm test: 345 aprobadas, 0 fallos. Incluye 19 nuevas pruebas de cosméticos con PostgreSQL local PGlite, compra y rollback, peticiones HTTP, sesiones/CSRF, sanciones, exclusivos, eventos, inicialización Google simulada, idempotencia, cofres originales y persistencia entre clientes.
- npm run build: 529 archivos públicos; sin backend ni secretos en dist.
- tools/verify-perrilogos.mjs: 11 grupos de comprobaciones reales en Edge, 0 errores JavaScript, 0 peticiones externas. PC 1366×768, móvil emulado 390×844 y controles adicionales de 320/360/430 px. Compras, previsualización, equipamiento, recarga, Usuarios, exclusividad administrativa y administración de productos.
- Rectángulos de las tres capas coincidentes en componentes visibles; 26 PNG con transparencia verificada mediante Canvas. Twitch y YouTube conservan enlaces, recursos, visibilidad y geometría antes/después del equipamiento en ambos viewports. No se cambia el CSS del escalado o de estos botones.
- tools/verify-admin-extended.mjs: 16 comprobaciones de administración en Edge local; sin errores ni conexiones externas.

Capturas de Perfil, las tres categorías, ambos catálogos y Usuarios en PC/móvil: perrilogos-capturas.md. Informes del navegador: perrilogos-capturas/resultados.json y transparencia.json.

No se ha probado contra Supabase de producción ni con un teléfono físico. Google se prueba con proveedor simulado, no contra una cuenta Google real. Las pruebas de concurrencia locales cubren idempotencia y transacciones; no son una prueba de carga multinodo real. La migración debe revisarse frente al esquema real antes de aplicarla manualmente. Frontend y backend deben publicarse juntos cuando se autorice, después de preparar la base; no se ha realizado Commit, Push ni despliegue.
