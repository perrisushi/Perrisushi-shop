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
  gemas integer not null default 0,
  polvo_gema integer not null default 0,
  duelo integer not null default 0,
  perricita integer not null default 0,
  pc integer not null default 0,
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
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_profiles (
  nick text primary key references public.shop_players(nick) on delete cascade,
  selected_logo_id text not null default 'logo-abeja-1',
  owned_logo_ids jsonb not null default '["logo-abeja-1"]'::jsonb,
  karma text not null default '',
  achievements jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_public_users (
  nick text primary key references public.shop_players(nick) on delete cascade,
  pc integer not null default 0,
  logo_id text not null default 'logo-abeja-1',
  karma text not null default '',
  achievements jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_access (
  nick text primary key references public.shop_players(nick) on delete cascade,
  code_hash text not null,
  active boolean not null default true,
  last_access_at timestamptz,
  last_purchase_at timestamptz,
  created_at timestamptz not null default now(),
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

create index if not exists shop_public_users_pc_idx on public.shop_public_users (pc desc);
create index if not exists shop_sessions_nick_idx on public.shop_sessions (nick);
create index if not exists shop_sessions_expires_idx on public.shop_sessions (expires_at);
create index if not exists shop_access_active_idx on public.shop_access (active);
create index if not exists shop_random_key_pool_status_idx on public.shop_random_key_pool (status);
create index if not exists shop_random_key_tickets_nick_status_idx on public.shop_random_key_tickets (nick, status);
create index if not exists shop_random_key_claims_nick_idx on public.shop_random_key_claims (nick);

alter table public.shop_players enable row level security;
alter table public.shop_inventories enable row level security;
alter table public.shop_profiles enable row level security;
alter table public.shop_public_users enable row level security;
alter table public.shop_access enable row level security;
alter table public.shop_sessions enable row level security;
alter table public.shop_activity enable row level security;
alter table public.shop_random_key_pool enable row level security;
alter table public.shop_random_key_tickets enable row level security;
alter table public.shop_random_key_claims enable row level security;
alter table public.shop_operations enable row level security;
