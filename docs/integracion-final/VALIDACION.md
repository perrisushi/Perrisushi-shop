# Validación de la integración

Resultado final: 54/54 pruebas automáticas superadas (incluidas las cinco del ZIP), seis tamaños de navegador, 91 peticiones a la API local, cero errores JavaScript y construcción de 87 archivos públicos. Capturas revisadas: perfil móvil 360×640 completo, inventario PC con iconos y álbum móvil tras selección. Ninguna petición a Supabase real.

Los tests del adaptador suministrado se han ejecutado como referencia, sin desplegar ese adaptador duplicado ni su código legacy. La aplicación utiliza el backend existente ampliado.

Cambios: autenticación canónica con comparación SHA-256 heredada y contraseña recortada igual que el legado, consulta literal acotada sin comodines; usuarios públicos paginados desde shop_public_users; perfil y saldos personales; catálogo paginado; iconos originales de objetos sin alterar cantidades; cambio de avatar poseído con comprobación JSONB atómica en PATCH; notificaciones propias con UUID/CSRF y filtro nick; construcción pública cerrada, servidor Railway y proxy Pages opcional autenticado.

Las operaciones GET no escriben; el login local usa sesiones en memoria. El servidor no concede logos predeterminados, no crea filas faltantes, no canjea ni entrega premios. Si falta conexión o un registro, informa de ello. La selección de avatar no actualiza el snapshot público antiguo: verificar su mecanismo de actualización antes del lanzamiento. Los IDs y rutas de catálogo sin recurso local se muestran de forma genérica y no se permiten seleccionar; no se cargan URLs arbitrarias del servidor.

La estructura de minijuegos y la hoja de escalado de escritorio se verifican por SHA-256 contra la entrega aprobada. Se conserva la navegación y el diseño PC/móvil. Se eliminó el texto de previsualización de la interfaz y un desplazamiento automático innecesario al seleccionar objetos.

Pruebas automáticas:

```powershell
node --test tests/*.test.js tests/revision_sin_brillos.mjs tests/revision-04.mjs tests/validacion-estructural.mjs .integracion-final/pruebas/compat.test.mjs
node tools/verify-integration-final.mjs
node scripts/build.mjs
```

El comando primero incluye cinco pruebas de referencia dentro del ZIP extraído e ignorado por Git. Tras publicar el repositorio, el comando normal `node --test tests/*.test.js tests/revision_sin_brillos.mjs tests/revision-04.mjs tests/validacion-estructural.mjs` conserva todas las pruebas del producto; no depende de los archivos legacy.

El E2E usa exclusivamente un repositorio de laboratorio aislado. Cubre acceso, lecturas, paginación, inventario con más de 24 objetos, avatar encontrado/desconocido, notificación leída, logout, bloqueo de archivos privados, errores de conexión y ausencia de peticiones externas. Tamaños: 1649×928, 1280×720, 1024×768, 390×844, 360×800 y 360×640. Capturas en capturas/ y resultado en browser-results.json. Las cuentas y claves de estas pruebas solo existen en tests/tools, nunca en las pantallas normales ni en dist.

Ninguna prueba con Supabase real ha sido posible sin credenciales de servidor y una cuenta propia autorizada. No se afirma validación real ni producción. El resultado del test unitario, la revisión de capturas y la construcción local no sustituyen esa comprobación final.
