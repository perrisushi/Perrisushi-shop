-- Diagnóstico exclusivamente de lectura. NO asigna permisos.
-- Ejecutar completo en el editor SQL del proyecto real y conservar el resultado.
-- No contiene contraseñas, hashes, correos, tokens ni datos económicos.
BEGIN TRANSACTION READ ONLY;
WITH relations AS (
 SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('shop_players','shop_access','shop_sessions','pw2_google_links')
), columns AS (
 SELECT r.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS data_type,a.attnotnull
 FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid
 WHERE a.attnum>0 AND NOT a.attisdropped
), keys AS (
 SELECT r.relname,c.conname,c.contype,pg_get_constraintdef(c.oid) AS definition
 FROM relations r JOIN pg_constraint c ON c.conrelid=r.oid
 WHERE c.contype IN ('p','u','f')
), players AS (
 SELECT p.nick,to_jsonb(p) AS row_data FROM public.shop_players p
 WHERE lower(btrim(p.nick))=lower('Perrisushi')
), access AS (
 SELECT a.nick,to_jsonb(a) AS row_data FROM public.shop_access a
 WHERE lower(btrim(a.nick))=lower('Perrisushi')
), candidates AS (
 SELECT 'shop_players' AS source,nick,row_data FROM players
 UNION ALL SELECT 'shop_access',nick,row_data FROM access
), safe_accounts AS (
 SELECT source,nick,nick='Perrisushi' AS exact_match,
 row_data->'active' AS active,
 CASE WHEN source='shop_access' THEN row_data->'is_admin' ELSE NULL END AS legacy_is_admin,
 coalesce((SELECT jsonb_object_agg(col.attname,c.row_data->col.attname)
 FROM columns col WHERE col.relname=c.source
 AND (col.data_type='uuid' OR col.attname IN ('id','user_id','player_id','account_id'))),'{}'::jsonb) AS identifier_candidates
 FROM candidates c
), counts AS (
 SELECT (SELECT count(*) FROM players WHERE nick='Perrisushi') AS exact_players,
 (SELECT count(*) FROM access WHERE nick='Perrisushi') AS exact_access,
 (SELECT count(*) FROM players) AS normalized_players,
 (SELECT count(*) FROM access) AS normalized_access
)
SELECT jsonb_build_object(
 'target','Perrisushi',
 'assignment_performed',false,
 'identity_check',CASE WHEN exact_players=1 AND exact_access=1 AND normalized_players=1 AND normalized_access=1
 THEN 'exact_account_unique_review_identifier' ELSE 'STOP_missing_or_ambiguous_account' END,
 'counts',to_jsonb(counts),
 'accounts',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY source,nick) FROM safe_accounts s),'[]'::jsonb),
 'columns',coalesce((SELECT jsonb_agg(to_jsonb(col) ORDER BY relname,attname) FROM columns col),'[]'::jsonb),
 'constraints',coalesce((SELECT jsonb_agg(to_jsonb(k) ORDER BY relname,conname) FROM keys k),'[]'::jsonb),
 'legacy_admin_accounts',coalesce((SELECT jsonb_agg(a.nick ORDER BY a.nick) FROM public.shop_access a
 WHERE to_jsonb(a)->'is_admin'='true'::jsonb),'[]'::jsonb),
 'note','La unicidad del nick no acredita por sí sola un identificador estable. Revisar identificadores y restricciones antes de preparar la asignación.'
) AS admin_identity_diagnostic FROM counts;
ROLLBACK;
