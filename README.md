# PerriWeb 2.0

Interfaz aprobada PC/móvil, backend de cuentas existentes, economía transaccional y cuatro minijuegos originales recuperados.

**Código integrado y probado localmente. Falta la comprobación del propietario contra sus datos reales.** No se ha accedido a GitHub, Railway ni Supabase, ni publicado ni modificado datos remotos.

- Instrucciones únicas vigentes: [docs/PUBLICAR_PRODUCCION.md](docs/PUBLICAR_PRODUCCION.md).
- SQL mínimo para ejecutar manualmente: [sql/001-economia-atomica.sql](sql/001-economia-atomica.sql).
- Capturas y E2E con PostgreSQL local: [docs/produccion-local](docs/produccion-local).
- Los informes anteriores dentro de docs describen estados históricos.

## Instalar y probar

```powershell
npm ci
npm test
npm run build
npm start
```

Sin variables privadas se muestra un error de conexión, sin cuentas demo. Para desarrollo visual: `npm run dev`; el proxy local conecta al backend de `npm start`. Configuración local opcional: copiar backend/.env.example a backend/.env y arrancar `node --env-file=backend/.env backend/server.mjs`. No subir ese archivo.

La economía requiere instalar el SQL y activarla explícitamente. Los juegos requieren DATABASE_URL privada y PW2_GAMES_ENABLED=true. Mantener ambas opciones desactivadas hasta la validación del propietario. Los scripts y gráficos originales se comprueban con games/manifest.json; solo se adapta el transporte y el montaje.

Comprobación real de solo lectura, con variables privadas y una cuenta propia autorizada: `npm run check:live`. No introduce datos, no migra cuentas, no cobra ni entrega premios. Las pruebas que sí cambian estado utilizan únicamente PostgreSQL local en memoria.

## Publicar

Usar el repositorio y servicio Railway existentes, conservar sus secretos y desplegar con Commit/Push de GitHub Desktop según el documento anterior. El servidor respeta PORT y sirve solo dist más la API protegida. No expone backend, SQL, tests, referencias, backups ni /shop-api.

No se ha implementado Google. El proyecto no ejecuta migraciones automáticamente.
