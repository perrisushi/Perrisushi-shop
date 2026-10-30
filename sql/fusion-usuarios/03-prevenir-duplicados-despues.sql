-- SOLO DESPUÉS de completar y validar TODAS las fusiones.
-- No fusiona, no borra y no renombra cuentas. Aún NO ejecutar en producción.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.shop_players,public.shop_access IN SHARE ROW EXCLUSIVE MODE;
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM public.shop_players GROUP BY lower(btrim(nick)) HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM public.shop_access GROUP BY lower(btrim(nick)) HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Quedan nicks duplicados; no se instala la restricción ni se descarta ninguna cuenta';
 END IF;
 IF EXISTS(SELECT 1 FROM public.shop_players WHERE nick IS NULL OR btrim(nick)='')
 OR EXISTS(SELECT 1 FROM public.shop_access WHERE nick IS NULL OR btrim(nick)='')
 THEN RAISE EXCEPTION 'Existen nicks vacíos o nulos; revisar sin normalizarlos automáticamente';
 END IF;
END $guard$;
CREATE UNIQUE INDEX pw2_shop_players_normalized_nick_uq ON public.shop_players(lower(btrim(nick)));
CREATE UNIQUE INDEX pw2_shop_access_normalized_nick_uq ON public.shop_access(lower(btrim(nick)));
COMMIT;
