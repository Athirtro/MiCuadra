-- Panel de administración y tablero del gate (SPEC §6.5, §9).
-- Criterio 4 del gate: entrevistas registradas a mano por el equipo (contador + notas).

set search_path = public, extensions;

create table public.entrevistas (
  id                  uuid primary key default gen_random_uuid(),
  persona             text not null,      -- alias o primer nombre; no hace falta más
  barrio_texto        text,
  confirma_intencion  boolean not null,   -- ¿usaría los mandados?
  notas               text,
  registrada_por      uuid references public.usuarios (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.entrevistas enable row level security;
create trigger set_updated_at before update on public.entrevistas
  for each row execute function public.set_updated_at();

-- Cola de moderación: reportes abiertos primero.
create index incidencias_negocio_idx on public.incidencias (negocio_id, created_at);
create index lista_espera_rol_idx on public.lista_espera (rol, created_at);
