-- 005: revisar y aplicar manualmente DESPUÉS de 004. Nunca ejecutada automáticamente.
-- Reutiliza perfiles, catálogo de productos y compras. No cambia la RPC económica.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtextextended('pw2:shared-games-economy',0));
DO $preflight$
BEGIN
 IF to_regclass('public.pw2_store_products') IS NULL OR to_regclass('public.shop_profiles') IS NULL THEN RAISE EXCEPTION 'Se requiere el esquema existente y 004'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.shop_access WHERE nick='Perrisushi' AND is_admin IS TRUE) THEN RAISE EXCEPTION 'Cuenta administradora Perrisushi no verificada'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.shop_profiles'::regclass AND attname='cosmetics' AND NOT attisdropped AND col_description(attrelid,attnum) IS DISTINCT FROM 'pw2_cosmetics_v1') THEN RAISE EXCEPTION 'Columna cosmetics de origen desconocido'; END IF;
 IF EXISTS(SELECT 1 FROM public.shop_profiles p WHERE p.owned_logo_ids ? 'logo-perrisushi-adm' AND NOT EXISTS(SELECT 1 FROM public.shop_access a WHERE a.nick=p.nick AND a.nick='Perrisushi' AND a.is_admin IS TRUE)) THEN RAISE EXCEPTION 'Propiedad administrativa incompatible; revisar sin borrar datos'; END IF;
END $preflight$;
ALTER TABLE public.shop_profiles ADD COLUMN IF NOT EXISTS cosmetics jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.shop_profiles.cosmetics IS 'pw2_cosmetics_v1';
CREATE OR REPLACE FUNCTION public.pw2_profile_cosmetics_defaults() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; authorized boolean;
BEGIN
 authorized:=NEW.nick='Perrisushi' AND EXISTS(SELECT 1 FROM public.shop_access WHERE nick=NEW.nick AND is_admin IS TRUE);
 IF jsonb_typeof(NEW.owned_logo_ids) IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.cosmetics) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_cosmetic_collection'; END IF;
 IF NOT authorized AND (NEW.owned_logo_ids ? 'logo-perrisushi-adm' OR NEW.selected_logo_id='logo-perrisushi-adm') THEN RAISE EXCEPTION 'exclusive_cosmetic'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.owned_logo_ids ? 'logo-perriweb1' THEN RAISE EXCEPTION 'event_cosmetic_unavailable'; END IF;
 ELSIF NOT (OLD.owned_logo_ids ? 'logo-perriweb1') AND NEW.owned_logo_ids ? 'logo-perriweb1' THEN RAISE EXCEPTION 'event_cosmetic_unavailable'; END IF;
 IF authorized AND NOT (NEW.owned_logo_ids ? 'logo-perrisushi-adm') THEN NEW.owned_logo_ids:=NEW.owned_logo_ids||'["logo-perrisushi-adm"]'::jsonb; END IF;
 IF NEW.cosmetics->'ownedFrameIds' ? 'marco-logo-2026' THEN
  IF TG_OP='INSERT' THEN RAISE EXCEPTION 'event_cosmetic_unavailable';
  ELSIF NOT coalesce(OLD.cosmetics->'ownedFrameIds' ? 'marco-logo-2026',false) THEN RAISE EXCEPTION 'event_cosmetic_unavailable'; END IF;
 END IF;
 c:=NEW.cosmetics;
 IF NOT (c ? 'ownedBackgroundIds') THEN c:=c||'{"ownedBackgroundIds":[]}'::jsonb; END IF;
 IF NOT (c ? 'ownedFrameIds') THEN c:=c||'{"ownedFrameIds":[]}'::jsonb; END IF;
 IF jsonb_typeof(c->'ownedBackgroundIds')<>'array' OR jsonb_typeof(c->'ownedFrameIds')<>'array' THEN RAISE EXCEPTION 'invalid_cosmetic_collection'; END IF;
 IF NOT (c->'ownedBackgroundIds' ? 'fondo-logo-negro') THEN c:=jsonb_set(c,'{ownedBackgroundIds}',(c->'ownedBackgroundIds')||'["fondo-logo-negro"]'); END IF;
 IF NOT (c->'ownedFrameIds' ? 'marco-basico') THEN c:=jsonb_set(c,'{ownedFrameIds}',(c->'ownedFrameIds')||'["marco-basico"]'); END IF;
 IF coalesce(c->>'selectedBackgroundId','')='' THEN c:=c||'{"selectedBackgroundId":"fondo-logo-negro"}'; END IF;
 IF coalesce(c->>'selectedFrameId','')='' THEN c:=c||'{"selectedFrameId":"marco-basico"}'; END IF;
 NEW.cosmetics:=c;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pw2_profile_cosmetics_defaults ON public.shop_profiles;
CREATE TRIGGER pw2_profile_cosmetics_defaults BEFORE INSERT OR UPDATE ON public.shop_profiles FOR EACH ROW EXECUTE FUNCTION public.pw2_profile_cosmetics_defaults();
-- Inicialización universal al terminar la creación del jugador; respeta el perfil creado por Google/registro.
CREATE OR REPLACE FUNCTION public.pw2_new_player_cosmetics() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.shop_profiles(nick) VALUES(NEW.nick) ON CONFLICT(nick) DO NOTHING;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS pw2_new_player_cosmetics ON public.shop_players;
CREATE CONSTRAINT TRIGGER pw2_new_player_cosmetics AFTER INSERT ON public.shop_players DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.pw2_new_player_cosmetics();
CREATE OR REPLACE FUNCTION public.pw2_admin_logo_entitlement() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.nick='Perrisushi' AND NEW.is_admin IS TRUE THEN UPDATE public.shop_profiles SET cosmetics=cosmetics WHERE nick=NEW.nick; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pw2_admin_logo_entitlement ON public.shop_access;
CREATE TRIGGER pw2_admin_logo_entitlement AFTER INSERT OR UPDATE OF is_admin ON public.shop_access FOR EACH ROW EXECUTE FUNCTION public.pw2_admin_logo_entitlement();
INSERT INTO public.shop_profiles(nick) SELECT nick FROM public.shop_players ON CONFLICT(nick) DO NOTHING;
UPDATE public.shop_profiles SET cosmetics=cosmetics;
INSERT INTO public.shop_logo_catalog(logo_id,name,asset_path,sort_order,enabled,is_default)
VALUES('logo-perrisushi-adm','Perrisushi · Administración','/public/assets/perrilogos/logo/logo-perrisushi-adm.png',160,true,false)
ON CONFLICT(logo_id) DO NOTHING;
-- Los productos anteriores se conservan y se retiran de venta. Compras e instantáneas intactas.
UPDATE public.pw2_store_products SET enabled=false,hidden=true,version=version+1,updated_at=now() WHERE reward_type='logo' AND (enabled OR NOT hidden);
ALTER TABLE public.pw2_store_products DROP CONSTRAINT IF EXISTS pw2_store_products_category_check;
ALTER TABLE public.pw2_store_products DROP CONSTRAINT IF EXISTS pw2_store_products_reward_type_check;
ALTER TABLE public.pw2_store_products DROP CONSTRAINT IF EXISTS pw2_store_products_check;
ALTER TABLE public.pw2_store_products DROP CONSTRAINT IF EXISTS pw2_cosmetic_product_valid;
ALTER TABLE public.pw2_store_products ADD CONSTRAINT pw2_cosmetic_product_valid CHECK(
 (category='logos' AND reward_type='logo' AND currency='pc' AND quantity=1 AND NOT enabled AND hidden)
 OR (category='utility' AND reward_type='resource' AND currency='polvo_gema')
 OR (category='backgrounds' AND reward_type='background' AND currency='pc' AND quantity=1 AND reward_id IN ('fondo-logo-basico','fondo-logo-cuadricula','fondo-logo-piedra'))
 OR (category='frames' AND reward_type='frame' AND currency='pc' AND quantity=1 AND reward_id IN ('marco-logo-metalico','marco-logo-morado-gema','marco-logo-planta')));
CREATE UNIQUE INDEX IF NOT EXISTS pw2_unique_cosmetic_product ON public.pw2_store_products(reward_type,reward_id) WHERE reward_type IN ('background','frame');
INSERT INTO public.pw2_store_products(id,name,category,reward_type,reward_id,quantity,currency,price,stock,enabled,hidden) VALUES('3249e82a-b4cb-5ada-85be-936f3fb9d574','Fondo básico','backgrounds','background','fondo-logo-basico',1,'pc',500,NULL,true,false) ON CONFLICT DO NOTHING;
INSERT INTO public.pw2_store_products(id,name,category,reward_type,reward_id,quantity,currency,price,stock,enabled,hidden) VALUES('b2dc1bf6-e552-51ac-bee7-921b4607ecc0','Fondo cuadrícula','backgrounds','background','fondo-logo-cuadricula',1,'pc',500,NULL,true,false) ON CONFLICT DO NOTHING;
INSERT INTO public.pw2_store_products(id,name,category,reward_type,reward_id,quantity,currency,price,stock,enabled,hidden) VALUES('58e06399-87c1-5526-a186-d4a951f10103','Fondo piedra','backgrounds','background','fondo-logo-piedra',1,'pc',500,NULL,true,false) ON CONFLICT DO NOTHING;
INSERT INTO public.pw2_store_products(id,name,category,reward_type,reward_id,quantity,currency,price,stock,enabled,hidden) VALUES('3214e233-911c-5d25-aba4-20827e6984fb','Marco metálico','frames','frame','marco-logo-metalico',1,'pc',1500,NULL,true,false) ON CONFLICT DO NOTHING;
INSERT INTO public.pw2_store_products(id,name,category,reward_type,reward_id,quantity,currency,price,stock,enabled,hidden) VALUES('e7b224c8-7d91-58ea-b601-f89386cab6f6','Marco morado gema','frames','frame','marco-logo-morado-gema',1,'pc',1500,NULL,true,false) ON CONFLICT DO NOTHING;
INSERT INTO public.pw2_store_products(id,name,category,reward_type,reward_id,quantity,currency,price,stock,enabled,hidden) VALUES('559b83d7-a591-5d03-b6ee-8fc714aad9bb','Marco planta','frames','frame','marco-logo-planta',1,'pc',1500,NULL,true,false) ON CONFLICT DO NOTHING;
REVOKE ALL ON FUNCTION public.pw2_profile_cosmetics_defaults(),public.pw2_new_player_cosmetics(),public.pw2_admin_logo_entitlement() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pw2_profile_cosmetics_defaults(),public.pw2_new_player_cosmetics(),public.pw2_admin_logo_entitlement() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
