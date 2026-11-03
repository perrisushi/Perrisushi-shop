# Administración de PerriWeb

La primera fase local ya se ha ampliado. La documentación vigente, migración nueva, pruebas y límites se encuentran en [administracion-ampliada.md](administracion-ampliada.md).

Se utiliza shop_access.is_admin después de validar la sesión. No es necesaria otra asignación de rol ni una migración de identificadores de usuario.

No se ha modificado producción, ni hecho Commit, Push o despliegue. La ampliación requiere revisar y aplicar manualmente únicamente sql/004-administracion-ampliada.sql antes de su activación; no hay que repetir las migraciones anteriores.
