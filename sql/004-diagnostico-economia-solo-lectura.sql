-- Diagnóstico exclusivamente de lectura. No instala ni modifica funciones, permisos o datos.
SELECT p.oid::regprocedure AS firma,pg_get_userbyid(p.proowner) AS propietario,
 p.proargnames AS parametros,pg_get_function_arguments(p.oid) AS argumentos,
 pg_get_function_result(p.oid) AS retorno,l.lanname AS lenguaje,p.prosecdef AS security_definer,
 p.proconfig AS configuracion,p.proacl AS permisos,
 md5(btrim(translate(p.prosrc,chr(13),''),E' \n\t')) AS hash_cuerpo,
 pg_get_functiondef(p.oid) AS definicion_completa
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
WHERE n.nspname='public' AND p.proname='pw2_economy_operation';
-- Debe existir exactamente una fila con la firma y parámetros revisados en 004.
-- Hash canónico 001: 470869e0766c3596b46d6c5ee7834d90. Hash real revisado: 2aa000dbbb080f04b029e2fd687f39eb.
-- Hash corregido 004: 10a0758a39ca77c04cb0301e447bfe9c.
-- Si no coincide, NO ejecutar 001 ni adaptar automáticamente: revisar el cuerpo real completo.
