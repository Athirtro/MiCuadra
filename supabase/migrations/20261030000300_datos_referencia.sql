-- Datos de referencia necesarios en todos los ambientes (también producción).
-- Los negocios y usuarios de prueba van en el seed (apps/api/scripts/seed.py).

set search_path = public, extensions;

-- Centroides APROXIMADOS: el equipo debe verificarlos en terreno (centroide_verificado = false).
insert into public.barrios (slug, nombre, centroide, es_piloto) values
  ('cuba',      'Cuba',      st_point(-75.7300, 4.7980, 4326)::geography, true),
  ('alamos',    'Álamos',    st_point(-75.6830, 4.8000, 4326)::geography, true),
  ('boston',    'Boston',    st_point(-75.6870, 4.8095, 4326)::geography, true),
  ('el-jardin', 'El Jardín', st_point(-75.6800, 4.7920, 4326)::geography, true)
on conflict (ciudad, slug) do nothing;

insert into public.categorias (slug, nombre, icono, color, orden) values
  ('tienda',        'Tienda',        'store',         '#1E6B4E', 1),
  ('panaderia',     'Panadería',     'croissant',     '#B7791F', 2),
  ('barberia',      'Barbería',      'scissors',      '#2B6CB0', 3),
  ('drogueria',     'Droguería',     'pill',          '#C8462F', 4),
  ('fruver',        'Fruver',        'apple',         '#38A169', 5),
  ('papeleria',     'Papelería',     'pencil',        '#805AD5', 6),
  ('taller',        'Taller',        'wrench',        '#4A5568', 7),
  ('gimnasio',      'Gimnasio',      'dumbbell',      '#D53F8C', 8),
  ('lavanderia',    'Lavandería',    'shirt',         '#319795', 9),
  ('comida-casera', 'Comida casera', 'cooking-pot',   '#DD6B20', 10)
on conflict (slug) do nothing;

-- Reglas de negocio (SPEC.md §7). Editables desde el admin. Montos en pesos enteros.
insert into public.config (clave, valor) values
  ('radio_max_m',                 '1000'),
  ('factor_recorrido',            '1.3'),
  ('metros_por_cuadra',           '100'),
  ('tarifas_b',                   '[{"hasta_m": 400, "tarifa": 1500}, {"hasta_m": 700, "tarifa": 2000}, {"hasta_m": 1000, "tarifa": 3000}]'),
  ('porcentaje_a',                '10'),
  ('tarifa_minima_a',             '2000'),
  ('comision_plataforma_pct',     '20'),
  ('tope_presupuesto_a',          '50000'),
  ('tope_deuda_mensajero',        '20000'),
  ('max_mandados_activos',        '2'),
  ('expiracion_min',              '15'),
  ('autoconfirmacion_min',        '30'),
  ('cancelacion_b_pct',           '50'),
  ('cancelaciones_para_suspender','3'),
  ('suspension_horas',            '48'),
  ('nivel_a_min_mandados',        '10'),
  ('nivel_a_min_calificacion',    '4.5'),
  ('precio_destacado_mes',        '20000'),
  ('metas_gate',                  '{"sesiones_semana": 200, "semanas_seguidas": 3, "retencion_pct": 25, "clics_pedir_mandado_2sem": 40, "entrevistas": 10, "mensajeros_espera": 15, "negocios_activos": 40, "categorias_min": 3}'),
  ('mandados_activos',            'false'),
  ('modalidad_a_activa',          'false'),
  ('pagos_proveedor',             '"manual"')
on conflict (clave) do nothing;
