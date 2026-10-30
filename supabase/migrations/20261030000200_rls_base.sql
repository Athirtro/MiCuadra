-- RLS base. El acceso principal es vía API (rol con BYPASSRLS / service_role), así que por
-- defecto todo queda cerrado para `anon` y `authenticated`. Solo se abre lectura pública de
-- lo que el directorio muestra y la lectura de los datos propios.

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Directorio público
create policy "lectura publica" on public.categorias
  for select to anon, authenticated using (activa);

create policy "lectura publica" on public.barrios
  for select to anon, authenticated using (true);

create policy "lectura publica de activos" on public.negocios
  for select to anon, authenticated using (estado = 'activo' and deleted_at is null);

create policy "lectura publica de activos" on public.negocio_fotos
  for select to anon, authenticated using (
    exists (select 1 from public.negocios n
            where n.id = negocio_id and n.estado = 'activo' and n.deleted_at is null));

create policy "lectura publica de activos" on public.negocio_horarios
  for select to anon, authenticated using (
    exists (select 1 from public.negocios n
            where n.id = negocio_id and n.estado = 'activo' and n.deleted_at is null));

-- Datos propios
create policy "mi usuario" on public.usuarios
  for select to authenticated using (id = auth.uid());

create policy "mis roles" on public.usuario_roles
  for select to authenticated using (usuario_id = auth.uid());

create policy "mis negocios" on public.negocios
  for select to authenticated using (dueno_id = auth.uid());

create policy "mis direcciones" on public.direcciones
  for select to authenticated using (usuario_id = auth.uid() and deleted_at is null);

-- Realtime (Fase 2): el vecino y el mensajero asignado pueden leer su mandado.
create policy "participantes del mandado" on public.mandados
  for select to authenticated using (vecino_id = auth.uid() or mensajero_id = auth.uid());

create policy "participantes del mandado" on public.mandado_eventos
  for select to authenticated using (
    exists (select 1 from public.mandados m
            where m.id = mandado_id and (m.vecino_id = auth.uid() or m.mensajero_id = auth.uid())));
