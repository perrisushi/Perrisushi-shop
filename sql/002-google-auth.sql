-- PerriWeb: ÚNICA migración necesaria para Google Auth.
-- Ejecutar manualmente en el editor SQL del proyecto existente.
-- Conserva cuentas, contraseñas, inventarios y progresos existentes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Las cuentas Google nuevas no tienen contraseña tradicional.
-- Los hashes de las cuentas existentes permanecen exactamente como están.
ALTER TABLE public.shop_access ALTER COLUMN code_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.pw2_google_links (
 auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 nick text NOT NULL UNIQUE REFERENCES public.shop_players(nick) ON DELETE RESTRICT,
 terms_version text,
 terms_accepted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Compatibilidad con una ejecución anterior de la integración Google.
ALTER TABLE public.pw2_google_links ADD COLUMN IF NOT EXISTS terms_version text;
ALTER TABLE public.pw2_google_links ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

CREATE TABLE IF NOT EXISTS public.pw2_oauth_flows (
 token_hash text PRIMARY KEY,
 verifier text,
 mode text NOT NULL CHECK(mode IN ('login','link')),
 nick text REFERENCES public.shop_players(nick) ON DELETE RESTRICT,
 source_session text,
 auth_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 status text NOT NULL CHECK(status IN ('started','exchanging','pending')),
 expires_at timestamptz NOT NULL,
 CHECK ((mode='login' AND nick IS NULL AND source_session IS NULL) OR
        (mode='link' AND nick IS NOT NULL AND source_session IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS pw2_oauth_flows_expiry ON public.pw2_oauth_flows(expires_at);

-- Garantía de disponibilidad del nick al registrar, incluso con peticiones simultáneas.
-- No altera ningún nick ni registro existente.
CREATE UNIQUE INDEX IF NOT EXISTS pw2_shop_players_normalized_nick_uq ON public.shop_players(lower(btrim(nick)));
CREATE UNIQUE INDEX IF NOT EXISTS pw2_shop_access_normalized_nick_uq ON public.shop_access(lower(btrim(nick)));
DO $verify$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid='public.pw2_shop_players_normalized_nick_uq'::regclass
    AND indrelid='public.shop_players'::regclass AND indisunique AND indisvalid AND indpred IS NULL
    AND indnkeyatts=1 AND pg_get_expr(indexprs,indrelid)='lower(btrim(nick))')
 OR NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid='public.pw2_shop_access_normalized_nick_uq'::regclass
    AND indrelid='public.shop_access'::regclass AND indisunique AND indisvalid AND indpred IS NULL
    AND indnkeyatts=1 AND pg_get_expr(indexprs,indrelid)='lower(btrim(nick))')
 THEN RAISE EXCEPTION 'La restricción de nick existente no es compatible. No se ha modificado ninguna cuenta';
 END IF;
END $verify$;

ALTER TABLE public.pw2_google_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw2_oauth_flows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pw2_google_links,public.pw2_oauth_flows FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.pw2_google_links,public.pw2_oauth_flows TO service_role;
-- El rol PostgreSQL propietario conserva sus permisos. No se crean políticas de navegador.
COMMIT;
