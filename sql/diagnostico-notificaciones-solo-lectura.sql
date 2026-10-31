-- Diagnóstico opcional, exclusivamente de lectura. No es una migración.
BEGIN READ ONLY;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'shop_notifications'
ORDER BY ordinal_position;
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid = 'public.shop_notifications'::regclass;
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'shop_notifications';
SELECT tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger WHERE tgrelid = 'public.shop_inventories'::regclass AND NOT tgisinternal;
SELECT nick, count(*) FILTER (WHERE read_at IS NULL) AS nuevas,
 count(*) FILTER (WHERE read_at IS NOT NULL) AS revisadas, count(*) AS total
FROM public.shop_notifications GROUP BY nick ORDER BY nick;
-- Candidatos para revisión, nunca para borrado automático: avisos iguales pueden ser legítimos.
SELECT nick, kind, created_at, count(*) AS coincidencias
FROM public.shop_notifications
GROUP BY nick, kind, title, message, created_at HAVING count(*) > 1
ORDER BY created_at DESC LIMIT 100;
ROLLBACK;
