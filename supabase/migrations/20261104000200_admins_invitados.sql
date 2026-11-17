-- Invitaciones de administrador por correo: quien entre por primera vez con un correo de la
-- lista queda como admin sin que nadie tenga que hacer nada. Si la persona ya tenía cuenta,
-- invitarla le da el rol de una vez. Los correos se cargan aparte (no van en el repositorio).

set search_path = public, extensions;

create table public.admins_invitados (
  email      text primary key check (email = lower(email) and email like '%@%'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admins_invitados enable row level security;
create trigger set_updated_at before update on public.admins_invitados
  for each row execute function public.set_updated_at();

-- Igual que antes (nombre y foto del proveedor, rol vecino) y, si el correo está invitado, admin.
create or replace function public.crear_usuario_desde_auth() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  datos jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.usuarios (id, email, nombre, foto_url)
  values (
    new.id,
    new.email,
    nullif(coalesce(datos ->> 'full_name', datos ->> 'name'), ''),
    nullif(coalesce(datos ->> 'avatar_url', datos ->> 'picture'), '')
  )
  on conflict (id) do nothing;
  insert into public.usuario_roles (usuario_id, rol) values (new.id, 'vecino')
  on conflict do nothing;
  if exists (select 1 from public.admins_invitados where email = lower(new.email)) then
    insert into public.usuario_roles (usuario_id, rol) values (new.id, 'admin')
    on conflict do nothing;
  end if;
  return new;
end $$;

-- Invitar a alguien que ya tiene cuenta le da el rol al instante.
create or replace function public.aplicar_invitacion_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuario_roles (usuario_id, rol)
  select u.id, 'admin' from public.usuarios u where lower(u.email) = new.email
  on conflict do nothing;
  return new;
end $$;

create trigger al_invitar_admin after insert on public.admins_invitados
  for each row execute function public.aplicar_invitacion_admin();
