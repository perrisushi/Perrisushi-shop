# Corrección de distribución y scroll móvil

Causa: la regla móvil de redes dependía simultáneamente de `#session-options[hidden]` y `#overlay-layer[hidden]`. Al abrir un menú dejaba de mostrarse el bloque social y variaba la altura de una portada en flujo. El marco y sus márgenes tampoco estaban limitados por la altura disponible.

Solución en `src/styles.css`, limitada a los breakpoints móviles: escena de altura dinámica fija; portada con espacio reservado para cabecera, redes y copyright; marco ajustado proporcionalmente; redes dependientes únicamente de la ruta Inicio; desplegable y ventanas superpuestos; secciones con marco y cabecera inmóviles y desplazamiento interior. En Inicio, las notificaciones respetan el espacio de las redes y su sombreado tampoco las cubre. El cierre queda accesible durante el desplazamiento interior. En horizontal se reutiliza el marco gráfico original de dos columnas.

No se han cambiado funciones, sesiones, datos, backend ni archivos de minijuegos. Sin acceso a servicios externos, Commit ni Push.

## Verificación

- `npm test`: 131 pruebas superadas, ninguna omitida.
- `npm run build`: 485 archivos públicos, compilación correcta.
- `node tools/verify-mobile-layout.mjs`: siete tamaños móviles (320×568, 360×640, 373×734, 390×844, 430×932, 667×375, 844×390) y tres tamaños de PC (1440×1000, 1024×768, 1440×450).
- Menú de sesión y notificaciones abiertos/cerrados repetidamente: igualdad exacta de posiciones y tamaños de escena, cabecera, avatar, marco, botones y redes; redes completas, separadas del marco y sin cubrir por la ventana de notificaciones.
- Asistencia, navegación por Perfil, Usuarios, Inventario, Tienda y Minijuegos, regreso a Inicio, rotación y listas largas: sin scroll del documento; desplazamiento interior; redes ocultas solo al cambiar de sección.
- PC: geometría y todos los estilos calculados de elementos y pseudoelementos iguales al CSS anterior. Capturas revisadas. La comparación se hace sobre estilos y geometría porque el navegador puede variar la rasterización de imágenes entre capturas.
- Cero errores JavaScript en las comprobaciones de navegador.

El comprobador utiliza exclusivamente respuestas locales aisladas para validar presentación. No demuestra autenticación ni datos de producción. Las capturas se guardan en `%TEMP%\perriweb-mobile-layout` (o `PW2_QA_DIR`). Resultados adjuntos en `resultados.json`.

Pendiente de comprobación manual: móvil físico, especialmente Safari/iOS y barras dinámicas del navegador. No se ha probado la web publicada ni se ha desplegado esta corrección.
