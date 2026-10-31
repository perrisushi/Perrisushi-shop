-- RESTAURACIÓN SEGURA 003. Solo si necesitas deshacer esta migración.
-- No borra avisos nuevos ni sobrescribe sus estados. No rebobina inventarios ni tickets.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.shop_inventories, public.shop_notifications, public.shop_random_key_tickets IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE copy record;
BEGIN
 IF to_regclass('pw2_backup_003.manifest') IS NULL THEN RAISE EXCEPTION 'No existe la copia previa 003'; END IF;
 IF (SELECT count(*) FROM pw2_backup_003.manifest WHERE version='003-rewards-v1')<>1 THEN RAISE EXCEPTION 'Copia 003 incompatible'; END IF;
 SELECT * INTO copy FROM pw2_backup_003.manifest;
 IF copy.inventories<>(SELECT count(*) FROM pw2_backup_003.shop_inventories)
 OR copy.notifications<>(SELECT count(*) FROM pw2_backup_003.shop_notifications)
 OR copy.tickets<>(SELECT count(*) FROM pw2_backup_003.shop_random_key_tickets) THEN RAISE EXCEPTION 'Copia 003 incompleta; no se restaura'; END IF;
END $$;
-- Retirar exclusivamente los disparadores gestionados por 003 antes de recuperar el histórico.
DROP TRIGGER IF EXISTS trg_pw2_inventory_reward_notifications ON public.shop_inventories;
DROP TRIGGER IF EXISTS trg_pw2_filter_reward_notifications ON public.shop_notifications;
DROP TRIGGER IF EXISTS trg_shop_inventories_notify_fragmento ON public.shop_inventories;
DROP TRIGGER IF EXISTS trg_shop_inventories_notify_llaves ON public.shop_inventories;
DROP TRIGGER IF EXISTS trg_shop_inventories_notify_random_key ON public.shop_inventories;
DROP TRIGGER IF EXISTS trg_shop_inventories_notify_monedas ON public.shop_inventories;
DROP TRIGGER IF EXISTS trg_shop_inventories_notify_perri_cofres ON public.shop_inventories;
DROP TRIGGER IF EXISTS trg_shop_inventories_notify_perri_cofres_minijuego ON public.shop_inventories;
DROP TRIGGER IF EXISTS trg_shop_random_key_tickets_notify_insert ON public.shop_random_key_tickets;
DO $$
DECLARE saved record;
BEGIN
 FOR saved IN SELECT * FROM pw2_backup_003.functions LOOP EXECUTE saved.definition; END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pw2_backup_003.functions WHERE function_name='pw2_inventory_reward_notifications') THEN DROP FUNCTION IF EXISTS public.pw2_inventory_reward_notifications(); END IF;
 IF NOT EXISTS(SELECT 1 FROM pw2_backup_003.functions WHERE function_name='pw2_filter_reward_notifications') THEN DROP FUNCTION IF EXISTS public.pw2_filter_reward_notifications(); END IF;
END $$;
-- Recupera únicamente avisos de la copia que falten. Los que existan permanecen intactos.
INSERT INTO public.shop_notifications SELECT * FROM pw2_backup_003.shop_notifications ON CONFLICT(id) DO NOTHING;
DO $$
DECLARE saved record;
BEGIN
 FOR saved IN SELECT * FROM pw2_backup_003.triggers ORDER BY table_name,trigger_name LOOP
  EXECUTE saved.definition;
  EXECUTE format('ALTER TABLE public.%I %s TRIGGER %I',saved.table_name,
   CASE saved.enabled WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,saved.trigger_name);
 END LOOP;
END $$;
COMMIT;
SELECT 'Configuración anterior restaurada; saldos, tickets, avisos nuevos y estados actuales conservados' AS resultado;
