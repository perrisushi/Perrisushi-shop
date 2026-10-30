-- EXCLUSIVAMENTE LECTURA. Revisar en el proyecto que se vaya a utilizar.
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN
 ('shop_access','shop_players','shop_sessions','shop_inventories','shop_profiles','shop_public_users')
ORDER BY table_name,ordinal_position;
SELECT lower(btrim(nick)) AS normalized_nick,count(*) AS accounts
FROM public.shop_players GROUP BY lower(btrim(nick)) HAVING count(*)>1;
SELECT n.nspname AS schema_name,c.relname AS table_name,t.tgname AS trigger_name
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND
 ((n.nspname='auth' AND c.relname='users') OR
  (n.nspname='public' AND c.relname IN ('shop_players','shop_access','shop_inventories','shop_profiles','shop_public_users')));
SELECT conrelid::regclass AS table_name,conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid IN
 ('public.shop_access'::regclass,'public.shop_players'::regclass,
  'public.shop_sessions'::regclass,'public.shop_inventories'::regclass,
  'public.shop_profiles'::regclass,'public.shop_public_users'::regclass);
-- No ejecuta ni imprime credenciales, contraseñas o hashes.
