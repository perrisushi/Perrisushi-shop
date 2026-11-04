-- PERRILAND: preparación manual. No ejecutada por la aplicación.
BEGIN;
DO $$
DECLARE d text; names text[];
BEGIN
 IF to_regclass('public.shop_operations') IS NULL OR to_regclass('public.shop_sessions') IS NULL
 OR to_regclass('public.pw2_community_controls') IS NULL OR to_regprocedure('public.pw2_assert_account_available(text)') IS NULL THEN
  RAISE EXCEPTION 'Faltan los sistemas existentes de sesiones, economía o administración';
 END IF;
 FOR d IN SELECT t FROM unnest(ARRAY['pw2_perriland_room','pw2_perriland_events']) t LOOP
  IF to_regclass('public.'||d) IS NOT NULL AND obj_description(('public.'||d)::regclass,'pg_class') IS DISTINCT FROM 'pw2_perriland_v1' THEN
   RAISE EXCEPTION 'Tabla preexistente no reconocida: %',d;
  END IF;
 END LOOP;
 SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint WHERE conrelid='public.pw2_community_controls'::regclass AND conname='pw2_community_controls_scope_check' AND contype='c';
 IF d IS NULL OR d NOT LIKE 'CHECK ((scope = ANY (ARRAY[%' THEN RAISE EXCEPTION 'Restricción de ámbitos no reconocida'; END IF;
-- regexp_matches devuelve text[] por coincidencia; orden binario independiente de LC_COLLATE.
 SELECT array_agg(capture[1] ORDER BY capture[1] COLLATE "C") INTO names FROM regexp_matches(d,'''([^'']+)''','g') AS matches(capture);
 IF names IS DISTINCT FROM ARRAY['PerriCasillas','PerriDuelos','PerriPet','PerriRPG','announcement','raffles','shop']
 AND names IS DISTINCT FROM ARRAY['PerriCasillas','PerriDuelos','PerriLand','PerriPet','PerriRPG','announcement','raffles','shop'] THEN
  RAISE EXCEPTION 'Ámbitos de mantenimiento inesperados';
 END IF;
END $$;
ALTER TABLE public.pw2_community_controls DROP CONSTRAINT pw2_community_controls_scope_check;
ALTER TABLE public.pw2_community_controls ADD CONSTRAINT pw2_community_controls_scope_check CHECK(scope IN ('announcement','shop','raffles','PerriPet','PerriRPG','PerriCasillas','PerriDuelos','PerriLand'));
-- Cada ejecución cierra PERRILAND, incluso si ya estaba abierto (active=true significa mantenimiento).
INSERT INTO public.pw2_community_controls(scope,active,message) VALUES('PerriLand',true,'PERRILAND no está activado.')
ON CONFLICT(scope) DO UPDATE SET active=EXCLUDED.active,message=EXCLUDED.message;
CREATE TABLE IF NOT EXISTS public.pw2_perriland_room(
 id text PRIMARY KEY CHECK(id='main'),revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 commit_id uuid,state jsonb,updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.pw2_perriland_room IS 'pw2_perriland_v1';
INSERT INTO public.pw2_perriland_room(id) VALUES('main') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.pw2_perriland_events(
 id text PRIMARY KEY,nick text NOT NULL REFERENCES public.shop_players(nick),
 kind text NOT NULL CHECK(kind IN ('normal_coin','special_coin','void')),
 requested integer NOT NULL,applied integer NOT NULL,before_pc bigint NOT NULL CHECK(before_pc>=0),after_pc bigint NOT NULL CHECK(after_pc>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(after_pc=before_pc+applied)
);
COMMENT ON TABLE public.pw2_perriland_events IS 'pw2_perriland_v1';
ALTER TABLE public.pw2_perriland_room ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pw2_perriland_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pw2_perriland_room,public.pw2_perriland_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.pw2_perriland_room TO service_role;
GRANT SELECT,INSERT ON public.pw2_perriland_events TO service_role;
-- No se altera pw2_economy_operation, inventarios, historiales ni cuentas existentes.
COMMIT;
