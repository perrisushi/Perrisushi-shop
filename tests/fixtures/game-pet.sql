alter table public.shop_inventories
  add column if not exists chatarra integer not null default 0;

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

create index if not exists shop_perripet_inventory_nick_idx
  on public.shop_perripet_inventory(nick);

alter table public.shop_perripet_states enable row level security;
alter table public.shop_perripet_item_catalog enable row level security;
alter table public.shop_perripet_inventory enable row level security;

insert into public.shop_perripet_item_catalog
  (item_id, name, category, source_game, target_game, tradable, sort_order)
values
  ('food-normal', 'Comida', 'food', 'perripet', 'perripet', false, 10),
  ('food-prime', 'Comida Prime', 'food', 'perripet', 'perripet', false, 11),
  ('egg-green', 'Huevo verde', 'egg', 'perripet', 'perripet', false, 20),
  ('capsule-g', 'Cápsula G', 'utility', 'perripet', 'perripet', false, 21),
  ('seed-green', 'Semilla verde', 'farm', 'perripet', 'perripet', false, 30),
  ('seed-red', 'Semilla roja', 'farm', 'perripet', 'perripet', false, 31),
  ('fruit-purple', 'Fruto morado', 'farm_reward', 'perripet', 'perripet', true, 32),
  ('fruit-yellow', 'Fruto amarillo', 'farm_reward', 'perripet', 'perripet', true, 33),
  ('plot-unlock', 'Huerto', 'utility', 'perripet', 'perripet', false, 34),
  ('watering-can-normal', 'Regadera normal', 'utility', 'perripet', 'perripet', false, 35),
  ('watering-can-gold', 'Regadera dorada', 'utility', 'perripet', 'perripet', false, 36),
  ('loot-acorn', 'Bellota', 'combat_material', 'perripet', 'perripet', true, 50),
  ('loot-broken-sword', 'Espada rota', 'combat_material', 'perripet', 'perripet', true, 51),
  ('loot-normal-chest', 'Cofre normal', 'combat_material', 'perripet', 'perripet', true, 52),
  ('loot-bear-claw', 'Garra de oso', 'combat_material', 'perripet', 'perripet', true, 53),
  ('loot-bear-hide', 'Piel de oso', 'combat_material', 'perripet', 'perripet', true, 54),
  ('loot-dragon-horn', 'Cuerno de dragón', 'combat_material', 'perripet', 'perripet', true, 55),
  ('loot-gold-chest', 'Cofre de oro', 'combat_material', 'perripet', 'perripet', true, 56)
on conflict (item_id) do update set
  name = excluded.name,
  category = excluded.category,
  source_game = excluded.source_game,
  target_game = excluded.target_game,
  tradable = excluded.tradable,
  enabled = true,
  sort_order = excluded.sort_order,
  updated_at = now();
