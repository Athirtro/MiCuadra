-- Ofertas del día: un producto puede tener un precio rebajado (menor que el normal).
-- null = sin oferta. El apartado cobra el precio de oferta mientras exista.
alter table public.catalogo_items
  add column precio_oferta integer
    check (precio_oferta is null or (precio is not null and precio_oferta >= 0 and precio_oferta < precio));

create index catalogo_items_ofertas_idx on public.catalogo_items (negocio_id)
  where precio_oferta is not null and visible;
