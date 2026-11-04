-- Catálogo de productos y servicios por negocio, con stock opcional, y apartados: el vecino
-- arma su carrito, MiCuadra guarda el apartado y el negocio lo confirma desde su panel.
-- Se paga en la tienda: aquí no hay pagos (ADR-013 en docs/decisiones.md).

set search_path = public, extensions;

-- Secciones libres que define el dueño ("Panes", "Bebidas", "Cortes"…).
create table public.catalogo_secciones (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null references public.negocios (id) on delete cascade,
  nombre      text not null check (char_length(nombre) between 1 and 40),
  orden       smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index catalogo_secciones_negocio_idx on public.catalogo_secciones (negocio_id, orden);

create table public.catalogo_items (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null references public.negocios (id) on delete cascade,
  seccion_id  uuid references public.catalogo_secciones (id) on delete set null,
  tipo        text not null default 'producto' check (tipo in ('producto', 'servicio')),
  nombre      text not null check (char_length(nombre) between 2 and 80),
  descripcion text check (char_length(descripcion) <= 200),
  precio      integer check (precio >= 0),          -- pesos COP; null = "pregunta el precio"
  foto_url    text,
  stock       integer check (stock >= 0),           -- null = no se controla cantidad
  visible     boolean not null default true,        -- oculto: el dueño lo guarda sin mostrarlo
  orden       smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index catalogo_items_negocio_idx on public.catalogo_items (negocio_id, seccion_id, orden);

-- Apartado: pendiente → confirmado → listo → entregado; cancelado desde cualquiera sin entregar.
-- El stock se descuenta al confirmar y vuelve si se cancela después.
create table public.apartados (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique,             -- corto, para decirlo por WhatsApp (ej. "A7K2")
  negocio_id      uuid not null references public.negocios (id) on delete cascade,
  vecino_id       uuid not null references public.usuarios (id) on delete cascade,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'confirmado', 'listo', 'entregado', 'cancelado')),
  nota            text check (char_length(nota) <= 280),
  total           integer not null default 0 check (total >= 0),   -- suma de los ítems con precio
  hay_sin_precio  boolean not null default false,
  motivo_cancelacion text,
  cancelado_por   text check (cancelado_por in ('vecino', 'negocio')),
  stock_descontado boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index apartados_negocio_idx on public.apartados (negocio_id, estado, created_at desc);
create index apartados_vecino_idx on public.apartados (vecino_id, created_at desc);

-- Copia de nombre y precio al momento de apartar: si el dueño cambia el catálogo, el
-- apartado sigue diciendo lo que el vecino pidió.
create table public.apartado_items (
  id           uuid primary key default gen_random_uuid(),
  apartado_id  uuid not null references public.apartados (id) on delete cascade,
  item_id      uuid references public.catalogo_items (id) on delete set null,
  nombre       text not null,
  precio       integer check (precio >= 0),
  cantidad     integer not null check (cantidad between 1 and 99),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index apartado_items_apartado_idx on public.apartado_items (apartado_id);

do $$
declare t text;
begin
  foreach t in array array['catalogo_secciones', 'catalogo_items', 'apartados', 'apartado_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Lectura pública del catálogo de negocios activos (el resto pasa por el API).
create policy "lectura publica de catalogo" on public.catalogo_secciones
  for select using (
    exists (select 1 from public.negocios n
            where n.id = negocio_id and n.estado = 'activo' and n.deleted_at is null));
create policy "lectura publica de catalogo" on public.catalogo_items
  for select using (
    visible and exists (select 1 from public.negocios n
                        where n.id = negocio_id and n.estado = 'activo' and n.deleted_at is null));
