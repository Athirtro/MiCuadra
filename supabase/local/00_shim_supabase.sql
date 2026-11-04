-- SOLO para Postgres local (sin Supabase/Docker). Crea lo mínimo que Supabase trae de fábrica
-- para que las migraciones corran igual: esquemas `auth` y `extensions`, `auth.users`,
-- `auth.uid()` y los roles `anon`, `authenticated`, `service_role`.
-- scripts/db.py lo aplica únicamente si el esquema `auth` no existe.

create schema if not exists extensions;
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create table if not exists auth.users (
  id          uuid primary key default gen_random_uuid(),
  email       text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  aud         text default 'authenticated',
  role        text default 'authenticated',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  execute format('alter database %I set search_path = public, extensions', current_database());
end $$;
