# Inventario: casillas reales y panel ajustado al contenido

## Corrección

- `renderLiveInventory()` recorre exclusivamente los objetos del inventario con cantidades distintas de cero, conservando las cantidades originales y excluyendo los saldos y metadatos ya separados de la cuadrícula. Se elimina por completo el mínimo de 24 y la generación de spans vacíos. Un inventario con 14 objetos produce exactamente 14 botones/casillas.
- Cuando no hay objetos, el área de casillas se oculta y se muestra el estado vacío normal, sin un marco de relleno.
- `fitInventoryGrid()` calcula filas reales a partir del número de casillas. Limita las filas visibles al espacio útil y no asigna filas adicionales para rellenar la pantalla. La casilla conserva un tamaño proporcional; con menos objetos que columnas disponibles se reduce también el ancho de la cuadrícula.
- El panel adopta su altura natural. Se eliminan `flex:1` y `height:100%` de los contenedores interiores que forzaban el crecimiento. El único scroll sigue dentro de la cuadrícula cuando las filas reales no caben.
- El cálculo considera los márgenes del área disponible, la cabecera, los saldos, el marco y la barra de desplazamiento. El panel se reduce también en anchura cuando hay pocos objetos, respetando el mínimo necesario para el título y los saldos.
- Se mantienen seis columnas cuando hay objetos suficientes y espacio; la adaptación móvil utiliza cuatro o tres según el ancho útil. La última fila incompleta conserva solo sus objetos, sin elementos de relleno.
- El ResizeObserver observa el área disponible, no un contenedor cuya altura acaba de modificar; reajusta al redimensionar sin imponer una altura de pantalla al panel.
- Se conserva el espacio de las redes sociales en escritorio y los márgenes laterales móviles. Las ventanas informativas y las aperturas mantienen su funcionamiento; el punto de inserción de consultas pendientes admite el nuevo estado vacío.

## Verificación

- `npm test`: 150 pruebas superadas, sin fallos ni omitidas. La antigua prueba que exigía 24 casillas se sustituye por una regresión de conteos reales para 0, 1, 6, 14, 24 y 57 objetos.
- `node tools/verify-inventory-content.mjs`: 66 casos de presentación en navegador, más redimensionamientos sin recarga; cero errores JavaScript.
- Tamaños: PC 1920×1080, 1440×900, 800×900, 1000×550, 1200×400, 900×280; móvil emulado 320×568, 390×844, 430×932, 667×375, 844×390.
- En cada tamaño se comprueban inventarios de 0, 1, 6, 14, 24 y 57 objetos: número exacto de casillas, ausencia de rellenos, panel compacto, márgenes, ninguna superposición con redes, casillas cuadradas, filas visibles sin sobrantes, ausencia de scroll horizontal y exterior, última casilla accesible y saldos/cabecera inmóviles al desplazar o abrir/cerrar fichas.
- Revisadas las capturas de pocos objetos, 14 objetos, inventarios largos y ventanas de poca altura. La parte vacía de una última fila incompleta es espacio natural de la cuadrícula, no casillas ficticias.
- `node tools/verify-inventory-production.mjs`: pasan los 15 escenarios existentes con frontend y backend locales y PostgreSQL en memoria, incluidas aperturas, doble pulsación, Abrir otro, reintentos y recuperación de recibos. Ningún error JavaScript.
- `npm run build`: 485 archivos públicos; compilación correcta.

Los datos de los 66 casos son respuestas locales de presentación. Las pruebas de aperturas utilizan PostgreSQL local aislado. Ninguna de las dos pruebas accede a Supabase ni a cuentas reales. No se ha comprobado un móvil físico o Safari/iOS.

## Archivos

- `src/services/live-ui.js`: renderizado exclusivo de casillas reales y estado vacío.
- `src/main.js`: ajuste por cantidad de objetos y dimensiones útiles; compatibilidad del bloque de recuperación con el estado vacío.
- `src/preview-pages.css`: panel de altura natural, flexibilidad de los contenedores y límites/márgenes.
- `tests/revision-04.mjs`: regresión del número exacto de casillas.
- `tools/verify-inventory-content.mjs`: comprobador local de conteos, proporciones y tamaños.
- Este informe, resultados y capturas.

No se han modificado backend, inventarios reales, recompensas, cuentas, Supabase, minijuegos ni variables privadas. Sin Commit ni Push.
