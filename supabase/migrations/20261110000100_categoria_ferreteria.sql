-- Ferreterías: el equipo las está cargando en los barrios piloto y no tenían categoría.
insert into public.categorias (slug, nombre, icono, color, orden) values
  ('ferreteria', 'Ferretería', 'hammer', '#9C4221', 11)
on conflict (slug) do nothing;
