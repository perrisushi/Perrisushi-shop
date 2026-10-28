# Integración de Corrección 01

Se leyó CORRECCION_01_PARA_CODEX.md y se compararon los archivos de referencia con la versión local antes de fusionar. Se conservaron las mejoras anteriores de foco, fondo inerte, bloqueo de scroll en diálogos, enlace de salto, disposición apaisada y avisos honestos de inventario/notificaciones. Las pantallas y los minijuegos mantienen su contenido y funcionamiento previo.

## Cambios integrados

- `index.html`: avatar y marco separados, menú exclusivo de sesión, audio sin precarga y enlaces sociales del paquete.
- `src/main.js`: catálogo permitido de avatares y función exportada setAuthenticatedProfile; avatar genérico cuando no existe autenticación; música tras gesto, asistencia y aviso de sesión inexistente. El foco del modal incluye el enlace de asistencia y vuelve al botón de menú al cerrarlo.
- `src/styles.css`: marcos originales sin logotipo duplicado, controles ampliados, distribución móvil. Se corrigieron los solapes del avatar y redes con los paneles interiores detectados en las capturas, reservándoles espacio; los paneles conservan scroll interno.
- `dev-server.mjs`: MP3 permitido y servido como audio/mpeg.
- `public/assets/` y `docs/asset-manifest.json`: recursos y trazabilidad incluidos en el ZIP.
- `tests/correcciones-01.test.js`: las cuatro pruebas suministradas.
- `tools/review-ui.cjs`: adaptación de la revisión a los tamaños y comportamientos nuevos. README actualizado. Instrucciones del paquete conservadas en la raíz y referencia extraída en `.correccion-01/`.

## Resultados

9/9 pruebas aprobadas con Node 24.22.1 mediante `node --test tests/*.test.js`. Se intentaron `npm test` y `npm run dev`, pero npm no está disponible en PATH. El servidor se ejecutó correctamente mediante su comando equivalente `node dev-server.mjs`, también durante la revisión con navegador.

Se comprobaron las seis pantallas en 1649×928, 1280×720, 390×844, 360×640 y 844×390. Los escenarios PC miden 1097×892 y 841×684. En móvil bajo se permite scroll vertical. Sin desbordamiento horizontal, imágenes rotas ni errores de consola en la pasada final.

Se inspeccionaron visualmente las 50 capturas y cinco resúmenes: avatar genérico delante del marco, marcos proporcionados y controles sin solapes. Se verificaron navegación principal, Volver, toque emulado, foco y cierre por Escape/X/fondo, asistencia y cierre de sesión, encendido/apagado de música y respuesta 200 audio/mpeg para el MP3. La emulación no sustituye la revisión en un teléfono físico ni confirma la audición por los altavoces.

La primera comprobación de redes dependía de la navegación de los servicios externos y falló al comparar sus URLs finales. La prueba final intercepta únicamente esos destinos externos y confirma que ambos botones abren la URL configurada en otra pestaña; no acredita disponibilidad o titularidad de los canales. No se consultó el proyecto antiguo, siguiendo el alcance local. Las URLs son las aportadas por el ZIP.

Capturas actuales: `docs/capturas-correccion-01/`. Resultados automáticos: `results.json` dentro de esa carpeta. Las capturas anteriores se conservan en `docs/capturas/`.

No se realizaron conexiones a Supabase, cambios de cuentas ni modificaciones de minijuegos. La autenticación y el cierre real de sesión continúan pendientes de una fase posterior.
