create table if not exists public.shop_ui_layouts (
  layout_key text primary key,
  layouts jsonb not null default '{"desktop": {}, "mobile": {}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.shop_ui_layouts enable row level security;

insert into public.shop_ui_layouts (layout_key, layouts)
values ('published', '{"desktop": {}, "mobile": {}}'::jsonb)
on conflict (layout_key) do nothing;
