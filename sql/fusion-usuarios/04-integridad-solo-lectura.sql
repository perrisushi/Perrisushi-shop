-- SOLO LECTURA. Comprobaciones adicionales para las tres parejas reales.
-- No devuelve contraseñas, hashes, tokens ni claves de juegos.
WITH
pairs(keep_nick,remove_nick) AS (
 VALUES ('Isoldequeen','isoldequeen'),('Kazzialtime','KazzialTime'),('Sr_vic_','Sr_Vic_')
),
nicks AS (SELECT keep_nick AS nick FROM pairs UNION ALL SELECT remove_nick FROM pairs),
access_review AS (
 SELECT p.keep_nick,p.remove_nick,a.nick IS NOT NULL AS survivor_access_present,
 b.nick IS NOT NULL AS absorbed_access_present,a.active AS survivor_active,b.active AS absorbed_active,
 a.is_admin AS survivor_is_admin,b.is_admin AS absorbed_is_admin,
 btrim(a.code_hash) ~* '^[a-f0-9]{64}$' AS survivor_has_traditional_password,
 btrim(b.code_hash) ~* '^[a-f0-9]{64}$' AS absorbed_has_traditional_password,
 CASE WHEN a.code_hash IS NOT NULL AND b.code_hash IS NOT NULL THEN lower(btrim(a.code_hash))=lower(btrim(b.code_hash)) END AS same_password_hash,
 a.free_cards_day AS survivor_cards_day,b.free_cards_day AS absorbed_cards_day,
 a.free_duelo_day AS survivor_duel_day,b.free_duelo_day AS absorbed_duel_day,
 a.daily_pass_season_id AS survivor_pass_season,b.daily_pass_season_id AS absorbed_pass_season,
 a.daily_pass_claimed_days AS survivor_pass_days,b.daily_pass_claimed_days AS absorbed_pass_days,
 a.daily_pass_last_claim_day AS survivor_last_claim,b.daily_pass_last_claim_day AS absorbed_last_claim
 FROM pairs p LEFT JOIN public.shop_access a ON a.nick=p.keep_nick
 LEFT JOIN public.shop_access b ON b.nick=p.remove_nick
),
resource_review AS (
 SELECT p.keep_nick,p.remove_nick,a.nick IS NOT NULL AS survivor_inventory_present,
 b.nick IS NOT NULL AS absorbed_inventory_present,
 (SELECT coalesce(jsonb_object_agg(r.key,jsonb_build_object(
  'before_survivor',a.resource->>r.key,'before_absorbed',b.resource->>r.key,
  'after_proposed',CASE WHEN a.nick IS NOT NULL AND b.nick IS NOT NULL AND a.resource->>r.key IS NOT NULL AND b.resource->>r.key IS NOT NULL
   THEN (((a.resource->>r.key)::numeric)+((b.resource->>r.key)::numeric))::text END,
  'negative_input',coalesce((a.resource->>r.key)::numeric<0 OR (b.resource->>r.key)::numeric<0,false),
  'exceeds_integer',coalesce(((a.resource->>r.key)::numeric)+((b.resource->>r.key)::numeric)>2147483647,false)
 ) ORDER BY r.key),'{}'::jsonb)
 FROM (SELECT key FROM jsonb_each(coalesce(a.resource,'{}'::jsonb)) WHERE jsonb_typeof(value)='number'
       UNION SELECT key FROM jsonb_each(coalesce(b.resource,'{}'::jsonb)) WHERE jsonb_typeof(value)='number') r) AS resources
 FROM pairs p
 LEFT JOIN LATERAL (SELECT i.nick,to_jsonb(i)-'nick'-'updated_at' AS resource FROM public.shop_inventories i WHERE i.nick=p.keep_nick) a ON true
 LEFT JOIN LATERAL (SELECT i.nick,to_jsonb(i)-'nick'-'updated_at' AS resource FROM public.shop_inventories i WHERE i.nick=p.remove_nick) b ON true
),
tickets AS (
 SELECT n.nick,count(t.id)::text AS total,
 count(t.id) FILTER(WHERE t.status='Activa' AND t.expires_at>transaction_timestamp())::text AS valid,
 count(t.id) FILTER(WHERE t.expires_at<=transaction_timestamp())::text AS expired
 FROM nicks n LEFT JOIN public.shop_random_key_tickets t ON t.nick=n.nick GROUP BY n.nick
),
chests AS (
 SELECT n.nick,c.chest_type,count(c.chest_id)::text AS total_records,
 count(c.chest_id) FILTER(WHERE c.status='available' AND c.expires_at>transaction_timestamp())::text AS available_unexpired,
 count(c.chest_id) FILTER(WHERE c.status='available' AND c.expires_at<=transaction_timestamp())::text AS expired_available_records,
 count(c.chest_id) FILTER(WHERE c.status='opened')::text AS opened
 FROM nicks n LEFT JOIN public.shop_inventory_chests c ON c.nick=n.nick GROUP BY n.nick,c.chest_type
),
related_key_values AS (
 SELECT game,btrim(key) AS key_value FROM public.shop_random_key_claims WHERE nick IN(SELECT nick FROM nicks)
 UNION SELECT game,btrim(key) FROM public.shop_random_key_pool WHERE assigned_to IN(SELECT nick FROM nicks)
),
key_review AS (
 SELECT k.game,
 (SELECT count(*) FROM public.shop_random_key_claims c WHERE c.game=k.game AND btrim(c.key)=k.key_value)::text AS claim_count,
 (SELECT count(*) FROM public.shop_random_key_pool s WHERE s.game=k.game AND btrim(s.key)=k.key_value)::text AS pool_count,
 (SELECT coalesce(jsonb_agg(c.id::text ORDER BY c.id),'[]'::jsonb) FROM public.shop_random_key_claims c WHERE c.game=k.game AND btrim(c.key)=k.key_value) AS claim_ids,
 (SELECT coalesce(jsonb_agg(s.id::text ORDER BY s.id),'[]'::jsonb) FROM public.shop_random_key_pool s WHERE s.game=k.game AND btrim(s.key)=k.key_value) AS pool_ids,
 (SELECT count(DISTINCT nick) FROM (
  SELECT nick FROM public.shop_random_key_claims c WHERE c.game=k.game AND btrim(c.key)=k.key_value
  UNION SELECT assigned_to FROM public.shop_random_key_pool s WHERE s.game=k.game AND btrim(s.key)=k.key_value AND assigned_to IS NOT NULL
 ) owners)::text AS different_owners
 FROM related_key_values k
),
sessions AS (
 SELECT n.nick,count(s.token)::text AS total,count(s.token) FILTER(WHERE s.expires_at>transaction_timestamp())::text AS active
 FROM nicks n LEFT JOIN public.shop_sessions s ON s.nick=n.nick GROUP BY n.nick
),
public_cache AS (
 SELECT i.nick,i.pc::text AS inventory_pc,u.pc::text AS public_pc,
 u.pc IS DISTINCT FROM i.pc AS mismatch
 FROM public.shop_inventories i LEFT JOIN public.shop_public_users u ON u.nick=i.nick
 WHERE i.nick IN(SELECT nick FROM nicks)
)
SELECT jsonb_build_object(
 'format','pw2-account-merge-integrity-v1','captured_at',transaction_timestamp(),
 'access',(SELECT jsonb_agg(to_jsonb(x) ORDER BY keep_nick) FROM access_review x),
 'resources',(SELECT jsonb_agg(to_jsonb(x) ORDER BY keep_nick) FROM resource_review x),
 'random_key_tickets',(SELECT jsonb_agg(to_jsonb(x) ORDER BY nick) FROM tickets x),
 'chest_records',(SELECT jsonb_agg(to_jsonb(x) ORDER BY nick,chest_type) FROM chests x),
 'duplicate_key_groups',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY game,claim_ids::text) FROM key_review x WHERE claim_count::numeric>1 OR pool_count::numeric>1 OR different_owners::numeric>1),'[]'::jsonb),
 'sessions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY nick) FROM sessions x),
 'public_pc_cache',(SELECT jsonb_agg(to_jsonb(x) ORDER BY nick) FROM public_cache x),
 'notice','SUMAS PROPUESTAS, no fusión ejecutada. No sumar otra vez tickets/cofres de historial a los contadores.'
) AS integrity_review;
