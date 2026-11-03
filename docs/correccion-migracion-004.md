# Corrección y adaptación vigente de SQL 004

La versión actual y el informe completo se encuentran en [adaptacion-004-supabase-real.md](adaptacion-004-supabase-real.md).

Se mantiene la corrección del CHECK: las sanciones temporales exigen expiración no nula, finita y posterior al inicio. Una fila antigua inválida cancela la migración sin inventar datos. La expiración permite acceso sin cron; al registrar otra sanción se cierra la fila vencida antes del INSERT, conservando su historial y liberando el índice de una sanción activa.

La revisión anterior aceptaba únicamente el formato canónico local de la función y mantenía el canje legado de Random Key. Ha quedado sustituida por una versión que reconoce la exportación real revisada, comprueba cuenta y sanciones antes de cualquier recibo, cierra los nuevos canjes y cuenta reservas pendientes para el límite cuatro. El cuerpo SQL es completo y explícito; no se parchea mediante reemplazos dinámicos.

No se ha ejecutado SQL en producción ni hecho Commit, Push o despliegue.
