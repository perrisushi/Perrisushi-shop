-- SQL DEFINITIVO 003. Ejecutar manualmente en Supabase SQL Editor con el rol propietario.
-- Incluye copia privada previa de las tres tablas y de los disparadores afectados.
-- No altera inventarios ni avisos anteriores. No ejecutar en producción desde herramientas automáticas.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.shop_inventories, public.shop_notifications, public.shop_random_key_tickets IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE missing text; unknown_trigger text;
BEGIN
 SELECT string_agg(name, ', ') INTO missing
 FROM unnest(ARRAY['nick','perri_cofres','perri_cofres_minijuego','cajita_armas','bolsa_especial','bolsa_chatarra','bolsa_gemas','monedas']) AS name
 WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='shop_inventories' AND c.column_name=name);
 IF missing IS NOT NULL THEN RAISE EXCEPTION 'Faltan columnas de inventario: %',missing; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shop_notifications' AND column_name='payload' AND data_type='jsonb') THEN RAISE EXCEPTION 'Esquema de notificaciones incompatible'; END IF;
 -- No retirar un productor desconocido: podría generar duplicados o ser un aviso ajeno a recompensas.
 SELECT string_agg(t.tgname,', ') INTO unknown_trigger FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
 AND NOT t.tgisinternal AND pg_get_functiondef(p.oid) ILIKE '%shop_notifications%'
 AND NOT (t.tgname=ANY(ARRAY['trg_shop_inventories_notify_fragmento','trg_shop_inventories_notify_llaves','trg_shop_inventories_notify_random_key','trg_shop_inventories_notify_monedas','trg_shop_inventories_notify_perri_cofres','trg_shop_inventories_notify_perri_cofres_minijuego','trg_shop_random_key_tickets_notify_insert','trg_pw2_inventory_reward_notifications']));
 IF unknown_trigger IS NOT NULL THEN RAISE EXCEPTION 'Revisar productores desconocidos antes de continuar: %',unknown_trigger; END IF;
END $$;

-- Copia consistente ANTES de cambiar disparadores; nunca sustituye una copia previa.
CREATE SCHEMA IF NOT EXISTS pw2_backup_003;
REVOKE ALL ON SCHEMA pw2_backup_003 FROM PUBLIC, anon, authenticated, service_role;
DO $$
BEGIN
 IF to_regclass('pw2_backup_003.manifest') IS NULL THEN
  IF to_regclass('pw2_backup_003.shop_notifications') IS NOT NULL OR to_regclass('pw2_backup_003.shop_inventories') IS NOT NULL OR to_regclass('pw2_backup_003.shop_random_key_tickets') IS NOT NULL THEN
   RAISE EXCEPTION 'Existe una copia parcial 003; no se sobrescribe';
  END IF;
  CREATE TABLE pw2_backup_003.shop_inventories AS TABLE public.shop_inventories;
  CREATE TABLE pw2_backup_003.shop_notifications AS TABLE public.shop_notifications;
  CREATE TABLE pw2_backup_003.shop_random_key_tickets AS TABLE public.shop_random_key_tickets;
  CREATE TABLE pw2_backup_003.triggers AS
   SELECT c.relname AS table_name,t.tgname AS trigger_name,t.tgenabled AS enabled,pg_get_triggerdef(t.oid) AS definition
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE t.tgrelid IN ('public.shop_inventories'::regclass,'public.shop_notifications'::regclass,'public.shop_random_key_tickets'::regclass)
   AND NOT t.tgisinternal AND t.tgname=ANY(ARRAY['trg_shop_inventories_notify_fragmento','trg_shop_inventories_notify_llaves','trg_shop_inventories_notify_random_key','trg_shop_inventories_notify_monedas','trg_shop_inventories_notify_perri_cofres','trg_shop_inventories_notify_perri_cofres_minijuego','trg_shop_random_key_tickets_notify_insert','trg_pw2_inventory_reward_notifications','trg_pw2_filter_reward_notifications']);
  CREATE TABLE pw2_backup_003.functions AS
   SELECT p.proname AS function_name,pg_get_functiondef(p.oid) AS definition
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.pronargs=0 AND p.proname IN ('pw2_inventory_reward_notifications','pw2_filter_reward_notifications');
  CREATE TABLE pw2_backup_003.manifest AS SELECT '003-rewards-v1'::text AS version,clock_timestamp() AS created_at,
   (SELECT count(*) FROM pw2_backup_003.shop_inventories) AS inventories,
   (SELECT count(*) FROM pw2_backup_003.shop_notifications) AS notifications,
   (SELECT count(*) FROM pw2_backup_003.shop_random_key_tickets) AS tickets;
 ELSE
  IF (SELECT count(*) FROM pw2_backup_003.manifest WHERE version='003-rewards-v1')<>1 THEN RAISE EXCEPTION 'Copia 003 incompatible'; END IF;
  IF EXISTS (SELECT 1 FROM pw2_backup_003.manifest m WHERE
   m.inventories<>(SELECT count(*) FROM pw2_backup_003.shop_inventories) OR
   m.notifications<>(SELECT count(*) FROM pw2_backup_003.shop_notifications) OR
   m.tickets<>(SELECT count(*) FROM pw2_backup_003.shop_random_key_tickets)) THEN
   RAISE EXCEPTION 'Copia 003 incompleta; no se aplica la migración';
  END IF;
 END IF;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA pw2_backup_003 FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE pw2_backup_003.shop_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pw2_backup_003.shop_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE pw2_backup_003.shop_random_key_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pw2_backup_003.triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pw2_backup_003.functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pw2_backup_003.manifest ENABLE ROW LEVEL SECURITY;

-- Solo sustituye los productores de recompensas conocidos. Ningún DELETE de datos.
DROP TRIGGER IF EXISTS trg_shop_inventories_notify_fragmento ON public.shop_inventories;
DROP TRIGGER IF EXISTS trg_shop_inventories_notify_llaves ON public.shop_inventories;
DROP TRIGGER IF EXISTS trg_shop_inventories_notify_random_key ON public.shop_inventories;
DROP TRIGGER IF EXISTS trg_shop_inventories_notify_monedas ON public.shop_inventories;
DROP TRIGGER IF EXISTS trg_shop_inventories_notify_perri_cofres ON public.shop_inventories;
DROP TRIGGER IF EXISTS trg_shop_inventories_notify_perri_cofres_minijuego ON public.shop_inventories;
DROP TRIGGER IF EXISTS trg_shop_random_key_tickets_notify_insert ON public.shop_random_key_tickets;

CREATE OR REPLACE FUNCTION public.pw2_inventory_reward_notifications()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE spec record; before_row jsonb; after_row jsonb; amount numeric; context jsonb;
BEGIN
 before_row := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 after_row := to_jsonb(NEW);
 context := nullif(current_setting('pw2.notification_rewards',true),'')::jsonb;
 FOR spec IN SELECT * FROM (VALUES
  ('perri_cofres','PerriCofres','PerriCofre','PerriCofres'),
  ('perri_cofres_minijuego','PerriCofre de minijuego','PerriCofre de minijuego','PerriCofres de minijuego'),
  ('cajita_armas','Cajita de armas','Cajita de armas','Cajitas de armas'),
  ('bolsa_especial','Bolsa especial','Bolsa especial','Bolsas especiales'),
  ('bolsa_chatarra','Bolsa de chatarra','Bolsa de chatarra','Bolsas de chatarra'),
  ('bolsa_gemas','Bolsa de gemas','Bolsa de gemas','Bolsas de gemas'),
  ('monedas','Monedas','Moneda','Monedas')
 ) AS x(item_id,title,singular,plural)
 LOOP
  amount := coalesce((after_row->>spec.item_id)::numeric,0)-coalesce((before_row->>spec.item_id)::numeric,0);
  -- Contexto exclusivamente del backend, limitado al propietario y a esta escritura.
  -- Permite registrar premios brutos cuando su coste se descuenta en la misma operación.
  IF context->>'nick'=NEW.nick AND context->'rewards' ? spec.item_id THEN
   amount := (context->'rewards'->>spec.item_id)::numeric;
  END IF;
  IF amount>0 THEN
   INSERT INTO public.shop_notifications(nick,kind,title,message,payload,created_at,updated_at)
   VALUES(NEW.nick,spec.item_id,spec.title,
    'Has recibido '||amount::text||' '||CASE WHEN amount=1 THEN spec.singular ELSE spec.plural END||'.',
    jsonb_build_object('category','reward','itemId',spec.item_id,'amount',amount),now(),now());
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pw2_inventory_reward_notifications() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_pw2_inventory_reward_notifications ON public.shop_inventories;
CREATE TRIGGER trg_pw2_inventory_reward_notifications AFTER INSERT OR UPDATE ON public.shop_inventories
FOR EACH ROW EXECUTE FUNCTION public.pw2_inventory_reward_notifications();

-- Productores legados que intentasen emitir recompensas excluidas no crean filas nuevas.
-- Los avisos sociales, bienvenida y comunicaciones se conservan; nada histórico se modifica.
CREATE OR REPLACE FUNCTION public.pw2_filter_reward_notifications()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE allowed text[] := ARRAY['perri_cofres','perri_cofres_minijuego','cajita_armas','bolsa_especial','bolsa_chatarra','bolsa_gemas','monedas'];
BEGIN
 -- Una categoría explícita ajena a recompensas siempre conserva el aviso.
 IF NEW.payload ? 'category' AND NEW.payload->>'category' IS DISTINCT FROM 'reward' THEN RETURN NEW; END IF;
 IF NEW.payload->>'category'='reward' THEN
  IF NOT coalesce(coalesce(NEW.payload->>'itemId',NEW.kind)=ANY(allowed),false) THEN RETURN NULL; END IF;
  RETURN NEW;
 END IF;
 -- Compatibilidad exacta con los cuatro productores legados de premios excluidos.
 -- El kind por sí solo NO identifica una recompensa: un aviso administrativo
 -- puede usar el mismo nombre. Se exige también el título y la cantidad del productor original.
 IF jsonb_typeof(NEW.payload->'amount')='number' AND (NEW.payload->>'amount')::numeric>0 AND (
  (NEW.kind='fragmento' AND NEW.title='Fragmento conseguido') OR
  (NEW.kind='llaves' AND NEW.title='Llaves conseguidas') OR
  (NEW.kind='random_key' AND NEW.title='Random Key conseguida') OR
  (NEW.kind='ticket' AND NEW.title='Ticket recibido')
 ) THEN RETURN NULL; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pw2_filter_reward_notifications() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_pw2_filter_reward_notifications ON public.shop_notifications;
CREATE TRIGGER trg_pw2_filter_reward_notifications BEFORE INSERT ON public.shop_notifications
FOR EACH ROW EXECUTE FUNCTION public.pw2_filter_reward_notifications();
COMMIT;
SELECT version,created_at,inventories,notifications,tickets FROM pw2_backup_003.manifest;
