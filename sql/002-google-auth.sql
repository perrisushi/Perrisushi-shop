-- Ejecutar manualmente tras revisar. No actualiza ni elimina cuentas existentes.
BEGIN;
SET LOCAL lock_timeout='5s';
-- NULL significa cuenta sin contraseña tradicional; no se alteran hashes existentes.
ALTER TABLE public.shop_access ALTER COLUMN code_hash DROP NOT NULL;
CREATE TABLE IF NOT EXISTS public.pw2_google_links (
 auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 nick text NOT NULL UNIQUE REFERENCES public.shop_players(nick) ON DELETE RESTRICT,
 terms_version text,
 terms_accepted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
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
ALTER TABLE public.pw2_google_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw2_oauth_flows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pw2_google_links,public.pw2_oauth_flows FROM PUBLIC,anon,authenticated;
-- Solo el backend PostgreSQL. No crear políticas de acceso para el navegador.
COMMIT;
