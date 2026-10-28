-- Ejecutar MANUALMENTE. No borra datos ni altera tablas existentes.
-- Reutiliza las columnas/PK de shop_operations e inventarios del esquema legado.
BEGIN;
CREATE OR REPLACE FUNCTION public.pw2_economy_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public
AS $$ SELECT jsonb_build_object('version',1,'transactional',true); $$;

CREATE OR REPLACE FUNCTION public.pw2_economy_operation(
 p_nick text,p_operation uuid,p_action text,p_price integer DEFAULT NULL,p_max integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='8s'
AS $$
DECLARE
 op text := 'pw2:economy:'||p_operation::text;
 prior public.shop_operations%ROWTYPE;
 inv public.shop_inventories%ROWTYPE;
 ticket public.shop_random_key_tickets%ROWTYPE;
 stock public.shop_random_key_pool%ROWTYPE;
 result jsonb;
 request jsonb := jsonb_build_object('price',p_price,'max',p_max);
BEGIN
 IF p_operation IS NULL OR p_nick IS NULL OR length(p_nick) NOT BETWEEN 1 AND 80
  OR p_action NOT IN ('random-redeem','raffle-buy') OR p_action IS NULL THEN
  RAISE EXCEPTION 'invalid_operation';
 END IF;
 -- Cada operation_id se serializa en todas las instancias/procesos.
 PERFORM pg_advisory_xact_lock(hashtextextended('pw2:shared-games-economy',0));
 PERFORM pg_advisory_xact_lock(hashtextextended(op,0));
 SELECT * INTO prior FROM public.shop_operations WHERE operation_id=op;
 IF FOUND THEN
  IF prior.nick<>p_nick OR prior.action<>p_action OR prior.response->'request' IS DISTINCT FROM request THEN
   RAISE EXCEPTION 'operation_conflict';
  END IF;
  RETURN prior.response->'result';
 END IF;
 PERFORM 1 FROM public.shop_access WHERE nick=p_nick AND active IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'account_inactive'; END IF;
 PERFORM 1 FROM public.shop_players WHERE nick=p_nick AND active IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'account_inactive'; END IF;
 -- El bloqueo del inventario también serializa gastos distintos de la misma cuenta.
 SELECT * INTO inv FROM public.shop_inventories WHERE nick=p_nick FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'inventory_missing'; END IF;
 IF p_action='raffle-buy' THEN
  IF p_price IS NULL OR p_price<=0 OR p_max IS NULL OR p_max NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'raffle_policy_missing';
  END IF;
  IF inv.pc IS NULL OR inv.pc<p_price THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  IF inv.boleto_sorteo2 IS NULL OR inv.boleto_sorteo2<0 THEN RAISE EXCEPTION 'invalid_balance'; END IF;
  IF inv.boleto_sorteo2>=p_max THEN RAISE EXCEPTION 'ticket_limit'; END IF;
  UPDATE public.shop_inventories SET pc=pc-p_price,boleto_sorteo2=boleto_sorteo2+1,updated_at=now()
   WHERE nick=p_nick RETURNING * INTO inv;
  UPDATE public.shop_public_users SET pc=inv.pc,updated_at=now() WHERE nick=p_nick;
  INSERT INTO public.shop_activity(nick,game,result,details,created_at)
   VALUES(p_nick,'Tienda','Compra Boleto de Sorteo 2','1 boleto por '||p_price::text||' PC',now());
  result:=jsonb_build_object('ok',true,'operationId',p_operation,'kind',p_action,'pc',inv.pc,'tickets',inv.boleto_sorteo2);
 ELSE
  IF p_price IS NOT NULL OR p_max IS NOT NULL THEN RAISE EXCEPTION 'invalid_operation'; END IF;
  IF inv.random_key IS NULL OR inv.random_key<=0 THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  SELECT * INTO ticket FROM public.shop_random_key_tickets
   WHERE nick=p_nick AND status='Activa' AND expires_at>now()
   ORDER BY obtained_at,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_active_ticket'; END IF;
  LOOP
   SELECT * INTO stock FROM public.shop_random_key_pool s
    WHERE s.status='Disponible' AND s.key IS NOT NULL AND length(trim(s.key))>0
     AND NOT EXISTS(SELECT 1 FROM public.shop_random_key_claims c WHERE lower(btrim(c.key))=lower(btrim(s.key)))
    ORDER BY random() LIMIT 1 FOR UPDATE SKIP LOCKED;
   IF NOT FOUND THEN RAISE EXCEPTION 'no_stock'; END IF;
   -- Protege también claves duplicadas en filas distintas del pool heredado.
   PERFORM pg_advisory_xact_lock(hashtextextended('pw2:key:'||lower(btrim(stock.key)),0));
   EXIT WHEN NOT EXISTS(SELECT 1 FROM public.shop_random_key_claims WHERE lower(btrim(key))=lower(btrim(stock.key)));
  END LOOP;
  UPDATE public.shop_random_key_tickets SET status='Canjeada',updated_at=now() WHERE id=ticket.id;
  UPDATE public.shop_random_key_pool SET status='Entregada',assigned_to=p_nick,delivered_at=now() WHERE id=stock.id;
  INSERT INTO public.shop_random_key_claims(id,nick,game,key,claimed_at)
   VALUES(p_operation,p_nick,stock.game,btrim(stock.key),now());
  UPDATE public.shop_inventories SET random_key=random_key-1,updated_at=now() WHERE nick=p_nick RETURNING * INTO inv;
  INSERT INTO public.shop_activity(nick,game,result,details,created_at)
   VALUES(p_nick,'Random Key','Canje '||stock.game,'Juego: '||stock.game,now());
  result:=jsonb_build_object('ok',true,'operationId',p_operation,'kind',p_action,'balance',inv.random_key,
    'redeemed',jsonb_build_object('game',stock.game,'key',btrim(stock.key)));
 END IF;
 -- Si falla esta inserción o cualquier paso anterior, PostgreSQL revierte TODO.
 INSERT INTO public.shop_operations(operation_id,action,nick,response,created_at)
  VALUES(op,p_action,p_nick,jsonb_build_object('request',request,'result',result),now());
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.pw2_economy_status() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pw2_economy_operation(text,uuid,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pw2_economy_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.pw2_economy_operation(text,uuid,text,integer,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
