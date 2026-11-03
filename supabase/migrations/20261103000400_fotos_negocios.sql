-- Fotos de los negocios en Supabase Storage (SPEC §6.3, §7.7: máximo 5 fotos).
-- Bucket público de solo lectura: la web sube con la sesión del dueño y el API guarda la URL
-- en `negocio_fotos`. Solo el dueño del negocio (o un admin) puede subir o borrar en la
-- carpeta `{negocio_id}/`.
-- En Postgres local no existe el esquema `storage`: ahí la migración no hace nada.

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'Sin esquema storage (Postgres local): se omite el bucket de fotos';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('negocio-fotos', 'negocio-fotos', true, 2097152,
          array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do nothing;

  create or replace function public.puede_editar_fotos(carpeta text) returns boolean
  language sql stable security definer set search_path = public as $f$
    select exists (
      select 1 from public.negocios n
      where n.id::text = carpeta and n.deleted_at is null and n.dueno_id = auth.uid()
    ) or exists (
      select 1 from public.usuario_roles r where r.usuario_id = auth.uid() and r.rol = 'admin'
    )
  $f$;

  create policy "dueno sube fotos de su negocio" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'negocio-fotos'
                and public.puede_editar_fotos((storage.foldername(name))[1]));

  create policy "dueno borra fotos de su negocio" on storage.objects
    for delete to authenticated
    using (bucket_id = 'negocio-fotos'
           and public.puede_editar_fotos((storage.foldername(name))[1]));
end $$;
