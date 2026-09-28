update public.shop_inventories
set boleto_sorteo2 = 0;

comment on column public.shop_inventories.boleto_sorteo2 is
  'Participaciones activas para el Sorteo 3 (se conserva el nombre fisico por compatibilidad).';
