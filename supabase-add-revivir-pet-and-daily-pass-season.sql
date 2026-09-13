alter table public.shop_inventories
  add column if not exists revivir_pet integer not null default 0;

alter table public.shop_access
  add column if not exists daily_pass_season_id text not null default '';

comment on column public.shop_inventories.revivir_pet is
  'Consumible de un solo uso que revive una mascota de PerriPet sin gastar gemas.';

comment on column public.shop_access.daily_pass_season_id is
  'Identificador del pase diario al que pertenecen claimed_days y last_claim_day.';
