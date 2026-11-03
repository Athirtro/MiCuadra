-- MiCuadra — esquema base (SPEC.md §8).
-- Convenciones: claves uuid, montos en integer (COP), textos de estado con CHECK,
-- created_at/updated_at en tablas mutables, borrado lógico con deleted_at donde aplica.
-- dia_semana: 0 = domingo … 6 = sábado (igual que extract(dow) de Postgres y Date.getDay()).

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Supabase instala las extensiones en el esquema `extensions`; en Postgres local también.
set search_path = public, extensions;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── Usuarios y roles ─────────────────────────

create table public.usuarios (
  id              uuid primary key references auth.users (id) on delete cascade,
  nombre          text,
  celular         text check (celular ~ '^3\d{9}$'),
  email           text,
  foto_url        text,
  acepta_datos_at timestamptz,
  estado          text not null default 'activo' check (estado in ('activo', 'suspendido')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table public.usuario_roles (
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  rol        text not null check (rol in ('vecino', 'mensajero', 'dueno', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (usuario_id, rol)
);

-- Cada usuario nuevo de Supabase Auth obtiene su fila en `usuarios` con rol vecino.
create or replace function public.crear_usuario_desde_auth() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  insert into public.usuario_roles (usuario_id, rol) values (new.id, 'vecino')
  on conflict do nothing;
  return new;
end $$;

create trigger al_crear_usuario_auth
  after insert on auth.users
  for each row execute function public.crear_usuario_desde_auth();

-- ───────────────────────── Catálogos ─────────────────────────

create table public.barrios (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null,
  nombre                text not null,
  ciudad                text not null default 'Pereira',
  centroide             geography(Point, 4326) not null,
  poligono              geography(Polygon, 4326),
  es_piloto             boolean not null default false,
  centroide_verificado  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (ciudad, slug)
);

create table public.categorias (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  nombre     text not null,
  icono      text not null,
  color      text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  orden      smallint not null default 0,
  activa     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Negocios ─────────────────────────

create table public.negocios (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  nombre             text not null,
  categoria_id       uuid not null references public.categorias (id),
  descripcion        text check (char_length(descripcion) <= 280),
  whatsapp           text check (whatsapp ~ '^3\d{9}$'),
  telefono           text,
  direccion_texto    text,
  barrio_id          uuid references public.barrios (id),
  ubicacion          geography(Point, 4326),
  estado             text not null default 'borrador'
                     check (estado in ('borrador', 'pendiente', 'activo', 'rechazado', 'inactivo')),
  motivo_rechazo     text,
  dueno_id           uuid references public.usuarios (id) on delete set null,
  creado_por_admin   boolean not null default false,
  cerrado_hoy_fecha  date,
  destacado_hasta    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  -- Solo un borrador puede no tener ubicación todavía.
  constraint negocio_con_ubicacion check (estado = 'borrador' or ubicacion is not null)
);
create index negocios_ubicacion_gix on public.negocios using gist (ubicacion);
create index negocios_estado_idx on public.negocios (estado) where deleted_at is null;
create index negocios_categoria_idx on public.negocios (categoria_id);
create index negocios_dueno_idx on public.negocios (dueno_id);

create table public.negocio_fotos (
  id         uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  url        text not null,
  orden      smallint not null check (orden between 0 and 4), -- máximo 5 fotos
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (negocio_id, orden)
);

-- Varias franjas por día. Si cierra < abre, la franja cruza la medianoche.
create table public.negocio_horarios (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null references public.negocios (id) on delete cascade,
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  abre        time not null,
  cierra      time not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (abre <> cierra)
);
create index negocio_horarios_negocio_idx on public.negocio_horarios (negocio_id, dia_semana);

-- ───────────────────────── Lista de espera y eventos ─────────────────────────

create table public.lista_espera (
  id               uuid primary key default gen_random_uuid(),
  rol              text not null check (rol in ('vecino', 'negocio', 'mensajero')),
  nombre           text not null,
  whatsapp         text not null check (whatsapp ~ '^3\d{9}$'),
  barrio_texto     text not null,
  barrio_id        uuid references public.barrios (id),
  negocio_nombre   text,
  negocio_tipo     text,
  que_pediria      text,
  acepta_datos_at  timestamptz not null,
  contactado       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (whatsapp, rol)
);

-- Solo inserción (sin updated_at). Fuente de verdad del tablero del gate (§9).
create table public.eventos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('vista_perfil', 'click_whatsapp', 'click_pedir_mandado',
                                            'click_como_llegar', 'busqueda', 'sesion')),
  negocio_id  uuid references public.negocios (id) on delete set null,
  usuario_id  uuid references public.usuarios (id) on delete set null,
  anon_id     text not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index eventos_tipo_fecha_idx on public.eventos (tipo, created_at);
create index eventos_negocio_idx on public.eventos (negocio_id, tipo, created_at);

-- ───────────────────────── Mensajeros y direcciones ─────────────────────────

create table public.mensajeros (
  usuario_id               uuid primary key references public.usuarios (id) on delete cascade,
  estado                   text not null default 'solicitud'
                           check (estado in ('solicitud', 'aprobado', 'suspendido')),
  nivel                    text not null default 'B' check (nivel in ('B', 'AB')),
  medio                    text not null check (medio in ('pie', 'bici', 'moto')),
  disponible               boolean not null default false,
  ultima_ubicacion         geography(Point, 4326),
  ultima_ubicacion_at      timestamptz,
  documento_verificado_at  timestamptz,
  verificado_por           uuid references public.usuarios (id) on delete set null,
  calificacion_promedio    numeric(2, 1),
  mandados_completados     integer not null default 0,
  suspendido_hasta         timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index mensajeros_ubicacion_gix on public.mensajeros using gist (ultima_ubicacion)
  where disponible;

create table public.mensajero_barrios (
  mensajero_id uuid not null references public.mensajeros (usuario_id) on delete cascade,
  barrio_id    uuid not null references public.barrios (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (mensajero_id, barrio_id)
);

create table public.direcciones (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.usuarios (id) on delete cascade,
  alias         text not null,
  texto         text not null,
  indicaciones  text,
  ubicacion     geography(Point, 4326) not null,
  barrio_id     uuid references public.barrios (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index direcciones_usuario_idx on public.direcciones (usuario_id) where deleted_at is null;

-- ───────────────────────── Mandados ─────────────────────────

create table public.mandados (
  id                    uuid primary key default gen_random_uuid(),
  codigo                text not null unique,
  modalidad             text not null check (modalidad in ('A', 'B')),
  vecino_id             uuid not null references public.usuarios (id),
  mensajero_id          uuid references public.mensajeros (usuario_id),
  negocio_id            uuid references public.negocios (id),
  origen_texto          text not null,
  origen                geography(Point, 4326) not null,
  destino_direccion_id  uuid references public.direcciones (id),
  destino               geography(Point, 4326) not null,
  distancia_m           integer not null check (distancia_m >= 0),
  descripcion           text not null,
  items                 jsonb,
  presupuesto_max       integer check (presupuesto_max > 0),
  valor_productos       integer check (valor_productos >= 0),
  recibo_foto_url       text,
  paquete_foto_url      text,
  tarifa                integer not null check (tarifa >= 0),
  comision_plataforma   integer not null check (comision_plataforma >= 0),
  neto_mensajero        integer not null check (neto_mensajero >= 0),
  estado                text not null default 'creado'
                        check (estado in ('creado', 'aceptado', 'recogido', 'comprado', 'en_camino',
                                          'entregado', 'cancelado', 'expirado', 'con_incidencia')),
  cancelado_por         uuid references public.usuarios (id) on delete set null,
  motivo_cancelacion    text,
  metodo_pago           text check (metodo_pago in ('efectivo', 'nequi', 'wompi')),
  expira_at             timestamptz not null,
  aceptado_at           timestamptz,
  entregado_at          timestamptz,
  confirmado_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (tarifa = comision_plataforma + neto_mensajero),
  check (modalidad = 'B' or presupuesto_max is not null)
);
create index mandados_estado_idx on public.mandados (estado, created_at);
create index mandados_origen_gix on public.mandados using gist (origen) where estado = 'creado';
create index mandados_vecino_idx on public.mandados (vecino_id, created_at desc);
create index mandados_mensajero_idx on public.mandados (mensajero_id, created_at desc);

-- Historial auditable: cada transición de la máquina de estados escribe aquí.
create table public.mandado_eventos (
  id               uuid primary key default gen_random_uuid(),
  mandado_id       uuid not null references public.mandados (id) on delete cascade,
  estado_anterior  text,
  estado_nuevo     text not null,
  actor_id         uuid references public.usuarios (id) on delete set null,
  nota             text,
  created_at       timestamptz not null default now()
);
create index mandado_eventos_mandado_idx on public.mandado_eventos (mandado_id, created_at);

create table public.calificaciones (
  id             uuid primary key default gen_random_uuid(),
  mandado_id     uuid not null references public.mandados (id) on delete cascade,
  de_usuario_id  uuid not null references public.usuarios (id),
  a_usuario_id   uuid not null references public.usuarios (id),
  estrellas      smallint not null check (estrellas between 1 and 5),
  comentario     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (mandado_id, de_usuario_id)
);
create index calificaciones_a_usuario_idx on public.calificaciones (a_usuario_id, created_at desc);

create table public.incidencias (
  id             uuid primary key default gen_random_uuid(),
  mandado_id     uuid references public.mandados (id),
  negocio_id     uuid references public.negocios (id),
  reportado_por  uuid references public.usuarios (id) on delete set null,
  tipo           text not null,
  descripcion    text,
  estado         text not null default 'abierta' check (estado in ('abierta', 'resuelta', 'descartada')),
  resuelta_por   uuid references public.usuarios (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (mandado_id is not null or negocio_id is not null)
);
create index incidencias_estado_idx on public.incidencias (estado, created_at);

-- ───────────────────────── Dinero ─────────────────────────

-- Libro de comisiones del mensajero (solo inserción).
create table public.movimientos (
  id              uuid primary key default gen_random_uuid(),
  mensajero_id    uuid not null references public.mensajeros (usuario_id),
  mandado_id      uuid references public.mandados (id),
  tipo            text not null check (tipo in ('comision_debida', 'pago_comision', 'neto_ganado', 'retiro')),
  monto           integer not null check (monto > 0),
  nota            text,
  registrado_por  uuid references public.usuarios (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index movimientos_mensajero_idx on public.movimientos (mensajero_id, created_at);

create table public.pagos (
  id                  uuid primary key default gen_random_uuid(),
  mandado_id          uuid references public.mandados (id),
  negocio_id          uuid references public.negocios (id),
  proveedor           text not null check (proveedor in ('manual', 'wompi')),
  referencia_externa  text,
  monto               integer not null check (monto >= 0),
  estado              text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  payload             jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- Idempotencia de webhooks: una referencia externa por proveedor.
create unique index pagos_referencia_uix on public.pagos (proveedor, referencia_externa)
  where referencia_externa is not null;

create table public.destacados (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null references public.negocios (id) on delete cascade,
  desde       timestamptz not null,
  hasta       timestamptz not null,
  monto       integer not null check (monto >= 0),
  pago_id     uuid references public.pagos (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (hasta > desde)
);

-- ───────────────────────── Configuración ─────────────────────────

create table public.config (
  clave            text primary key,
  valor            jsonb not null,
  actualizado_por  uuid references public.usuarios (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Triggers de updated_at en todas las tablas que lo tienen.
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at'
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
