-- SOLO LECTURA. Sustituir TU_USUARIO por el nick, nunca por la contraseña.
-- Si el nick contiene un apóstrofo, duplicarlo: O'Neil -> O''Neil.
-- Ejecutar manualmente en el proyecto real. No crea funciones ni modifica datos.
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
WITH supplied(nick) AS (VALUES ('TU_USUARIO'::text))
SELECT
 (SELECT count(*) FROM public.shop_access a,supplied s WHERE a.nick=s.nick) AS access_exact,
 (SELECT count(*) FROM public.shop_access a,supplied s WHERE a.nick=chr(34)||btrim(s.nick)||chr(34)) AS access_with_added_quotes,
 (SELECT count(*) FROM public.shop_access a,supplied s WHERE lower(a.nick)=lower(btrim(s.nick))) AS access_case_insensitive,
 (SELECT count(*) FROM public.shop_access a,supplied s WHERE lower(btrim(a.nick))=lower(btrim(s.nick))) AS access_trimmed,
 (SELECT count(*) FROM public.shop_players p,supplied s WHERE lower(p.nick)=lower(btrim(s.nick))) AS players_case_insensitive,
 (SELECT count(*) FROM public.shop_access a JOIN public.shop_players p ON p.nick=a.nick,supplied s WHERE lower(a.nick)=lower(btrim(s.nick))) AS access_player_link,
 (SELECT count(*) FROM public.shop_access a,supplied s WHERE lower(a.nick)=lower(btrim(s.nick)) AND a.active IS FALSE) AS access_disabled;

SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS rls_forced,
 has_table_privilege('service_role',c.oid,'SELECT') AS service_role_can_select
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('shop_access','shop_players');
ROLLBACK;
