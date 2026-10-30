-- Contrato estructural de prueba obtenido del diagnóstico de 2026-10-30.
-- Sin datos de cuentas. SOLO para PostgreSQL local de tests; no ejecutar en producción.
CREATE TABLE public."perri_casillas_games" (
 "nick" text NOT NULL,
 "round_id" text NOT NULL,
 "cells" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "plays_in_window" integer DEFAULT 0 NOT NULL,
 "window_started_at" timestamp with time zone DEFAULT now(),
 "board_version" integer DEFAULT 3 NOT NULL
);
CREATE TABLE public."shop_access" (
 "nick" text NOT NULL,
 "code_hash" text NOT NULL,
 "active" boolean DEFAULT true NOT NULL,
 "last_access_at" timestamp with time zone,
 "last_purchase_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "is_admin" boolean DEFAULT false NOT NULL,
 "free_cards_day" text DEFAULT ''::text NOT NULL,
 "free_duelo_day" text DEFAULT ''::text NOT NULL,
 "daily_pass_claimed_days" integer DEFAULT 0 NOT NULL,
 "daily_pass_last_claim_day" text DEFAULT ''::text NOT NULL,
 "daily_pass_season_id" text DEFAULT ''::text NOT NULL
);
CREATE TABLE public."shop_access_requests" (
 "request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "nick" text NOT NULL,
 "password_hash" text NOT NULL,
 "status" text DEFAULT 'pending'::text NOT NULL,
 "request_message" text DEFAULT ''::text NOT NULL,
 "admin_note" text DEFAULT ''::text NOT NULL,
 "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
 "resolved_at" timestamp with time zone,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_account_activation_links" (
 "invite_id" uuid NOT NULL,
 "nick" text NOT NULL,
 "activation_token" text NOT NULL,
 "status" text DEFAULT 'issued'::text NOT NULL,
 "issued_note" text DEFAULT ''::text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "expires_at" timestamp with time zone,
 "used_at" timestamp with time zone,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_activity" (
 "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
 "nick" text NOT NULL,
 "game" text DEFAULT ''::text NOT NULL,
 "result" text DEFAULT ''::text NOT NULL,
 "details" text DEFAULT ''::text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_chat_messages" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "nick" text NOT NULL,
 "logo_id" text DEFAULT 'logo-pelusa-1'::text NOT NULL,
 "message" text NOT NULL,
 "reply_to_message_id" uuid,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "liked_by_nicks" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "reactions" jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE public."shop_chat_presence" (
 "nick" text NOT NULL,
 "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_inventories" (
 "nick" text NOT NULL,
 "monedas" integer DEFAULT 0 NOT NULL,
 "llaves" integer DEFAULT 0 NOT NULL,
 "polvo_gema" integer DEFAULT 0 NOT NULL,
 "duelo" integer DEFAULT 0 NOT NULL,
 "perricita" integer DEFAULT 0 NOT NULL,
 "pc" integer DEFAULT 0 NOT NULL,
 "espada" integer DEFAULT 0 NOT NULL,
 "espada_lv2" integer DEFAULT 0 NOT NULL,
 "espada_lv3" integer DEFAULT 0 NOT NULL,
 "escudo" integer DEFAULT 0 NOT NULL,
 "cuchillo" integer DEFAULT 0 NOT NULL,
 "collar" integer DEFAULT 0 NOT NULL,
 "random_key" integer DEFAULT 0 NOT NULL,
 "espada_legendaria" integer DEFAULT 0 NOT NULL,
 "escudo_madera" integer DEFAULT 0 NOT NULL,
 "escudo_metal" integer DEFAULT 0 NOT NULL,
 "escudo_legendario" integer DEFAULT 0 NOT NULL,
 "casco_sushi" integer DEFAULT 0 NOT NULL,
 "guantes_sushi" integer DEFAULT 0 NOT NULL,
 "pechera_sushi" integer DEFAULT 0 NOT NULL,
 "pantalones_sushi" integer DEFAULT 0 NOT NULL,
 "botas_sushi" integer DEFAULT 0 NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "fragmento_key" integer DEFAULT 0 NOT NULL,
 "perri_cofres" integer DEFAULT 0 NOT NULL,
 "perri_cofres_minijuego" integer DEFAULT 0 NOT NULL,
 "boleto_sorteo1" integer DEFAULT 0 NOT NULL,
 "boleto_sorteo2" integer DEFAULT 0 NOT NULL,
 "mini_sorteo" integer DEFAULT 0 NOT NULL,
 "pinza_real" integer DEFAULT 0 NOT NULL,
 "chatarra" integer DEFAULT 0 NOT NULL,
 "agua_divina" integer DEFAULT 0 NOT NULL,
 "espada_sagrada" integer DEFAULT 0 NOT NULL,
 "gema_experiencia" integer DEFAULT 0 NOT NULL,
 "incubadora_mejorada" integer DEFAULT 0 NOT NULL,
 "pocion_divina" integer DEFAULT 0 NOT NULL,
 "reloj_cronotiempo" integer DEFAULT 0 NOT NULL,
 "saco_chatarra" integer DEFAULT 0 NOT NULL,
 "bolsa_gemas" integer DEFAULT 0 NOT NULL,
 "bolsa_chatarra" integer DEFAULT 0 NOT NULL,
 "cajita_armas" integer DEFAULT 0 NOT NULL,
 "bolsa_especial" integer DEFAULT 0 NOT NULL,
 "revivir_pet" integer DEFAULT 0 NOT NULL
);
CREATE TABLE public."shop_inventory_chests" (
 "chest_id" uuid NOT NULL,
 "nick" text NOT NULL,
 "chest_type" text NOT NULL,
 "status" text DEFAULT 'available'::text NOT NULL,
 "obtained_at" timestamp with time zone DEFAULT now() NOT NULL,
 "opened_at" timestamp with time zone,
 "expires_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_logo_catalog" (
 "logo_id" text NOT NULL,
 "name" text NOT NULL,
 "asset_path" text NOT NULL,
 "sort_order" integer DEFAULT 0 NOT NULL,
 "enabled" boolean DEFAULT true NOT NULL,
 "is_default" boolean DEFAULT false NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_notifications" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "nick" text NOT NULL,
 "kind" text NOT NULL,
 "title" text DEFAULT ''::text NOT NULL,
 "message" text DEFAULT ''::text NOT NULL,
 "action_url" text DEFAULT ''::text NOT NULL,
 "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "read_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_operations" (
 "operation_id" text NOT NULL,
 "action" text NOT NULL,
 "nick" text NOT NULL,
 "response" jsonb NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_perri_chests" (
 "chest_id" uuid NOT NULL,
 "redeem_token" text NOT NULL,
 "status" text DEFAULT 'issued'::text NOT NULL,
 "issued_label" text DEFAULT ''::text NOT NULL,
 "issued_note" text DEFAULT ''::text NOT NULL,
 "guaranteed_rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "extra_reward" jsonb,
 "rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "redeemed_by" text,
 "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
 "opening_at" timestamp with time zone,
 "redeemed_at" timestamp with time zone,
 "expires_at" timestamp with time zone,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_perripet_inventory" (
 "nick" text NOT NULL,
 "item_id" text NOT NULL,
 "quantity" integer DEFAULT 0 NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_perripet_item_catalog" (
 "item_id" text NOT NULL,
 "name" text NOT NULL,
 "category" text NOT NULL,
 "source_game" text DEFAULT 'perripet'::text NOT NULL,
 "target_game" text DEFAULT 'perripet'::text NOT NULL,
 "tradable" boolean DEFAULT false NOT NULL,
 "enabled" boolean DEFAULT true NOT NULL,
 "sort_order" integer DEFAULT 0 NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_perripet_states" (
 "nick" text NOT NULL,
 "version" integer DEFAULT 1 NOT NULL,
 "pet_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "farm_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "encounters_state" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_players" (
 "nick" text NOT NULL,
 "active" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_profiles" (
 "nick" text NOT NULL,
 "selected_logo_id" text DEFAULT 'logo-abeja-1'::text NOT NULL,
 "owned_logo_ids" jsonb DEFAULT '["logo-abeja-1"]'::jsonb NOT NULL,
 "karma" text DEFAULT ''::text NOT NULL,
 "achievements" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "selected_title_id" text DEFAULT ''::text NOT NULL
);
CREATE TABLE public."shop_public_users" (
 "nick" text NOT NULL,
 "pc" integer DEFAULT 0 NOT NULL,
 "logo_id" text DEFAULT 'logo-abeja-1'::text NOT NULL,
 "karma" text DEFAULT ''::text NOT NULL,
 "achievements" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "selected_title_id" text DEFAULT ''::text NOT NULL
);
CREATE TABLE public."shop_random_key_claims" (
 "id" uuid NOT NULL,
 "nick" text NOT NULL,
 "game" text NOT NULL,
 "key" text NOT NULL,
 "claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_random_key_pool" (
 "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
 "game" text NOT NULL,
 "key" text NOT NULL,
 "status" text DEFAULT 'Disponible'::text NOT NULL,
 "assigned_to" text,
 "delivered_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_random_key_tickets" (
 "id" uuid NOT NULL,
 "nick" text NOT NULL,
 "status" text DEFAULT 'Activa'::text NOT NULL,
 "obtained_at" timestamp with time zone NOT NULL,
 "expires_at" timestamp with time zone NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_rpg_catalog" (
 "item_id" text NOT NULL,
 "name" text NOT NULL,
 "kind" text NOT NULL,
 "family" text DEFAULT ''::text NOT NULL,
 "slot" text,
 "set_name" text,
 "price_pg" integer,
 "max_quantity" integer NOT NULL,
 "stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "effect" text DEFAULT ''::text NOT NULL,
 "sort_order" integer DEFAULT 0 NOT NULL,
 "enabled" boolean DEFAULT true NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "starter" boolean DEFAULT false NOT NULL,
 "purchasable" boolean DEFAULT true NOT NULL
);
CREATE TABLE public."shop_rpg_combat_state" (
 "nick" text NOT NULL,
 "round_number" integer DEFAULT 1 NOT NULL,
 "player_hp" numeric DEFAULT 0 NOT NULL,
 "player_max_hp" numeric DEFAULT 0 NOT NULL,
 "enemy_hp" numeric DEFAULT 5000 NOT NULL,
 "enemy_max_hp" numeric DEFAULT 5000 NOT NULL,
 "is_undead" boolean DEFAULT false NOT NULL,
 "player_statuses" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "enemy_statuses" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "combat_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "reward_claimed" boolean DEFAULT false NOT NULL
);
CREATE TABLE public."shop_rpg_equipment" (
 "nick" text NOT NULL,
 "slot" text NOT NULL,
 "item_id" text NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_rpg_inventory" (
 "nick" text NOT NULL,
 "item_id" text NOT NULL,
 "quantity" integer DEFAULT 0 NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_rpg_ledger" (
 "ledger_id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
 "nick" text NOT NULL,
 "action" text NOT NULL,
 "item_id" text,
 "quantity_delta" integer DEFAULT 0 NOT NULL,
 "pg_delta" integer DEFAULT 0 NOT NULL,
 "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_rpg_loadout" (
 "nick" text NOT NULL,
 "item_id" text NOT NULL,
 "enabled" boolean DEFAULT true NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_sessions" (
 "token" text NOT NULL,
 "nick" text NOT NULL,
 "expires_at" timestamp with time zone NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."shop_ui_layouts" (
 "layout_key" text NOT NULL,
 "layouts" jsonb DEFAULT '{"mobile": {}, "desktop": {}}'::jsonb NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."perri_casillas_games" ADD CONSTRAINT "perri_casillas_games_pkey" PRIMARY KEY (nick);
ALTER TABLE public."shop_access" ADD CONSTRAINT "shop_access_pkey" PRIMARY KEY (nick);
ALTER TABLE public."shop_access_requests" ADD CONSTRAINT "shop_access_requests_pkey" PRIMARY KEY (request_id);
ALTER TABLE public."shop_account_activation_links" ADD CONSTRAINT "shop_account_activation_links_pkey" PRIMARY KEY (invite_id);
ALTER TABLE public."shop_activity" ADD CONSTRAINT "shop_activity_pkey" PRIMARY KEY (id);
ALTER TABLE public."shop_chat_messages" ADD CONSTRAINT "shop_chat_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."shop_chat_presence" ADD CONSTRAINT "shop_chat_presence_pkey" PRIMARY KEY (nick);
ALTER TABLE public."shop_inventories" ADD CONSTRAINT "shop_inventories_pkey" PRIMARY KEY (nick);
ALTER TABLE public."shop_inventory_chests" ADD CONSTRAINT "shop_inventory_chests_pkey" PRIMARY KEY (chest_id);
ALTER TABLE public."shop_logo_catalog" ADD CONSTRAINT "shop_logo_catalog_pkey" PRIMARY KEY (logo_id);
ALTER TABLE public."shop_notifications" ADD CONSTRAINT "shop_notifications_pkey" PRIMARY KEY (id);
ALTER TABLE public."shop_operations" ADD CONSTRAINT "shop_operations_pkey" PRIMARY KEY (operation_id);
ALTER TABLE public."shop_perri_chests" ADD CONSTRAINT "shop_perri_chests_pkey" PRIMARY KEY (chest_id);
ALTER TABLE public."shop_perripet_inventory" ADD CONSTRAINT "shop_perripet_inventory_pkey" PRIMARY KEY (nick, item_id);
ALTER TABLE public."shop_perripet_item_catalog" ADD CONSTRAINT "shop_perripet_item_catalog_pkey" PRIMARY KEY (item_id);
ALTER TABLE public."shop_perripet_states" ADD CONSTRAINT "shop_perripet_states_pkey" PRIMARY KEY (nick);
ALTER TABLE public."shop_players" ADD CONSTRAINT "shop_players_pkey" PRIMARY KEY (nick);
ALTER TABLE public."shop_profiles" ADD CONSTRAINT "shop_profiles_pkey" PRIMARY KEY (nick);
ALTER TABLE public."shop_public_users" ADD CONSTRAINT "shop_public_users_pkey" PRIMARY KEY (nick);
ALTER TABLE public."shop_random_key_claims" ADD CONSTRAINT "shop_random_key_claims_pkey" PRIMARY KEY (id);
ALTER TABLE public."shop_random_key_pool" ADD CONSTRAINT "shop_random_key_pool_pkey" PRIMARY KEY (id);
ALTER TABLE public."shop_random_key_tickets" ADD CONSTRAINT "shop_random_key_tickets_pkey" PRIMARY KEY (id);
ALTER TABLE public."shop_rpg_catalog" ADD CONSTRAINT "shop_rpg_catalog_pkey" PRIMARY KEY (item_id);
ALTER TABLE public."shop_rpg_combat_state" ADD CONSTRAINT "shop_rpg_combat_state_pkey" PRIMARY KEY (nick);
ALTER TABLE public."shop_rpg_equipment" ADD CONSTRAINT "shop_rpg_equipment_pkey" PRIMARY KEY (nick, slot);
ALTER TABLE public."shop_rpg_inventory" ADD CONSTRAINT "shop_rpg_inventory_pkey" PRIMARY KEY (nick, item_id);
ALTER TABLE public."shop_rpg_ledger" ADD CONSTRAINT "shop_rpg_ledger_pkey" PRIMARY KEY (ledger_id);
ALTER TABLE public."shop_rpg_loadout" ADD CONSTRAINT "shop_rpg_loadout_pkey" PRIMARY KEY (nick, item_id);
ALTER TABLE public."shop_sessions" ADD CONSTRAINT "shop_sessions_pkey" PRIMARY KEY (token);
ALTER TABLE public."shop_ui_layouts" ADD CONSTRAINT "shop_ui_layouts_pkey" PRIMARY KEY (layout_key);
ALTER TABLE public."shop_account_activation_links" ADD CONSTRAINT "shop_account_activation_links_activation_token_key" UNIQUE (activation_token);
ALTER TABLE public."shop_perri_chests" ADD CONSTRAINT "shop_perri_chests_redeem_token_key" UNIQUE (redeem_token);
ALTER TABLE public."shop_perripet_inventory" ADD CONSTRAINT "shop_perripet_inventory_quantity_check" CHECK (quantity >= 0);
ALTER TABLE public."shop_rpg_catalog" ADD CONSTRAINT "shop_rpg_catalog_kind_check" CHECK (kind = ANY (ARRAY['weapon'::text, 'potion'::text, 'shield'::text, 'armor'::text, 'reward'::text]));
ALTER TABLE public."shop_rpg_catalog" ADD CONSTRAINT "shop_rpg_catalog_max_quantity_check" CHECK (max_quantity >= 1 AND max_quantity <= 99);
ALTER TABLE public."shop_rpg_catalog" ADD CONSTRAINT "shop_rpg_catalog_price_pg_check" CHECK (price_pg IS NULL OR price_pg >= 0);
ALTER TABLE public."shop_rpg_equipment" ADD CONSTRAINT "shop_rpg_equipment_slot_check" CHECK (slot = ANY (ARRAY['helmet'::text, 'torso'::text, 'hands'::text, 'pants'::text, 'boots'::text, 'amulet'::text]));
ALTER TABLE public."shop_rpg_inventory" ADD CONSTRAINT "shop_rpg_inventory_quantity_check" CHECK (quantity >= 0);
ALTER TABLE public."perri_casillas_games" ADD CONSTRAINT "perri_casillas_games_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_access" ADD CONSTRAINT "shop_access_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_access_requests" ADD CONSTRAINT "shop_access_requests_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_account_activation_links" ADD CONSTRAINT "shop_account_activation_links_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_activity" ADD CONSTRAINT "shop_activity_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_chat_messages" ADD CONSTRAINT "shop_chat_messages_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_chat_messages" ADD CONSTRAINT "shop_chat_messages_reply_to_message_id_fkey" FOREIGN KEY (reply_to_message_id) REFERENCES shop_chat_messages(id) ON DELETE SET NULL;
ALTER TABLE public."shop_chat_presence" ADD CONSTRAINT "shop_chat_presence_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_inventories" ADD CONSTRAINT "shop_inventories_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_inventory_chests" ADD CONSTRAINT "shop_inventory_chests_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_notifications" ADD CONSTRAINT "shop_notifications_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_operations" ADD CONSTRAINT "shop_operations_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_perri_chests" ADD CONSTRAINT "shop_perri_chests_redeemed_by_fkey" FOREIGN KEY (redeemed_by) REFERENCES shop_players(nick) ON DELETE SET NULL;
ALTER TABLE public."shop_perripet_inventory" ADD CONSTRAINT "shop_perripet_inventory_item_id_fkey" FOREIGN KEY (item_id) REFERENCES shop_perripet_item_catalog(item_id) ON DELETE RESTRICT;
ALTER TABLE public."shop_perripet_inventory" ADD CONSTRAINT "shop_perripet_inventory_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_perripet_states" ADD CONSTRAINT "shop_perripet_states_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_profiles" ADD CONSTRAINT "shop_profiles_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_public_users" ADD CONSTRAINT "shop_public_users_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_random_key_claims" ADD CONSTRAINT "shop_random_key_claims_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_random_key_tickets" ADD CONSTRAINT "shop_random_key_tickets_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_rpg_combat_state" ADD CONSTRAINT "shop_rpg_combat_state_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_rpg_equipment" ADD CONSTRAINT "shop_rpg_equipment_item_id_fkey" FOREIGN KEY (item_id) REFERENCES shop_rpg_catalog(item_id) ON DELETE RESTRICT;
ALTER TABLE public."shop_rpg_equipment" ADD CONSTRAINT "shop_rpg_equipment_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_rpg_inventory" ADD CONSTRAINT "shop_rpg_inventory_item_id_fkey" FOREIGN KEY (item_id) REFERENCES shop_rpg_catalog(item_id) ON DELETE RESTRICT;
ALTER TABLE public."shop_rpg_inventory" ADD CONSTRAINT "shop_rpg_inventory_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_rpg_ledger" ADD CONSTRAINT "shop_rpg_ledger_item_id_fkey" FOREIGN KEY (item_id) REFERENCES shop_rpg_catalog(item_id) ON DELETE SET NULL;
ALTER TABLE public."shop_rpg_ledger" ADD CONSTRAINT "shop_rpg_ledger_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_rpg_loadout" ADD CONSTRAINT "shop_rpg_loadout_item_id_fkey" FOREIGN KEY (item_id) REFERENCES shop_rpg_catalog(item_id) ON DELETE CASCADE;
ALTER TABLE public."shop_rpg_loadout" ADD CONSTRAINT "shop_rpg_loadout_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
ALTER TABLE public."shop_sessions" ADD CONSTRAINT "shop_sessions_nick_fkey" FOREIGN KEY (nick) REFERENCES shop_players(nick) ON DELETE CASCADE;
