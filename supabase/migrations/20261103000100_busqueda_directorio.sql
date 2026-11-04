-- Búsqueda del directorio (SPEC §6.2): sin importar mayúsculas ni tildes, tolerante a errores
-- de tipeo con pg_trgm. `normalizar` es inmutable para poder indexarla (unaccent no lo es).

set search_path = public, extensions;

create or replace function public.normalizar(texto text) returns text
language sql immutable parallel safe as $$
  select translate(lower(coalesce(texto, '')), 'áéíóúüñàèìòùâêîôû', 'aeiouunaeiouaeiou')
$$;

create index negocios_nombre_trgm_idx on public.negocios
  using gin (public.normalizar(nombre) extensions.gin_trgm_ops);
