create extension if not exists pgcrypto;

create table if not exists public.shop_players (
  nick text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_inventories (
  nick text primary key references public.shop_players(nick) on delete cascade,
  monedas integer not null default 0,
  llaves integer not null default 0,
  polvo_gema integer not null default 0,
  fragmento_key integer not null default 0,
  perri_cofres integer not null default 0,
  perri_cofres_minijuego integer not null default 0,
  duelo integer not null default 0,
  perricita integer not null default 0,
  pc integer not null default 0,
  chatarra integer not null default 0,
  espada integer not null default 0,
  espada_lv2 integer not null default 0,
  espada_lv3 integer not null default 0,
  escudo integer not null default 0,
  cuchillo integer not null default 0,
  collar integer not null default 0,
  random_key integer not null default 0,
  espada_legendaria integer not null default 0,
  escudo_madera integer not null default 0,
  escudo_metal integer not null default 0,
  escudo_legendario integer not null default 0,
  casco_sushi integer not null default 0,
  guantes_sushi integer not null default 0,
  pechera_sushi integer not null default 0,
  pantalones_sushi integer not null default 0,
  botas_sushi integer not null default 0,
  boleto_sorteo2 integer not null default 0,
  mini_sorteo integer not null default 0,
  pinza_real integer not null default 0,
  agua_divina integer not null default 0,
  espada_sagrada integer not null default 0,
  gema_experiencia integer not null default 0,
  incubadora_mejorada integer not null default 0,
  pocion_divina integer not null default 0,
  reloj_cronotiempo integer not null default 0,
  bolsa_gemas integer not null default 0,
  bolsa_especial integer not null default 0,
  bolsa_chatarra integer not null default 0,
  cajita_armas integer not null default 0,
  revivir_pet integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_perripet_states (
  nick text primary key references public.shop_players(nick) on delete cascade,
  version integer not null default 1,
  pet_state jsonb not null default '{}'::jsonb,
  farm_state jsonb not null default '{}'::jsonb,
  encounters_state jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_perripet_item_catalog (
  item_id text primary key,
  name text not null,
  category text not null,
  source_game text not null default 'perripet',
  target_game text not null default 'perripet',
  tradable boolean not null default false,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_perripet_inventory (
  nick text not null references public.shop_players(nick) on delete cascade,
  item_id text not null references public.shop_perripet_item_catalog(item_id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (nick, item_id)
);

create index if not exists shop_perripet_inventory_nick_idx on public.shop_perripet_inventory(nick);

create table if not exists public.shop_perri_chests (
  chest_id uuid primary key,
  redeem_token text not null unique,
  status text not null default 'issued',
  issued_label text not null default '',
  issued_note text not null default '',
  guaranteed_rewards jsonb not null default '[]'::jsonb,
  extra_reward jsonb,
  rewards jsonb not null default '[]'::jsonb,
  redeemed_by text references public.shop_players(nick) on delete set null,
  issued_at timestamptz not null default now(),
  opening_at timestamptz,
  redeemed_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_inventory_chests (
  chest_id uuid primary key,
  nick text not null references public.shop_players(nick) on delete cascade,
  chest_type text not null,
  status text not null default 'available',
  obtained_at timestamptz not null default now(),
  opened_at timestamptz,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_account_activation_links (
  invite_id uuid primary key,
  nick text not null references public.shop_players(nick) on delete cascade,
  activation_token text not null unique,
  status text not null default 'issued',
  issued_note text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_logo_catalog (
  logo_id text primary key,
  name text not null,
  asset_path text not null,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_profiles (
  nick text primary key references public.shop_players(nick) on delete cascade,
  selected_logo_id text not null default 'logo-pelusa-1',
  owned_logo_ids jsonb not null default '["logo-pelusa-1"]'::jsonb,
  karma text not null default '',
  achievements jsonb not null default '[]'::jsonb,
  selected_title_id text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_public_users (
  nick text primary key references public.shop_players(nick) on delete cascade,
  pc integer not null default 0,
  logo_id text not null default 'logo-pelusa-1',
  karma text not null default '',
  achievements jsonb not null default '[]'::jsonb,
  selected_title_id text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_access (
  nick text primary key references public.shop_players(nick) on delete cascade,
  code_hash text not null,
  active boolean not null default true,
  free_cards_day text not null default '',
  free_duelo_day text not null default '',
  daily_pass_season_id text not null default '',
  daily_pass_claimed_days integer not null default 0,
  daily_pass_last_claim_day text not null default '',
  last_access_at timestamptz,
  last_purchase_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_access_requests (
  request_id uuid primary key default gen_random_uuid(),
  nick text not null references public.shop_players(nick) on delete cascade,
  password_hash text not null,
  status text not null default 'pending',
  request_message text not null default '',
  admin_note text not null default '',
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_sessions (
  token text primary key,
  nick text not null references public.shop_players(nick) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_activity (
  id bigint generated always as identity primary key,
  nick text not null references public.shop_players(nick) on delete cascade,
  game text not null default '',
  result text not null default '',
  details text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.shop_chat_messages (
  id uuid primary key default gen_random_uuid(),
  nick text not null references public.shop_players(nick) on delete cascade,
  logo_id text not null default 'logo-pelusa-1',
  message text not null,
  liked_by_nicks jsonb not null default '[]'::jsonb,
  reactions jsonb not null default '{}'::jsonb,
  reply_to_message_id uuid references public.shop_chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_chat_presence (
  nick text primary key references public.shop_players(nick) on delete cascade,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_notifications (
  id uuid primary key default gen_random_uuid(),
  nick text not null references public.shop_players(nick) on delete cascade,
  kind text not null,
  title text not null default '',
  message text not null default '',
  action_url text not null default '',
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_random_key_pool (
  id bigint generated always as identity primary key,
  game text not null,
  key text not null,
  status text not null default 'Disponible',
  assigned_to text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_random_key_tickets (
  id uuid primary key,
  nick text not null references public.shop_players(nick) on delete cascade,
  status text not null default 'Activa',
  obtained_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_random_key_claims (
  id uuid primary key,
  nick text not null references public.shop_players(nick) on delete cascade,
  game text not null,
  key text not null,
  claimed_at timestamptz not null default now()
);

create table if not exists public.shop_operations (
  operation_id text primary key,
  action text not null,
  nick text not null references public.shop_players(nick) on delete cascade,
  response jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.perri_casillas_games (
  nick text primary key references public.shop_players(nick) on delete cascade,
  round_id text not null,
  cells jsonb not null default '[]'::jsonb,
  board_version integer not null default 3,
  plays_in_window integer not null default 0,
  window_started_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_public_users_pc_idx on public.shop_public_users (pc desc);
create index if not exists shop_sessions_nick_idx on public.shop_sessions (nick);
create index if not exists shop_sessions_expires_idx on public.shop_sessions (expires_at);
create index if not exists shop_access_active_idx on public.shop_access (active);
create index if not exists shop_access_requests_status_requested_idx on public.shop_access_requests (status, requested_at desc);
create index if not exists shop_access_requests_nick_status_idx on public.shop_access_requests (nick, status, requested_at desc);
create index if not exists shop_chat_messages_created_idx on public.shop_chat_messages (created_at desc);
create index if not exists shop_chat_messages_nick_created_idx on public.shop_chat_messages (nick, created_at desc);
create index if not exists shop_chat_messages_reply_idx on public.shop_chat_messages (reply_to_message_id);
create index if not exists shop_chat_presence_last_seen_idx on public.shop_chat_presence (last_seen_at desc);
create index if not exists shop_notifications_nick_created_idx on public.shop_notifications (nick, created_at desc);
create index if not exists shop_notifications_nick_read_created_idx on public.shop_notifications (nick, read_at, created_at desc);
create index if not exists shop_random_key_pool_status_idx on public.shop_random_key_pool (status);
create index if not exists shop_random_key_tickets_nick_status_idx on public.shop_random_key_tickets (nick, status);
create index if not exists shop_random_key_claims_nick_idx on public.shop_random_key_claims (nick);
create index if not exists perri_casillas_games_updated_at_idx on public.perri_casillas_games (updated_at desc);
create index if not exists shop_logo_catalog_enabled_sort_idx on public.shop_logo_catalog (enabled, sort_order, logo_id);
create index if not exists shop_perri_chests_status_issued_idx on public.shop_perri_chests (status, issued_at desc);
create index if not exists shop_perri_chests_redeemed_by_idx on public.shop_perri_chests (redeemed_by, redeemed_at desc);
create index if not exists shop_inventory_chests_nick_status_expires_idx on public.shop_inventory_chests (nick, status, expires_at);
create index if not exists shop_inventory_chests_nick_type_status_idx on public.shop_inventory_chests (nick, chest_type, status, expires_at);
create index if not exists shop_account_activation_links_status_created_idx on public.shop_account_activation_links (status, created_at desc);
create index if not exists shop_account_activation_links_nick_status_idx on public.shop_account_activation_links (nick, status);

insert into public.shop_logo_catalog (logo_id, name, asset_path, sort_order, enabled, is_default, updated_at)
values
  ('logo-pelusa-1', 'Pelusa', './assets/logos-usuario/logo-pelusa-1.png', 10, true, true, now()),
  ('logo-abeja-1', 'Abeja', './assets/logos-usuario/logo-abeja-1.png', 20, true, false, now()),
  ('logo-abuela-1', 'Abuela', './assets/logos-usuario/logo-abuela-1.png', 30, true, false, now()),
  ('logo-amparo-1', 'Amparo', './assets/logos-usuario/logo-amparo-1.png', 40, true, false, now()),
  ('logo-buho-1', 'Buho', './assets/logos-usuario/logo-buho-1.png', 50, true, false, now()),
  ('logo-cabra-1', 'Cabra', './assets/logos-usuario/logo-cabra-1.png', 60, true, false, now()),
  ('logo-cami-1', 'Cami', './assets/logos-usuario/logo-cami-1.png', 70, true, false, now()),
  ('logo-croqueta-1', 'Croqueta', './assets/logos-usuario/logo-croqueta-1.png', 80, true, false, now()),
  ('logo-esq-1', 'Esqueleto', './assets/logos-usuario/logo-esq-1.png', 90, true, false, now()),
  ('logo-estresario-1', 'Estresario', './assets/logos-usuario/logo-estresario-1.png', 100, true, false, now()),
  ('logo-gato-1', 'Gato', './assets/logos-usuario/logo-gato-1.png', 110, true, false, now()),
  ('logo-panda-1', 'Panda', './assets/logos-usuario/logo-panda-1.png', 120, true, false, now()),
  ('logo-slime-1', 'Slime 1', './assets/logos-usuario/logo-slime-1.png', 130, true, false, now()),
  ('logo-slime-2', 'Slime 2', './assets/logos-usuario/logo-slime-2.png', 140, true, false, now())
on conflict (logo_id) do update
set name = excluded.name,
    asset_path = excluded.asset_path,
    sort_order = excluded.sort_order,
    enabled = excluded.enabled,
    is_default = excluded.is_default,
    updated_at = now();

create or replace function public.shop_notify_fragmento_key_delta()
returns trigger
language plpgsql
as $$
declare
  delta integer;
begin
  delta := coalesce(new.fragmento_key, 0) - coalesce(old.fragmento_key, 0);
  if delta > 0 then
    insert into public.shop_notifications (nick, kind, title, message, payload, created_at, updated_at)
    values (
      new.nick,
      'fragmento',
      'Fragmento conseguido',
      'Has conseguido ' || delta::text || ' Fragmento' || case when delta = 1 then '' else 's' end || ' de Key.',
      jsonb_build_object('amount', delta),
      now(),
      now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shop_inventories_notify_fragmento on public.shop_inventories;
create trigger trg_shop_inventories_notify_fragmento
after update of fragmento_key on public.shop_inventories
for each row
execute function public.shop_notify_fragmento_key_delta();

create or replace function public.shop_notify_monedas_delta()
returns trigger
language plpgsql
as $$
declare
  delta integer;
begin
  delta := coalesce(new.monedas, 0) - coalesce(old.monedas, 0);
  if delta > 0 then
    insert into public.shop_notifications (nick, kind, title, message, payload, created_at, updated_at)
    values (
      new.nick,
      'monedas',
      'Monedas conseguidas',
      'Has conseguido ' || delta::text || ' Moneda' || case when delta = 1 then '' else 's' end || '.',
      jsonb_build_object('amount', delta),
      now(),
      now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shop_inventories_notify_monedas on public.shop_inventories;
create trigger trg_shop_inventories_notify_monedas
after update of monedas on public.shop_inventories
for each row
execute function public.shop_notify_monedas_delta();

create or replace function public.shop_notify_llaves_delta()
returns trigger
language plpgsql
as $$
declare
  delta integer;
begin
  delta := coalesce(new.llaves, 0) - coalesce(old.llaves, 0);
  if delta > 0 then
    insert into public.shop_notifications (nick, kind, title, message, payload, created_at, updated_at)
    values (
      new.nick,
      'llaves',
      'Llaves conseguidas',
      'Has conseguido ' || delta::text || ' Llave' || case when delta = 1 then '' else 's' end || '.',
      jsonb_build_object('amount', delta),
      now(),
      now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shop_inventories_notify_llaves on public.shop_inventories;
create trigger trg_shop_inventories_notify_llaves
after update of llaves on public.shop_inventories
for each row
execute function public.shop_notify_llaves_delta();

create or replace function public.shop_notify_perri_cofres_delta()
returns trigger
language plpgsql
as $$
declare
  delta integer;
begin
  delta := coalesce(new.perri_cofres, 0) - coalesce(old.perri_cofres, 0);
  if delta > 0 then
    insert into public.shop_notifications (nick, kind, title, message, payload, created_at, updated_at)
    values (
      new.nick,
      'perri_cofres',
      'Perricofre conseguido',
      'Has conseguido ' || delta::text || ' Perricofre' || case when delta = 1 then '' else 's' end || '.',
      jsonb_build_object('amount', delta),
      now(),
      now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shop_inventories_notify_perri_cofres on public.shop_inventories;
create trigger trg_shop_inventories_notify_perri_cofres
after update of perri_cofres on public.shop_inventories
for each row
execute function public.shop_notify_perri_cofres_delta();

create or replace function public.shop_notify_perri_cofres_minijuego_delta()
returns trigger
language plpgsql
as $$
declare
  delta integer;
begin
  delta := coalesce(new.perri_cofres_minijuego, 0) - coalesce(old.perri_cofres_minijuego, 0);
  if delta > 0 then
    insert into public.shop_notifications (nick, kind, title, message, payload, created_at, updated_at)
    values (
      new.nick,
      'perri_cofres_minijuego',
      'Perricofre de minijuego conseguido',
      'Has conseguido ' || delta::text || ' Perricofre' || case when delta = 1 then '' else 's' end || ' de minijuego.',
      jsonb_build_object('amount', delta),
      now(),
      now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shop_inventories_notify_perri_cofres_minijuego on public.shop_inventories;
create trigger trg_shop_inventories_notify_perri_cofres_minijuego
after update of perri_cofres_minijuego on public.shop_inventories
for each row
execute function public.shop_notify_perri_cofres_minijuego_delta();

create or replace function public.shop_notify_random_key_delta()
returns trigger
language plpgsql
as $$
declare
  delta integer;
begin
  delta := coalesce(new.random_key, 0) - coalesce(old.random_key, 0);
  if delta > 0 then
    insert into public.shop_notifications (nick, kind, title, message, payload, created_at, updated_at)
    values (
      new.nick,
      'random_key',
      'Random Key conseguida',
      'Has conseguido ' || delta::text || ' Random Key' || case when delta = 1 then '' else 's' end || '.',
      jsonb_build_object('amount', delta),
      now(),
      now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shop_inventories_notify_random_key on public.shop_inventories;
create trigger trg_shop_inventories_notify_random_key
after update of random_key on public.shop_inventories
for each row
execute function public.shop_notify_random_key_delta();

create or replace function public.shop_notify_random_key_ticket_insert()
returns trigger
language plpgsql
as $$
begin
  insert into public.shop_notifications (nick, kind, title, message, payload, created_at, updated_at)
  values (
    new.nick,
    'ticket',
    'Ticket recibido',
    'Has recibido 1 Ticket de Random Key.',
    jsonb_build_object('amount', 1),
    now(),
    now()
  );
  return new;
end;
$$;

drop trigger if exists trg_shop_random_key_tickets_notify_insert on public.shop_random_key_tickets;
create trigger trg_shop_random_key_tickets_notify_insert
after insert on public.shop_random_key_tickets
for each row
execute function public.shop_notify_random_key_ticket_insert();

alter table public.shop_players enable row level security;
alter table public.shop_inventories enable row level security;
alter table public.shop_perripet_states enable row level security;
alter table public.shop_perripet_item_catalog enable row level security;
alter table public.shop_perripet_inventory enable row level security;
alter table public.shop_logo_catalog enable row level security;
alter table public.shop_profiles enable row level security;
alter table public.shop_public_users enable row level security;
alter table public.shop_access enable row level security;
alter table public.shop_sessions enable row level security;
alter table public.shop_activity enable row level security;
alter table public.shop_notifications enable row level security;
alter table public.shop_random_key_pool enable row level security;
alter table public.shop_random_key_tickets enable row level security;
alter table public.shop_random_key_claims enable row level security;
alter table public.shop_operations enable row level security;
alter table public.perri_casillas_games enable row level security;
alter table public.shop_perri_chests enable row level security;
alter table public.shop_inventory_chests enable row level security;
alter table public.shop_account_activation_links enable row level security;
