# Administración: estado actual

El propietario ha confirmado que Perrisushi existe, está activa y es la única cuenta con shop_access.is_admin=true. Ambas tablas usan nick como clave primaria.

Se utiliza el permiso existente después de autenticar la sesión. No es necesaria una migración UUID ni otra asignación de permisos. No hace falta repetir el diagnóstico.

La implementación, sus comprobaciones y las funcionalidades pendientes se documentan en ../../docs/administracion-local.md.

01-verificar-perrisushi-solo-lectura.sql se conserva únicamente como diagnóstico opcional; no modifica datos ni concede permisos. No es un requisito para utilizar el código nuevo.
