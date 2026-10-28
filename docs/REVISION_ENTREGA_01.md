# Revisión de entrega 01 — 27/10/2026

Se conservan la taberna, los botones y los recursos originales. No se ha conectado ningún servicio ni modificado imágenes. El manifiesto de recursos conserva la trazabilidad aportada por el ZIP; sus PNG de origen no están incluidos en esta entrega y no se han reconstruido.

## Ajustes

- `src/styles.css`: margen lateral suficiente para las esquinas del marco de inicio, que provocaban scroll horizontal en 390 y 360 px. Disposición móvil también en alturas de hasta 500 px, evitando controles diminutos en apaisado. Se permite scroll vertical cuando el contenido lo necesita.
- `src/main.js`: fondo inerte y scroll bloqueado mientras hay un diálogo, restauración del foco, Escape del menú devuelve el foco al botón. El enlace de salto enfoca el contenido sin cambiar a una ruta inexistente. Avisos de inventario y notificaciones describen su estado pendiente de conexión.
- `index.html`: textos alternativos de las redes indican que sus enlaces están pendientes.
- `README.md`: comandos equivalentes cuando npm no está en PATH.
- `tools/review-ui.cjs`: revisión reproducible con Edge y el Playwright ya disponible en el entorno, sin instalar paquetes ni añadir dependencias de ejecución. Permite configurar PLAYWRIGHT_MODULE para otra ubicación.
- Nuevos resultados y 40 capturas de pantallas y diálogos en `docs/capturas/`; cinco imágenes de resumen para revisión humana.

## Verificación

Node 24.22.1. Las cinco pruebas originales pasan con `node --test tests/*.test.js` (npm no está en PATH). Servidor de desarrollo ejecutado correctamente con Node.

Seis pantallas y dos diálogos en 1920×1080, 1366×768, 390×844, 360×640 y 844×390. Las 30 combinaciones finales no muestran desbordamiento horizontal ni imágenes rotas; no se registran errores de consola ni JavaScript. Se inspeccionaron las capturas de los cinco tamaños. Las pantallas interiores de escritorio usan desplazamiento interno cuando es necesario; en móvil se desplaza la página.

La revisión automatizada comprueba accesos del inicio (con toque emulado en tamaños móviles), las seis rutas del menú, Volver, cierre de diálogos por Escape/X/fondo, foco contenido y retorno de foco desde el menú. El resultado detallado está en `capturas/results.json`. La emulación no sustituye una prueba en dispositivo físico.

La aplicación sigue siendo una vista previa sin autenticación o datos remotos. Pendiente la aprobación visual del propietario antes de abordar otra fase.
