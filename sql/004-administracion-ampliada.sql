-- Revisar y ejecutar MANUALMENTE. No crea usuarios ni modifica recursos existentes.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
-- No ejecutar 001 para sortear un error de este control: revisar primero la RPC real.
-- Versiones revisadas: exportación real 2aa000..., canónica 001 equivalente (solo formato/comentarios) y esta revisión.
-- Se conservan propietario y ACL; ninguna versión desconocida se acepta por aproximación.
SELECT pg_advisory_xact_lock(hashtextextended('pw2:shared-games-economy',0));
DO $economy_preflight$
DECLARE p pg_proc%ROWTYPE;
BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.pw2_economy_operation(text,uuid,text,integer,integer)');
 IF NOT FOUND THEN RAISE EXCEPTION 'RPC económica ausente; migración cancelada'; END IF;
 IF (SELECT count(*) FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
     WHERE n.nspname='public' AND f.proname='pw2_economy_operation')<>1
  OR p.proargnames IS DISTINCT FROM ARRAY['p_nick','p_operation','p_action','p_price','p_max']::text[]
  OR p.proowner<>'postgres'::regrole::oid
  OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL OR p.proleakproof
  OR p.proargtypes::text<>'25 2950 25 23 23' OR p.pronargdefaults<>2
  OR pg_get_expr(p.proargdefaults,0) IS DISTINCT FROM 'NULL::integer, NULL::integer'
  OR p.prorettype<>'jsonb'::regtype OR p.proretset OR p.prokind<>'f'
  OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
  OR p.prosecdef OR p.proisstrict OR p.provolatile<>'v' OR p.proparallel<>'u'
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public','lock_timeout=5s','statement_timeout=8s']::text[]
  OR md5(btrim(translate(p.prosrc,chr(13),''),E' \n\t')) NOT IN ('470869e0766c3596b46d6c5ee7834d90','2aa000dbbb080f04b029e2fd687f39eb','10a0758a39ca77c04cb0301e447bfe9c')
 THEN RAISE EXCEPTION 'RPC económica desconocida: firma, configuración o cuerpo no revisados; migración cancelada'; END IF;
 IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE a.privilege_type<>'EXECUTE' OR a.grantee NOT IN (p.proowner,'service_role'::regrole::oid)
       OR (a.grantee<>p.proowner AND a.is_grantable))
  OR NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE a.grantee='service_role'::regrole::oid AND a.privilege_type='EXECUTE')
 THEN RAISE EXCEPTION 'Permisos de RPC económica no revisados; migración cancelada'; END IF;
END $economy_preflight$;

DO $ownership$
DECLARE name text; relation regclass;
BEGIN
 FOREACH name IN ARRAY ARRAY['pw2_account_sanctions','pw2_store_products','pw2_store_purchases','pw2_raffles','pw2_raffle_entries','pw2_raffle_ticket_reservations','pw2_community_controls'] LOOP
  relation:=to_regclass('public.'||name);
  IF relation IS NOT NULL AND obj_description(relation,'pg_class') IS DISTINCT FROM 'pw2_admin_expansion_v1' THEN
   RAISE EXCEPTION 'La tabla % ya existe con un origen no verificado; revisar antes de continuar',name;
  END IF;
 END LOOP;
END $ownership$;

CREATE TABLE IF NOT EXISTS public.pw2_account_sanctions(
 id uuid PRIMARY KEY,nick text NOT NULL REFERENCES public.shop_players(nick) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('temporary','permanent')),
 starts_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','revoked','replaced')),
 reason text NOT NULL,actor text NOT NULL REFERENCES public.shop_players(nick) ON DELETE RESTRICT,
 closed_at timestamptz,closed_by text REFERENCES public.shop_players(nick) ON DELETE RESTRICT,close_reason text,
 supersedes uuid REFERENCES public.pw2_account_sanctions(id) ON DELETE RESTRICT,
 CHECK((status='active' AND closed_at IS NULL) OR (status<>'active' AND closed_at IS NOT NULL))
);
-- Adicional al CHECK antiguo, si existiera: no corregir silenciosamente filas inválidas.
ALTER TABLE public.pw2_account_sanctions DROP CONSTRAINT IF EXISTS pw2_sanction_expiration_valid;
ALTER TABLE public.pw2_account_sanctions ADD CONSTRAINT pw2_sanction_expiration_valid
 CHECK(isfinite(starts_at) AND ((kind='temporary' AND expires_at IS NOT NULL
  AND isfinite(expires_at) AND expires_at>starts_at) OR (kind='permanent' AND expires_at IS NULL)));
CREATE UNIQUE INDEX IF NOT EXISTS pw2_one_current_sanction ON public.pw2_account_sanctions(nick) WHERE status='active';
CREATE INDEX IF NOT EXISTS pw2_sanction_history ON public.pw2_account_sanctions(nick,starts_at DESC,id);
CREATE TABLE IF NOT EXISTS public.pw2_store_products(
 id uuid PRIMARY KEY,name text NOT NULL,category text NOT NULL CHECK(category IN ('logos','frames','accessory1','accessory2','utility')),
 reward_type text NOT NULL CHECK(reward_type IN ('logo','resource')),reward_id text NOT NULL,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000000),
 currency text NOT NULL CHECK(currency IN ('pc','polvo_gema')),price integer NOT NULL CHECK(price BETWEEN 1 AND 2147483647),
 stock integer CHECK(stock>=0),enabled boolean NOT NULL DEFAULT false,hidden boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((category='logos' AND reward_type='logo' AND currency='pc' AND quantity=1) OR (category='utility' AND reward_type='resource' AND currency='polvo_gema'))
);
CREATE TABLE IF NOT EXISTS public.pw2_store_purchases(
 id uuid PRIMARY KEY,product_id uuid NOT NULL REFERENCES public.pw2_store_products(id) ON DELETE RESTRICT,
 nick text NOT NULL REFERENCES public.shop_players(nick) ON DELETE RESTRICT,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pw2_raffles(
 id uuid PRIMARY KEY,name text NOT NULL,season text NOT NULL,
 ticket_field text NOT NULL CHECK(ticket_field IN ('boleto_sorteo2','mini_sorteo')),
 opens_at timestamptz NOT NULL,closes_at timestamptz NOT NULL CHECK(closes_at>opens_at),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','open','closed','drawn','archived')),
 version integer NOT NULL DEFAULT 1,winner text REFERENCES public.shop_players(nick) ON DELETE RESTRICT,
 winning_ticket integer,total_tickets integer,drawn_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pw2_one_open_raffle_per_ticket ON public.pw2_raffles(ticket_field) WHERE state='open';
CREATE TABLE IF NOT EXISTS public.pw2_raffle_entries(
 raffle_id uuid NOT NULL REFERENCES public.pw2_raffles(id) ON DELETE RESTRICT,
 nick text NOT NULL REFERENCES public.shop_players(nick) ON DELETE RESTRICT,
 tickets integer NOT NULL CHECK(tickets BETWEEN 1 AND 4),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(raffle_id,nick)
);
-- Respaldo inmutable de cada reserva: contador disponible -> inscripción, una sola transacción.
CREATE TABLE IF NOT EXISTS public.pw2_raffle_ticket_reservations(
 operation_id text PRIMARY KEY REFERENCES public.shop_operations(operation_id) ON DELETE RESTRICT,
 raffle_id uuid NOT NULL,nick text NOT NULL,
 ticket_field text NOT NULL CHECK(ticket_field IN ('boleto_sorteo2','mini_sorteo')),
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 4),
 available_before integer NOT NULL,available_after integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(raffle_id,nick) REFERENCES public.pw2_raffle_entries(raffle_id,nick) ON DELETE RESTRICT,
 CHECK(available_before>=quantity AND available_after=available_before-quantity AND available_after>=0)
);
CREATE INDEX IF NOT EXISTS pw2_raffle_reservation_entry ON public.pw2_raffle_ticket_reservations(raffle_id,nick);
-- No fabricar respaldo de inscripciones antiguas. Una instalación previa con entradas requiere revisión.
DO $entries_preflight$
BEGIN
 IF EXISTS(SELECT 1 FROM public.pw2_raffle_entries e
   JOIN public.pw2_raffles r ON r.id=e.raffle_id
   LEFT JOIN public.pw2_raffle_ticket_reservations b USING(raffle_id,nick)
   LEFT JOIN public.shop_operations o ON o.operation_id=b.operation_id
   GROUP BY e.raffle_id,e.nick,e.tickets HAVING e.tickets<>coalesce(sum(b.quantity),0)
    OR NOT coalesce(bool_and(coalesce(b.ticket_field=r.ticket_field AND o.nick=e.nick AND o.action='raffle-register'
     AND b.operation_id='pw2:raffle-register:'||lower(o.response->'result'->>'operationId')
     AND lower(o.response->'result'->>'raffleId')=r.id::text
     AND o.response->'result'->'reservation'=jsonb_build_object('quantity',b.quantity,'ticketField',b.ticket_field,
       'availableBefore',b.available_before,'availableAfter',b.available_after),false)),false))
 THEN RAISE EXCEPTION 'Inscripciones sin respaldo verificable; conservar historial y revisar antes de migrar'; END IF;
END $entries_preflight$;
CREATE TABLE IF NOT EXISTS public.pw2_community_controls(
 scope text PRIMARY KEY CHECK(scope IN ('announcement','shop','raffles','PerriPet','PerriRPG','PerriCasillas','PerriDuelos')),
 active boolean NOT NULL DEFAULT false,message text NOT NULL DEFAULT '',version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now()
);
-- La misma comprobación se utiliza por backend y por la operación económica existente.
CREATE OR REPLACE FUNCTION public.pw2_assert_account_available(p_nick text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF row_security_active('public.pw2_account_sanctions'::regclass) THEN RAISE EXCEPTION 'moderation_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM public.pw2_account_sanctions WHERE nick=p_nick AND status='active' AND (expires_at IS NULL OR expires_at>clock_timestamp()))
 THEN
  IF EXISTS(SELECT 1 FROM public.pw2_account_sanctions WHERE nick=p_nick AND status='active' AND kind='permanent') THEN
   RAISE EXCEPTION 'account_banned';
  END IF;
  RAISE EXCEPTION 'account_suspended';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.pw2_assert_service_available(p_scope text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF row_security_active('public.pw2_community_controls'::regclass) THEN RAISE EXCEPTION 'service_maintenance'; END IF;
 IF EXISTS(SELECT 1 FROM public.pw2_community_controls WHERE scope=p_scope AND active IS TRUE)
 THEN RAISE EXCEPTION 'service_maintenance'; END IF;
END $$;
-- Definición explícita revisada contra la exportación real de Supabase.
-- Preserva la compra y sus recibos; Random Key queda retirada también de la RPC.
CREATE OR REPLACE FUNCTION public.pw2_economy_operation(
 p_nick text,p_operation uuid,p_action text,p_price integer DEFAULT NULL,p_max integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='8s'
AS $$
DECLARE
 op text := 'pw2:economy:'||p_operation::text;
 prior public.shop_operations%ROWTYPE;
 inv public.shop_inventories%ROWTYPE;
 result jsonb;
 reserved bigint;
 request jsonb := jsonb_build_object('price',p_price,'max',p_max);
BEGIN
 IF p_operation IS NULL OR p_nick IS NULL OR length(p_nick) NOT BETWEEN 1 AND 80
  OR p_action NOT IN ('random-redeem','raffle-buy') OR p_action IS NULL THEN
  RAISE EXCEPTION 'invalid_operation';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pw2:shared-games-economy',0));
 PERFORM pg_advisory_xact_lock(hashtextextended(op,0));
 -- Autorización ANTES de devolver cualquier recibo, también si ya existe.
 PERFORM 1 FROM public.shop_access WHERE nick=p_nick AND active IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'account_inactive'; END IF;
 PERFORM 1 FROM public.shop_players WHERE nick=p_nick AND active IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'account_inactive'; END IF;
 PERFORM public.pw2_assert_account_available(p_nick);
 -- Ningún canje nuevo ni repetición por esta RPC. Historial: consultas de solo lectura.
 IF p_action='random-redeem' THEN RAISE EXCEPTION 'operation_disabled'; END IF;
 PERFORM public.pw2_assert_service_available('raffles');
 SELECT * INTO prior FROM public.shop_operations WHERE operation_id=op;
 IF FOUND THEN
  IF prior.nick<>p_nick OR prior.action<>p_action OR prior.response->'request' IS DISTINCT FROM request THEN
   RAISE EXCEPTION 'operation_conflict';
  END IF;
  RETURN prior.response->'result';
 END IF;
 SELECT * INTO inv FROM public.shop_inventories WHERE nick=p_nick FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'inventory_missing'; END IF;
 IF p_price IS NULL OR p_price<=0 OR p_max IS NULL OR p_max<1 THEN
  RAISE EXCEPTION 'raffle_policy_missing';
 END IF;
 -- Regla fija de servidor: un cliente nunca puede elevar el máximo a 100.
 IF p_max>4 THEN RAISE EXCEPTION 'ticket_limit'; END IF;
 IF inv.pc IS NULL OR inv.pc<p_price THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
 IF inv.boleto_sorteo2 IS NULL OR inv.boleto_sorteo2<0 THEN RAISE EXCEPTION 'invalid_balance'; END IF;
 -- Los boletos reservados siguen contando hasta resolver el sorteo; no contar históricos resueltos.
 SELECT coalesce(sum(e.tickets),0) INTO reserved
 FROM public.pw2_raffle_entries e JOIN public.pw2_raffles r ON r.id=e.raffle_id
 WHERE e.nick=p_nick AND r.ticket_field='boleto_sorteo2' AND r.state IN ('draft','open','closed');
 IF inv.boleto_sorteo2::bigint+reserved>=p_max THEN RAISE EXCEPTION 'ticket_limit'; END IF;
 UPDATE public.shop_inventories SET pc=pc-p_price,boleto_sorteo2=boleto_sorteo2+1,updated_at=now()
  WHERE nick=p_nick RETURNING * INTO inv;
 UPDATE public.shop_public_users SET pc=inv.pc,updated_at=now() WHERE nick=p_nick;
 INSERT INTO public.shop_activity(nick,game,result,details,created_at)
  VALUES(p_nick,'Tienda','Compra Boleto de Sorteo 2','1 boleto por '||p_price::text||' PC',now());
 result:=jsonb_build_object('ok',true,'operationId',p_operation,'kind',p_action,'pc',inv.pc,'tickets',inv.boleto_sorteo2);
 INSERT INTO public.shop_operations(operation_id,action,nick,response,created_at)
  VALUES(op,p_action,p_nick,jsonb_build_object('request',request,'result',result),now());
 RETURN result;
END;
$$;
ALTER TABLE public.pw2_account_sanctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw2_store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw2_store_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw2_raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw2_raffle_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw2_community_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pw2_account_sanctions,public.pw2_store_products,public.pw2_store_purchases,public.pw2_raffles,public.pw2_raffle_entries,public.pw2_community_controls FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.pw2_account_sanctions,public.pw2_store_products,public.pw2_store_purchases,public.pw2_raffles,public.pw2_raffle_entries,public.pw2_community_controls TO service_role;
REVOKE ALL ON FUNCTION public.pw2_assert_account_available(text),public.pw2_assert_service_available(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pw2_assert_account_available(text),public.pw2_assert_service_available(text) TO service_role;
COMMENT ON TABLE public.pw2_account_sanctions IS 'pw2_admin_expansion_v1';
COMMENT ON TABLE public.pw2_store_products IS 'pw2_admin_expansion_v1';
COMMENT ON TABLE public.pw2_store_purchases IS 'pw2_admin_expansion_v1';
COMMENT ON TABLE public.pw2_raffles IS 'pw2_admin_expansion_v1';
COMMENT ON TABLE public.pw2_raffle_entries IS 'pw2_admin_expansion_v1';
COMMENT ON TABLE public.pw2_community_controls IS 'pw2_admin_expansion_v1';
ALTER TABLE public.pw2_raffle_ticket_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pw2_raffle_ticket_reservations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.pw2_raffle_ticket_reservations TO service_role;
COMMENT ON TABLE public.pw2_raffle_ticket_reservations IS 'pw2_admin_expansion_v1';
COMMIT;
