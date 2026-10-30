# Resultado del análisis del esquema real

Fuente: diagnóstico CSV recibido el 30/10/2026, leído localmente; no se accedió a Supabase.
Huella del catálogo: fa7d8e7fae89e04f83a85d2af1be2695.

## Confirmado
- Isoldequeen absorbe isoldequeen.
- Kazzialtime absorbe KazzialTime.
- Sr_vic_ absorbe Sr_Vic_.
- 30 tablas públicas; 30 FK (24 CASCADE, 3 SET NULL, 3 RESTRICT).
- Todas las FK públicas del diagnóstico están validadas.
- Campo is_admin en shop_access; no transferir privilegios automáticamente.
- Seis disparadores activos relacionados con inventarios y tickets.
- Autorrelación de chat, referencias assigned_to/redeemed_by y recursos/estados en JSON.
- shop_ui_layouts es una tabla adicional que debe revisarse si contiene coincidencias.
- code_hash NOT NULL y ausencia de tablas pw2_google_* en este diagnóstico.

## No confirmado todavía
Los saldos y cantidades reales, inventarios detallados, estados/progresos, estadísticas derivadas, diferencias de credenciales o permisos entre las cuentas y conflictos de historiales/IDs. El CSV contiene estructura, no filas de esas cuentas.

## Próximo paso
Ejecutar únicamente sql/fusion-usuarios/02-recursos-y-conflictos-solo-lectura.sql en el mismo proyecto y exportar la celda merge_data en JSON o CSV.

La consulta incluye íntegramente 04-integridad-solo-lectura.sql y permite calcular sumas propuestas sin modificar recursos. No se debe ejecutar 03 ni una migración de Google ahora.

## Pruebas locales
- 187 pruebas del proyecto superadas, 0 fallos.
- 14 pruebas específicas de preparación de fusión.
- Consulta exacta 02 ejecutada en PostgreSQL PGlite sobre una reconstrucción de las 30 tablas del diagnóstico, con datos exclusivamente sintéticos.
- Las sumas, CSV, nicks corregidos, privilegios, referencias Pet antiguas, claves duplicadas, precisión y rechazo por cambio de esquema están cubiertos.
- Un disparador sintético que falla ante UPDATE demuestra que la lectura no actualiza inventarios.
- No se filtraron hashes, tokens, claves ni cuerpo del disparador en los resultados de prueba.
- git diff --check correcto.

El contrato tests/fixtures/account-merge-real-structure.sql solo contiene DDL estructural público. No contiene recursos reales ni se debe ejecutar en producción.

## Archivos preparados
- sql/fusion-usuarios/02-recursos-y-conflictos-solo-lectura.sql: siguiente consulta única.
- sql/fusion-usuarios/04-integridad-solo-lectura.sql: resumen separado, incluido ya en 02.
- sql/fusion-usuarios/01-diagnostico-solo-lectura.sql: parejas corregidas para lecturas futuras.
- docs/fusion-usuarios/plan.json: parejas reales, esquema recibido, recursos pendientes.
- tools/prepare-account-merge.mjs: lectura CSV/JSON, generación desde catálogo y detección de referencias.
- tools/account-merge-report.mjs: informe y conflictos, sin autorización de DML.
- tests/account-merge.test.js y contrato estructural de prueba.
- README.md y este informe.

No se ha emitido aún la migración de fusión/restauración definitiva ni se ha fusionado ninguna cuenta. No se cambió la aplicación, no se accedió ni modificó Supabase/Railway y no hubo Commit, Push o despliegue.
