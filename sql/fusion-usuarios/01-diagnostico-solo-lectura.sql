-- PerriWeb: PASO 1. SOLO LECTURA. No crea funciones, tablas ni índices.
-- Ejecutar todo y exportar el resultado JSON. No contiene filas de contraseñas/tokens.
WITH
pairs(keep_nick,remove_nick) AS (
 VALUES ('Isoldequeen','isoldequeen'),('Kazzialtime','KazzialTime'),('Sr_vic_','Sr_Vic_')
),
relations AS (
 SELECT c.oid,n.nspname AS schema_name,c.relname AS table_name,c.relkind,
        c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
        pg_get_userbyid(c.relowner) AS owner,
        has_table_privilege(c.oid,'SELECT') AS can_select
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname NOT IN ('information_schema')
 AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN ('r','p','f','v','m')
),
table_info AS (
 SELECT r.schema_name,r.table_name,r.relkind,r.rls,r.force_rls,r.owner,r.can_select,
 coalesce((
  SELECT jsonb_agg(jsonb_build_object(
   'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'base_type',t.typname,'category',t.typcategory,
   'nullable',NOT a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,
   'default',CASE WHEN a.attname ~* '(password|code_hash|secret|credential|token|^key$)' AND d.adbin IS NOT NULL THEN '[REDACTED]' ELSE pg_get_expr(d.adbin,d.adrelid) END,
   'collation',CASE WHEN a.attcollation<>0 THEN a.attcollation::regcollation::text END
  ) ORDER BY a.attnum)
  FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
 ),'[]'::jsonb) AS columns
 FROM relations r
),
constraint_info AS (
 SELECT r.schema_name,r.table_name,k.conname AS name,k.contype AS kind,
 pg_get_constraintdef(k.oid,true) AS definition,k.condeferrable AS deferrable,
 k.condeferred AS initially_deferred,k.convalidated AS validated,
 ARRAY(SELECT a.attname FROM unnest(k.conkey) WITH ORDINALITY z(num,ord)
       JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=z.num ORDER BY z.ord) AS columns,
 rn.nspname AS reference_schema,rc.relname AS reference_table,
 ARRAY(SELECT a.attname FROM unnest(k.confkey) WITH ORDINALITY z(num,ord)
       JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=z.num ORDER BY z.ord) AS reference_columns,
 k.confdeltype AS on_delete,k.confupdtype AS on_update
 FROM pg_constraint k JOIN relations r ON r.oid=k.conrelid
 LEFT JOIN pg_class rc ON rc.oid=k.confrelid
 LEFT JOIN pg_namespace rn ON rn.oid=rc.relnamespace
),
index_info AS (
 SELECT r.schema_name,r.table_name,ic.relname AS name,x.indisunique AS is_unique,
 x.indisprimary AS is_primary,x.indisvalid AS valid,
 pg_get_indexdef(x.indexrelid) AS definition
 FROM relations r JOIN pg_index x ON x.indrelid=r.oid JOIN pg_class ic ON ic.oid=x.indexrelid
),
trigger_info AS (
 SELECT r.schema_name,r.table_name,t.tgname AS name,t.tgenabled AS enabled,
 t.tgtype AS trigger_type,
 pn.nspname AS function_schema,p.proname AS function_name
 FROM relations r JOIN pg_trigger t ON t.tgrelid=r.oid
 JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
 WHERE NOT t.tgisinternal
),
all_nicks AS (
 SELECT nick FROM public.shop_players UNION SELECT nick FROM public.shop_access
),
duplicate_info AS (
 SELECT lower(btrim(nick)) AS normalized_nick,
 jsonb_agg(nick ORDER BY nick COLLATE "C") AS nicks,count(*) AS size
 FROM all_nicks GROUP BY lower(btrim(nick)) HAVING count(*)>1
),
catalog AS (
 SELECT jsonb_build_object(
  'tables',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema_name,table_name) FROM table_info x),'[]'::jsonb),
  'constraints',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema_name,table_name,name) FROM constraint_info x),'[]'::jsonb),
  'indexes',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema_name,table_name,name) FROM index_info x),'[]'::jsonb),
  'triggers',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema_name,table_name,name) FROM trigger_info x),'[]'::jsonb),
  'policies',coalesce((SELECT jsonb_agg(jsonb_build_object('schema',p.schemaname,'table',p.tablename,'name',p.policyname,'roles',p.roles,'command',p.cmd,'permissive',p.permissive) ORDER BY schemaname,tablename,policyname) FROM pg_policies p WHERE schemaname NOT LIKE 'pg_%'),'[]'::jsonb)
 ) AS document
)
SELECT jsonb_build_object(
 'format','pw2-account-merge-schema-v1',
 'captured_at',transaction_timestamp(),
 'operator',jsonb_build_object('role',current_user,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,'database',current_database(),'postgres',current_setting('server_version')),
 'pairs',(SELECT jsonb_agg(jsonb_build_object('keep',keep_nick,'remove',remove_nick) ORDER BY keep_nick) FROM pairs),
 'duplicates',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY normalized_nick) FROM duplicate_info d),'[]'::jsonb),
 'catalog',catalog.document,
 'catalog_fingerprint',md5(catalog.document::text)
) AS diagnostic
FROM catalog JOIN pg_roles r ON r.rolname=current_user;
