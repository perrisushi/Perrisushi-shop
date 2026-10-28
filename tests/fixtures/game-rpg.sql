alter table public.shop_inventories
  add column if not exists pinza_real integer not null default 0;

create table if not exists public.shop_rpg_catalog (
  item_id text primary key,
  name text not null,
  kind text not null check (kind in ('weapon', 'potion', 'shield', 'armor', 'reward')),
  family text not null default '',
  slot text,
  set_name text,
  price_pg integer check (price_pg is null or price_pg >= 0),
  max_quantity integer not null check (max_quantity between 1 and 99),
  stats jsonb not null default '{}'::jsonb,
  effect text not null default '',
  sort_order integer not null default 0,
  starter boolean not null default false,
  purchasable boolean not null default true,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.shop_rpg_catalog
  add column if not exists starter boolean not null default false;
alter table public.shop_rpg_catalog
  add column if not exists purchasable boolean not null default true;
alter table public.shop_rpg_catalog drop constraint if exists shop_rpg_catalog_kind_check;
alter table public.shop_rpg_catalog
  add constraint shop_rpg_catalog_kind_check check (kind in ('weapon', 'potion', 'shield', 'armor', 'reward'));

create table if not exists public.shop_rpg_inventory (
  nick text not null references public.shop_players(nick) on delete cascade,
  item_id text not null references public.shop_rpg_catalog(item_id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (nick, item_id)
);

create table if not exists public.shop_rpg_equipment (
  nick text not null references public.shop_players(nick) on delete cascade,
  slot text not null check (slot in ('helmet', 'torso', 'hands', 'pants', 'boots', 'amulet')),
  item_id text not null references public.shop_rpg_catalog(item_id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (nick, slot)
);

create table if not exists public.shop_rpg_loadout (
  nick text not null references public.shop_players(nick) on delete cascade,
  item_id text not null references public.shop_rpg_catalog(item_id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (nick, item_id)
);

create table if not exists public.shop_rpg_combat_state (
  nick text primary key references public.shop_players(nick) on delete cascade,
  round_number integer not null default 1,
  player_hp numeric not null default 0,
  player_max_hp numeric not null default 0,
  enemy_hp numeric not null default 5000,
  enemy_max_hp numeric not null default 5000,
  is_undead boolean not null default false,
  player_statuses jsonb not null default '[]'::jsonb,
  enemy_statuses jsonb not null default '[]'::jsonb,
  combat_log jsonb not null default '[]'::jsonb,
  reward_claimed boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.shop_rpg_combat_state
  add column if not exists reward_claimed boolean not null default false;

create table if not exists public.shop_rpg_ledger (
  ledger_id bigint generated always as identity primary key,
  nick text not null references public.shop_players(nick) on delete cascade,
  action text not null,
  item_id text references public.shop_rpg_catalog(item_id) on delete set null,
  quantity_delta integer not null default 0,
  pg_delta integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists shop_rpg_inventory_nick_idx on public.shop_rpg_inventory(nick);
create index if not exists shop_rpg_ledger_nick_created_idx on public.shop_rpg_ledger(nick, created_at desc);

alter table public.shop_rpg_catalog enable row level security;
alter table public.shop_rpg_inventory enable row level security;
alter table public.shop_rpg_equipment enable row level security;
alter table public.shop_rpg_loadout enable row level security;
alter table public.shop_rpg_combat_state enable row level security;
alter table public.shop_rpg_ledger enable row level security;

insert into public.shop_rpg_catalog
  (item_id, name, kind, family, slot, set_name, price_pg, max_quantity, stats, effect, sort_order)
values
  ('sword-worn', 'Espada desgastada', 'weapon', 'Espadas', null, null, 1, 99, '{"damage":30,"damageType":"physical"}', 'Permite usar un escudo como segunda acción.', 10),
  ('sword-shining', 'Espada reluciente', 'weapon', 'Espadas', null, null, 100, 99, '{"damage":45,"damageType":"physical"}', 'Permite usar un escudo como segunda acción.', 11),
  ('sword-royal', 'Espada real', 'weapon', 'Espadas', null, null, 500, 99, '{"damage":60,"damageType":"physical"}', 'Permite usar un escudo como segunda acción.', 12),
  ('greatsword-rusted', 'Mandoble oxidado', 'weapon', 'Mandobles', null, null, 1, 99, '{"damage":50,"damageType":"physical","turnCost":2,"stunChance":20}', 'Daño según HP enemigo y 20% de Aturdir.', 20),
  ('greatsword-executioner', 'Mandoble del verdugo', 'weapon', 'Mandobles', null, null, 100, 99, '{"damage":75,"damageType":"physical","turnCost":2,"stunChance":20}', 'Daño según HP enemigo y 20% de Aturdir.', 21),
  ('greatsword-worldbreaker', 'Mandoble quebramundos', 'weapon', 'Mandobles', null, null, 500, 99, '{"damage":100,"damageType":"physical","turnCost":2,"stunChance":20}', 'Daño según HP enemigo y 20% de Aturdir.', 22),
  ('device-broken-wand', 'Varita quebrada', 'weapon', 'Artilugios', null, null, 1, 99, '{"damage":32,"damageType":"spiritual"}', 'Inflige daño espiritual.', 30),
  ('device-mage-ring', 'Anillo de mago', 'weapon', 'Artilugios', null, null, 100, 99, '{"damage":54,"damageType":"spiritual"}', 'Inflige daño espiritual.', 31),
  ('device-arcane-staff', 'Bastón arcano', 'weapon', 'Artilugios', null, null, 500, 99, '{"damage":78,"damageType":"spiritual"}', 'Inflige daño espiritual.', 32),
  ('projectile-wood-arrow', 'Flecha de madera', 'weapon', 'Proyectiles', null, null, 1, 99, '{"damage":12,"damageType":"physical","hits":2,"criticalBonus":50}', 'Dos impactos con +50% de Crítico cada uno.', 40),
  ('projectile-shuriken', 'Shuriken', 'weapon', 'Proyectiles', null, null, 100, 99, '{"damage":18,"damageType":"physical","hits":2,"criticalBonus":50}', 'Dos impactos con +50% de Crítico cada uno.', 41),
  ('projectile-golden-spear', 'Lanza dorada', 'weapon', 'Proyectiles', null, null, 500, 99, '{"damage":27,"damageType":"physical","hits":2,"criticalBonus":50}', 'Dos impactos con +50% de Crítico cada uno.', 42),
  ('shield-broken', 'Escudo roto', 'shield', 'Escudos', null, null, 1, 99, '{"physicalReduction":20,"turns":1}', 'Reduce un 20% el daño físico.', 50),
  ('shield-oak', 'Escudo roble', 'shield', 'Escudos', null, null, 100, 99, '{"physicalReduction":35,"spiritualReduction":20,"turns":1}', 'Reduce un 35% el daño físico y un 20% el daño espiritual.', 51),
  ('shield-metal', 'Escudo metal', 'shield', 'Escudos', null, null, 500, 99, '{"allReduction":50,"turns":1}', 'Reduce un 50% todo el daño.', 52),
  ('potion-weak', 'Poción débil', 'potion', 'Pociones', null, null, 25, 30, '{"heal":50}', 'Recupera 50 HP.', 60),
  ('potion-standard', 'Poción', 'potion', 'Pociones', null, null, 75, 30, '{"heal":75}', 'Recupera 75 HP.', 61),
  ('potion-potent', 'Poción potente', 'potion', 'Pociones', null, null, 200, 30, '{"heal":120}', 'Recupera 120 HP.', 62),
  ('potion-armor', 'Poción armadura', 'potion', 'Pociones', null, null, 150, 30, '{"physicalDefense":30,"spiritualDefense":30,"turns":3}', '+30 a ambas defensas durante 3 turnos.', 63),
  ('potion-critical', 'Poción crítica', 'potion', 'Pociones', null, null, 150, 30, '{"critical":15,"turns":3}', '+15% de Crítico durante 3 turnos.', 64),
  ('potion-master', 'Poción maestra', 'potion', 'Pociones', null, null, 250, 30, '{"dexterity":20,"turns":3}', '+20% de Destreza durante 3 turnos.', 65),
  ('migajas-helmet', 'Sombrero de Mendrugo', 'armor', 'Casco', 'helmet', 'Set de Migajas', null, 1, '{"hp":25,"physicalDefense":3,"karma":0}', 'Pieza inicial del Set de Migajas.', 90),
  ('migajas-torso', 'Chaleco Remendado', 'armor', 'Torso', 'torso', 'Set de Migajas', null, 1, '{"hp":40,"physicalDefense":4,"karma":0}', 'Pieza inicial del Set de Migajas.', 91),
  ('migajas-hands', 'Mitones Migajosos', 'armor', 'Manos', 'hands', 'Set de Migajas', null, 1, '{"physicalAttack":2,"spiritualAttack":1,"dexterity":1,"karma":0}', 'Pieza inicial del Set de Migajas.', 92),
  ('migajas-pants', 'Calzones Zurcidos', 'armor', 'Pantalones', 'pants', 'Set de Migajas', null, 1, '{"physicalDefense":3,"spiritualDefense":3,"karma":0}', 'Pieza inicial del Set de Migajas.', 93),
  ('migajas-boots', 'Botas de Pan Viejo', 'armor', 'Botas', 'boots', 'Set de Migajas', null, 1, '{"spiritualDefense":3,"critical":1,"karma":0}', 'Pieza inicial del Set de Migajas.', 94),
  ('migajas-amulet', 'Colgante de Corteza', 'armor', 'Amuleto', 'amulet', 'Set de Migajas', null, 1, '{"hp":10,"physicalAttack":1,"spiritualAttack":1,"karma":0}', 'Pieza inicial del Set de Migajas.', 95),
  ('turrones-helmet', 'Corona de Almendra', 'armor', 'Casco', 'helmet', 'Dios de los Turrones', 1200, 1, '{"hp":120,"physicalDefense":20,"karma":2}', 'Pieza del set Dios de los Turrones.', 100),
  ('turrones-torso', 'Coraza de Mazapán', 'armor', 'Torso', 'torso', 'Dios de los Turrones', 1600, 1, '{"hp":200,"physicalDefense":15,"karma":3}', 'Pieza del set Dios de los Turrones.', 101),
  ('turrones-hands', 'Guantes de Caramelo', 'armor', 'Manos', 'hands', 'Dios de los Turrones', 1800, 1, '{"physicalAttack":10,"spiritualAttack":0,"dexterity":2,"karma":4}', 'Pieza del set Dios de los Turrones.', 102),
  ('turrones-pants', 'Grebas de Miel', 'armor', 'Pantalones', 'pants', 'Dios de los Turrones', 1000, 1, '{"physicalDefense":15,"spiritualDefense":5,"karma":2}', 'Pieza del set Dios de los Turrones.', 103),
  ('turrones-boots', 'Botas de Canela', 'armor', 'Botas', 'boots', 'Dios de los Turrones', 1100, 1, '{"spiritualDefense":10,"critical":3,"karma":2}', 'Pieza del set Dios de los Turrones.', 104),
  ('turrones-amulet', 'Estrella de Azúcar', 'armor', 'Amuleto', 'amulet', 'Dios de los Turrones', 900, 1, '{"physicalAttack":5,"critical":3,"karma":1}', 'Pieza del set Dios de los Turrones.', 105),
  ('sushi-helmet', 'Kabuto del Sushi Maldito', 'armor', 'Casco', 'helmet', 'Sushi maldito', 2500, 1, '{"hp":450,"physicalDefense":30,"karma":-5}', 'Pieza del set Sushi maldito.', 110),
  ('sushi-torso', 'Coraza del Nigiri Negro', 'armor', 'Torso', 'torso', 'Sushi maldito', 1700, 1, '{"hp":250,"physicalDefense":15,"karma":-3}', 'Pieza del set Sushi maldito.', 111),
  ('sushi-hands', 'Garras de Wasabi', 'armor', 'Manos', 'hands', 'Sushi maldito', 1400, 1, '{"physicalAttack":5,"spiritualAttack":10,"dexterity":0,"karma":-1}', 'Pieza del set Sushi maldito.', 112),
  ('sushi-pants', 'Hakama Abisal', 'armor', 'Pantalones', 'pants', 'Sushi maldito', 1600, 1, '{"physicalDefense":15,"spiritualDefense":30,"karma":-2}', 'Pieza del set Sushi maldito.', 113),
  ('sushi-boots', 'Pasos del Fugu', 'armor', 'Botas', 'boots', 'Sushi maldito', 1800, 1, '{"spiritualDefense":15,"critical":10,"karma":-3}', 'Pieza del set Sushi maldito.', 114),
  ('sushi-amulet', 'Ojo del Itamae Caído', 'armor', 'Amuleto', 'amulet', 'Sushi maldito', 1600, 1, '{"hp":100,"spiritualAttack":10,"critical":3,"karma":-2}', 'Pieza del set Sushi maldito.', 115),
  ('pinguino-helmet', 'Capucha del Pingüino', 'armor', 'Casco', 'helmet', 'Alegrías del pingüino', 1400, 1, '{"hp":180,"physicalDefense":16,"karma":1}', 'Pieza híbrida de Alegrías del pingüino.', 120),
  ('pinguino-torso', 'Plumaje Festivo', 'armor', 'Torso', 'torso', 'Alegrías del pingüino', 1500, 1, '{"hp":260,"physicalDefense":12,"karma":-2}', 'Pieza híbrida de Alegrías del pingüino.', 121),
  ('pinguino-hands', 'Aletas Risueñas', 'armor', 'Manos', 'hands', 'Alegrías del pingüino', 1700, 1, '{"physicalAttack":7,"spiritualAttack":7,"dexterity":3,"karma":1}', 'Pieza híbrida de Alegrías del pingüino.', 122),
  ('pinguino-pants', 'Pantalón del Témpano', 'armor', 'Pantalones', 'pants', 'Alegrías del pingüino', 1200, 1, '{"physicalDefense":10,"spiritualDefense":16,"karma":-1}', 'Pieza híbrida de Alegrías del pingüino.', 123),
  ('pinguino-boots', 'Patas de Carnaval', 'armor', 'Botas', 'boots', 'Alegrías del pingüino', 1300, 1, '{"spiritualDefense":12,"critical":5,"karma":1}', 'Pieza híbrida de Alegrías del pingüino.', 124),
  ('pinguino-amulet', 'Cascabel Polar', 'armor', 'Amuleto', 'amulet', 'Alegrías del pingüino', 1100, 1, '{"hp":60,"physicalAttack":4,"spiritualAttack":5,"critical":2,"karma":-1}', 'Pieza híbrida de Alegrías del pingüino.', 125)
on conflict (item_id) do update set
  name = excluded.name,
  kind = excluded.kind,
  family = excluded.family,
  slot = excluded.slot,
  set_name = excluded.set_name,
  price_pg = excluded.price_pg,
  max_quantity = excluded.max_quantity,
  stats = excluded.stats,
  effect = excluded.effect,
  sort_order = excluded.sort_order,
  enabled = true,
  updated_at = now();

update public.shop_rpg_catalog
set starter = (set_name = 'Set de Migajas')
where kind = 'armor';

-- La tienda propia de PerriRPG solo vende el equipo básico de 1 G,
-- la Poción débil y las armaduras. Los demás objetos siguen habilitados
-- y utilizables, pero se obtienen/compran desde PerriPet.
update public.shop_rpg_catalog
set purchasable = (
  kind = 'armor'
  or item_id in (
    'sword-worn',
    'greatsword-rusted',
    'device-broken-wand',
    'projectile-wood-arrow',
    'shield-broken',
    'potion-weak'
  )
),
updated_at = now()
where kind in ('weapon', 'potion', 'shield', 'armor');

insert into public.shop_rpg_catalog
  (item_id, name, kind, family, price_pg, max_quantity, stats, effect, sort_order, starter, purchasable, enabled, updated_at)
values
  ('boss-reward-royal-claw', 'Pinza Real', 'reward', 'Recompensas', null, 99, '{"image":"./assets/item-Pinza-Real.png"}', 'Trofeo obtenido al derrotar al Rey Cangrosio IV.', 200, false, false, true, now())
on conflict (item_id) do update set
  name = excluded.name,
  kind = excluded.kind,
  family = excluded.family,
  price_pg = null,
  max_quantity = 99,
  stats = excluded.stats,
  effect = excluded.effect,
  sort_order = excluded.sort_order,
  starter = false,
  purchasable = false,
  enabled = true,
  updated_at = now();

insert into public.shop_rpg_inventory (nick, item_id, quantity, updated_at)
select player.nick, item.item_id, 1, now()
from public.shop_players player
cross join public.shop_rpg_catalog item
where item.starter = true
on conflict (nick, item_id) do nothing;

insert into public.shop_rpg_equipment (nick, slot, item_id, updated_at)
select player.nick, item.slot, item.item_id, now()
from public.shop_players player
cross join public.shop_rpg_catalog item
where item.starter = true and item.slot is not null
on conflict (nick, slot) do nothing;

create or replace function public.shop_rpg_ensure_starter_set(p_nick text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.shop_rpg_inventory (nick, item_id, quantity, updated_at)
  select p_nick, item_id, 1, now()
  from public.shop_rpg_catalog
  where starter = true and enabled = true
  on conflict (nick, item_id) do nothing;

  insert into public.shop_rpg_equipment (nick, slot, item_id, updated_at)
  select p_nick, slot, item_id, now()
  from public.shop_rpg_catalog
  where starter = true and enabled = true and slot is not null
  on conflict (nick, slot) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.shop_rpg_purchase_item(p_nick text, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.shop_rpg_catalog%rowtype;
  v_pg integer;
  v_quantity integer;
begin
  select * into v_item from public.shop_rpg_catalog where item_id = p_item_id and enabled = true;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_item'); end if;
  if v_item.price_pg is null then return jsonb_build_object('ok', false, 'error', 'price_pending'); end if;

  select polvo_gema into v_pg from public.shop_inventories where nick = p_nick for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'inventory_not_found'); end if;

  select coalesce(quantity, 0) into v_quantity from public.shop_rpg_inventory where nick = p_nick and item_id = p_item_id;
  v_quantity := coalesce(v_quantity, 0);
  if v_quantity >= v_item.max_quantity then
    return jsonb_build_object('ok', false, 'error', 'max_quantity', 'quantity', v_quantity, 'maxQuantity', v_item.max_quantity, 'pg', v_pg);
  end if;
  if v_pg < v_item.price_pg then
    return jsonb_build_object('ok', false, 'error', 'not_enough_polvoGema', 'quantity', v_quantity, 'pg', v_pg);
  end if;

  update public.shop_inventories set polvo_gema = polvo_gema - v_item.price_pg, updated_at = now() where nick = p_nick;
  insert into public.shop_rpg_inventory (nick, item_id, quantity, updated_at)
  values (p_nick, p_item_id, 1, now())
  on conflict (nick, item_id) do update set quantity = public.shop_rpg_inventory.quantity + 1, updated_at = now()
  returning quantity into v_quantity;
  insert into public.shop_rpg_ledger (nick, action, item_id, quantity_delta, pg_delta)
  values (p_nick, 'purchase', p_item_id, 1, -v_item.price_pg);
  return jsonb_build_object('ok', true, 'itemId', p_item_id, 'quantity', v_quantity, 'pg', v_pg - v_item.price_pg);
end;
$$;

create or replace function public.shop_rpg_consume_item(p_nick text, p_item_id text, p_quantity integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_current integer; v_next integer;
begin
  if p_quantity < 1 then return jsonb_build_object('ok', false, 'error', 'invalid_quantity'); end if;
  select quantity into v_current from public.shop_rpg_inventory where nick = p_nick and item_id = p_item_id for update;
  if coalesce(v_current, 0) < p_quantity then
    return jsonb_build_object('ok', false, 'error', 'item_unavailable', 'quantity', coalesce(v_current, 0));
  end if;
  v_next := v_current - p_quantity;
  update public.shop_rpg_inventory set quantity = v_next, updated_at = now() where nick = p_nick and item_id = p_item_id;
  if v_next = 0 then delete from public.shop_rpg_loadout where nick = p_nick and item_id = p_item_id; end if;
  insert into public.shop_rpg_ledger (nick, action, item_id, quantity_delta) values (p_nick, 'consume', p_item_id, -p_quantity);
  return jsonb_build_object('ok', true, 'itemId', p_item_id, 'quantity', v_next);
end;
$$;

create or replace function public.shop_rpg_purchase_items(p_nick text, p_item_id text, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.shop_rpg_catalog%rowtype;
  v_pg integer;
  v_current integer;
  v_purchase integer;
  v_cost integer;
  v_final integer;
begin
  if p_quantity not in (1, 5, 30) then
    return jsonb_build_object('ok', false, 'error', 'invalid_quantity');
  end if;

  select * into v_item
  from public.shop_rpg_catalog
  where item_id = p_item_id and enabled = true and purchasable = true;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_item'); end if;
  if v_item.price_pg is null then return jsonb_build_object('ok', false, 'error', 'price_pending'); end if;

  select polvo_gema into v_pg
  from public.shop_inventories
  where nick = p_nick
  for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'inventory_not_found'); end if;

  select coalesce(quantity, 0) into v_current
  from public.shop_rpg_inventory
  where nick = p_nick and item_id = p_item_id;
  v_current := coalesce(v_current, 0);
  if v_current >= v_item.max_quantity then
    return jsonb_build_object('ok', false, 'error', 'max_quantity', 'quantity', v_current, 'maxQuantity', v_item.max_quantity, 'pg', v_pg);
  end if;

  v_purchase := least(p_quantity, v_item.max_quantity - v_current);
  v_cost := v_item.price_pg * v_purchase;
  if v_pg < v_cost then
    return jsonb_build_object('ok', false, 'error', 'not_enough_polvoGema', 'quantity', v_current, 'purchaseQuantity', v_purchase, 'requiredPg', v_cost, 'pg', v_pg);
  end if;

  update public.shop_inventories
  set polvo_gema = polvo_gema - v_cost, updated_at = now()
  where nick = p_nick;

  insert into public.shop_rpg_inventory (nick, item_id, quantity, updated_at)
  values (p_nick, p_item_id, v_purchase, now())
  on conflict (nick, item_id) do update
  set quantity = public.shop_rpg_inventory.quantity + v_purchase, updated_at = now()
  returning quantity into v_final;

  insert into public.shop_rpg_ledger (nick, action, item_id, quantity_delta, pg_delta, details)
  values (p_nick, 'purchase', p_item_id, v_purchase, -v_cost, jsonb_build_object('requestedQuantity', p_quantity));

  return jsonb_build_object(
    'ok', true,
    'itemId', p_item_id,
    'requestedQuantity', p_quantity,
    'purchasedQuantity', v_purchase,
    'adjustedToMaximum', v_purchase < p_quantity,
    'quantity', v_final,
    'totalCost', v_cost,
    'pg', v_pg - v_cost
  );
end;
$$;

create or replace function public.shop_rpg_equip_armor(p_nick text, p_slot text, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_slot text;
begin
  select slot into v_slot from public.shop_rpg_catalog where item_id = p_item_id and kind = 'armor' and enabled = true;
  if v_slot is null or v_slot <> p_slot then return jsonb_build_object('ok', false, 'error', 'invalid_armor'); end if;
  if not exists (select 1 from public.shop_rpg_inventory where nick = p_nick and item_id = p_item_id and quantity > 0) then
    return jsonb_build_object('ok', false, 'error', 'armor_not_owned');
  end if;
  insert into public.shop_rpg_equipment (nick, slot, item_id, updated_at) values (p_nick, p_slot, p_item_id, now())
  on conflict (nick, slot) do update set item_id = excluded.item_id, updated_at = now();
  return jsonb_build_object('ok', true, 'slot', p_slot, 'itemId', p_item_id);
end;
$$;

create or replace function public.shop_rpg_set_loadout(p_nick text, p_item_id text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_enabled then
    if not exists (
      select 1 from public.shop_rpg_inventory i join public.shop_rpg_catalog c on c.item_id = i.item_id
      where i.nick = p_nick and i.item_id = p_item_id and i.quantity > 0 and c.kind in ('weapon', 'potion', 'shield')
    ) then return jsonb_build_object('ok', false, 'error', 'item_not_owned'); end if;
    insert into public.shop_rpg_loadout (nick, item_id, enabled, updated_at) values (p_nick, p_item_id, true, now())
    on conflict (nick, item_id) do update set enabled = true, updated_at = now();
  else
    delete from public.shop_rpg_loadout where nick = p_nick and item_id = p_item_id;
  end if;
  return jsonb_build_object('ok', true, 'itemId', p_item_id, 'enabled', p_enabled);
end;
$$;

create or replace function public.shop_rpg_claim_boss_reward(p_nick text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enemy_hp numeric;
  v_claimed boolean;
  v_quantity integer;
begin
  select enemy_hp, reward_claimed into v_enemy_hp, v_claimed
  from public.shop_rpg_combat_state
  where nick = p_nick
  for update;

  if not found or v_enemy_hp > 0 then
    return jsonb_build_object('ok', false, 'error', 'boss_not_defeated');
  end if;
  if v_claimed then
    return jsonb_build_object('ok', false, 'error', 'reward_already_claimed');
  end if;

  select coalesce(pinza_real, 0) into v_quantity
  from public.shop_inventories
  where nick = p_nick
  for update;
  v_quantity := coalesce(v_quantity, 0);

  update public.shop_rpg_combat_state set reward_claimed = true, updated_at = now() where nick = p_nick;
  update public.shop_inventories
  set pinza_real = pinza_real + 1, updated_at = now()
  where nick = p_nick
  returning pinza_real into v_quantity;

  insert into public.shop_rpg_ledger (nick, action, item_id, quantity_delta, details)
  values (p_nick, 'boss_reward', 'boss-reward-royal-claw', 1, '{"boss":"Rey Cangrosio IV"}'::jsonb);

  return jsonb_build_object('ok', true, 'granted', true, 'inventoryKey', 'pinzaReal', 'quantity', v_quantity);
end;
$$;

revoke all on function public.shop_rpg_purchase_item(text, text) from public;
revoke all on function public.shop_rpg_consume_item(text, text, integer) from public;
revoke all on function public.shop_rpg_equip_armor(text, text, text) from public;
revoke all on function public.shop_rpg_set_loadout(text, text, boolean) from public;
revoke all on function public.shop_rpg_ensure_starter_set(text) from public;
revoke all on function public.shop_rpg_claim_boss_reward(text) from public;
revoke all on function public.shop_rpg_purchase_items(text, text, integer) from public;
grant execute on function public.shop_rpg_purchase_item(text, text) to service_role;
grant execute on function public.shop_rpg_consume_item(text, text, integer) to service_role;
grant execute on function public.shop_rpg_equip_armor(text, text, text) to service_role;
grant execute on function public.shop_rpg_set_loadout(text, text, boolean) to service_role;
grant execute on function public.shop_rpg_ensure_starter_set(text) to service_role;
grant execute on function public.shop_rpg_claim_boss_reward(text) to service_role;
grant execute on function public.shop_rpg_purchase_items(text, text, integer) to service_role;
