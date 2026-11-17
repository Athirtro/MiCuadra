-- Los apartados pasan a ser pedidos contra entrega: el vecino elige si lo recoge o si la
-- tienda se lo lleva (domicilio propio de la tienda, todavía sin mensajeros de MiCuadra) y
-- cómo paga al recibir. MiCuadra no cobra ni procesa pagos (ADR-013).
-- Las horas de cada paso alimentan la línea de seguimiento que ve el vecino.

set search_path = public, extensions;

alter table public.apartados
  add column entrega text not null default 'recoger'
    check (entrega in ('recoger', 'domicilio')),
  add column direccion_entrega text
    check (char_length(direccion_entrega) between 5 and 160),
  add column forma_pago text not null default 'efectivo'
    check (forma_pago in ('efectivo', 'transferencia')),
  add column paga_con integer check (paga_con >= 0),   -- billete con el que paga, para el cambio
  add column confirmado_at timestamptz,
  add column listo_at timestamptz,
  add column entregado_at timestamptz,
  add constraint apartados_domicilio_con_direccion
    check (entrega = 'recoger' or direccion_entrega is not null);
