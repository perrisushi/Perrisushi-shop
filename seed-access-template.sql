insert into public.shop_players (nick, active, updated_at)
values ('TU_NICK', true, now())
on conflict (nick) do update
set active = excluded.active,
    updated_at = now();

insert into public.shop_access (nick, code_hash, active, updated_at)
values (
  'TU_NICK',
  encode(digest('TU_CODIGO', 'sha256'), 'hex'),
  true,
  now()
)
on conflict (nick) do update
set code_hash = excluded.code_hash,
    active = excluded.active,
    updated_at = now();
