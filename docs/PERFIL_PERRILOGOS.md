# Perfil, historial y Perrilogos — 28/10/2026

Se añadieron al perfil un botón cuadrado accesible para Historial y el botón Cambiar Perrilogos. Ambos abren diálogos con cierre por Escape, X y fondo. Se conserva el acceso previo y la composición compacta móvil.

El historial muestra un estado pendiente de conexión sin movimientos inventados. El álbum permite previsualizar los quince logos incluidos y actualiza tanto el perfil como el avatar superior. La selección se mantiene en memoria durante la navegación y se restablece al recargar; no guarda cambios en cuentas. Solo admite identificadores del catálogo permitido.

Las secciones Encontrados y Desconocidos informan de que no se conoce la colección mientras no se conecte la cuenta. El catálogo de vista previa no representa logos desbloqueados. No se modificaron Supabase, economía ni minijuegos.

Archivos: src/main.js, src/styles.css y tools/review-ui.cjs. Las pruebas de navegador comprueban ambos diálogos, selección de Búho, coincidencia de los dos avatares, estado pendiente de colección, foco y ausencia de scroll en el perfil móvil (373×734, 390×844 y 360×640). Capturas en docs/capturas-correccion-01, con sufijos history y album. El álbum permite scroll para ver el catálogo completo; el perfil cabe sin scroll en esos tamaños.
