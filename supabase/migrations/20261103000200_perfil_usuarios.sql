-- Perfil del usuario después de registrarse (formulario de bienvenida).
-- `perfil_completo_at` marca que ya eligió si es vecino o empresario y aceptó el tratamiento
-- de datos (Ley 1581). Hasta entonces la web lo lleva al formulario.

set search_path = public, extensions;

alter table public.usuarios
  add column barrio_id uuid references public.barrios (id) on delete set null,
  add column perfil_completo_at timestamptz;

-- Al registrarse con Google (u otro proveedor) se copian nombre y foto si vienen.
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
  return new;
end $$;
