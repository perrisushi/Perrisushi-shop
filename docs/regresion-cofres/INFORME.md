# Corrección de la desaparición de cofres

## Causa demostrada

La modificación anterior de `GET /api/inventory` reemplazaba `perri_cofres` y `perri_cofres_minijuego` por un recuento de `shop_inventory_chests`, usando cero si no había filas. Las cuentas antiguas pueden tener cantidades guardadas en `shop_inventories` sin ese historial auxiliar. La interfaz oculta los objetos con cantidad cero: de ahí la desaparición. La carga de esta ruta era de lectura; la ocultación no demuestra que las cantidades guardadas se borraran.

La API vuelve a devolver todas las cantidades originales, sin sustituirlas ni normalizarlas. Bolsas de Gemas, Chatarra, Especiales y Cajitas de Armas también quedan cubiertas por una regresión que comprueba su presencia en la cuadrícula.

## Compatibilidad de aperturas

Se ha corregido además el riesgo de que la sincronización opcional del backend antiguo pusiera a cero los contadores al abrir una bolsa o cofre:

- La decisión se toma en servidor y, para aperturas, dentro de la transacción bloqueada existente.
- Si la cuenta no tiene ningún registro auxiliar, se utiliza el modo original de consumo por contadores, conservando cantidades y reglas de premios. No se crean filas auxiliares ni se inventan caducidades.
- Si existe historial auxiliar, debe concordar con los contadores antes de abrir. Una discrepancia bloquea la apertura sin ajustar cantidades ni conceder premios. Los objetos siguen visibles.
- Los errores SQL o la aplicación de filtros RLS no se interpretan como ausencia de historial; no habilitan el modo de compatibilidad.
- Se mantienen autenticación, CSRF, transacciones y recibos idempotentes. Ningún cambio en archivos o mecánicas originales de minijuegos.

## Validación

- 140 pruebas superadas, cero fallos y cero omitidas.
- Compilación correcta: 485 archivos públicos.
- Regresión HTTP: cofres, bolsas y cajas visibles con sus cantidades originales aunque el recuento auxiliar esté vacío.
- PostgreSQL local: las cuatro bolsas/cajas no alteran los contadores de cofres; cada apertura de cofre antiguo consume una sola unidad; reintento idéntico sin duplicados; cuentas con discrepancias o permisos RLS filtrados no sufren ajustes automáticos.
- Navegador con backend y PostgreSQL locales: una cuenta antigua sin historial auxiliar conserva los seis tipos visibles, puede abrir una bolsa sin perder sus cofres y consume una unidad al abrir un cofre. Se conserva la verificación de seis resoluciones de PC/móvil y recuperación tras perder respuestas.

No se ha accedido a Supabase, Railway o GitHub; no se han consultado, reconstruido ni modificado cantidades reales. La validación de datos y cuentas en producción sigue pendiente. Sin Commit ni Push.

Archivos: `backend/app.mjs`, `backend/games.mjs`, `backend/game-transport.cjs`, `src/services/api-client.js`, `src/services/live-ui.js`, pruebas HTTP/SQL y `tools/verify-inventory-production.mjs`. Sin cambios de CSS o diseño.
