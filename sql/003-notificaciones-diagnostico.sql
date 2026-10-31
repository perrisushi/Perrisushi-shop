-- Opcional y exclusivamente de lectura: comprobar el esquema real antes de aplicar 003.
BEGIN READ ONLY;
SELECT column_name,data_type,is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('shop_inventories','shop_notifications')
ORDER BY table_name,ordinal_position;
SELECT c.relname AS tabla,t.tgname,pg_get_triggerdef(t.oid) AS disparador,
 p.proname,pg_get_functiondef(p.oid) AS funcion_actual
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal AND
 (c.relname IN ('shop_inventories','shop_random_key_tickets','shop_notifications')
 OR pg_get_functiondef(p.oid) ILIKE '%shop_notifications%')
ORDER BY c.relname,t.tgname;
SELECT kind,count(*) AS total FROM public.shop_notifications GROUP BY kind ORDER BY kind;
ROLLBACK;
