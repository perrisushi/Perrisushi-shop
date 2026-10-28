# Corrección 03 — sin estrellas decorativas

Se siguieron INSTRUCCIONES_CODEX.md y el parche de referencia del ZIP sobre la versión actual.

- src/main.js: retirado el nodo de estrella del encabezado compartido y el adorno de Tienda. emptyNotice no añade icono por defecto ni deja un span vacío; conserva solo los iconos explícitos con significado (usuarios, avisos e historial).
- src/styles.css: eliminadas las dos reglas de header-decoration, en PC y móvil. No se cambiaron las dimensiones, escala, distribución, botones, marcos, sombras ni gráficos originales.
- tests/revision_sin_brillos.mjs: prueba suministrada por el paquete.

11/11 pruebas aprobadas con node --test tests/*.test.js tests/revision_sin_brillos.mjs. Validación estructural de Corrección 02 aprobada. Búsqueda en src e index.html sin símbolos ornamentales ni clases de decoración restantes.

Revisión automatizada en seis tamaños: 1649×928, 1280×720, 373×734, 390×844, 360×640 y 844×390. Sin errores de consola, imágenes rotas o scroll horizontal. Se inspeccionaron visualmente los resúmenes de 1649×928 y 390×844: Inicio, Perfil, Usuarios, Inventario, Minijuegos, Tienda y diálogos de acceso, notificaciones, asistencia, cierre de sesión, historial y álbum. Contextos nuevos de Edge/Chromium con zoom predeterminado, sin modificar el zoom de la ventana personal del usuario.

Capturas actualizadas en docs/capturas-correccion-01; resúmenes 1649x928-sin-brillos.png y 390x844-sin-brillos.png. Las funciones de navegación, selección local de Perrilogos y cierre de diálogos siguen aprobadas. Supabase y minijuegos intactos.
