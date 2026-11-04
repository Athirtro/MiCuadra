# Registro de decisiones (ADR corto)

Formato: contexto → decisión → consecuencias. Las marcadas *(default SPEC)* aplican un
**[DEFAULT]** de la especificación y el equipo puede cambiarlas.

---

### ADR‑001 · Monorepo dentro de `Athirtro/MiCuadra` *(default SPEC §14.7)*
- **Decisión:** se construye en el mismo repo. Los `.md` originales pasan a `docs/`, la landing
  (`index.html`) a `landing/micuadra-landing.html`, la especificación queda en `SPEC.md`.
- **Consecuencias:** el historial del proyecto se conserva; los enlaces del README se actualizaron.

### ADR‑002 · El esquema vive en SQL de Supabase, sin Alembic
- **Contexto:** la SPEC pide "SQLAlchemy 2 + Alembic" (§4) y a la vez "/supabase → migraciones
  SQL, políticas RLS, seed". Tener dos fuentes de verdad del esquema es frágil, y RLS, triggers
  sobre `auth.users` y PostGIS se expresan mejor en SQL plano.
- **Decisión:** `supabase/migrations/*.sql` es la única fuente de verdad. `apps/api/scripts/db.py`
  las aplica en orden y registra cada una en `ops.migraciones` (sirve igual para local y para
  Supabase, sin instalar la CLI de Supabase). SQLAlchemy se usa para conexión/consultas; los
  modelos ORM se agregan cuando un módulo los necesite. No se usa Alembic.
- **Consecuencias:** nunca editar una migración aplicada; crear una nueva.

### ADR‑003 · Postgres local sin Docker
- **Contexto:** `supabase start` requiere Docker; el equipo trabaja en laptops modestas.
- **Decisión:** en local se usa Postgres + PostGIS nativo (Homebrew o Postgres.app).
  `supabase/local/00_shim_supabase.sql` crea lo mínimo que Supabase trae de fábrica (`auth.users`,
  `auth.uid()`, roles `anon`/`authenticated`/`service_role`, esquema `extensions`) y solo se
  aplica si el esquema `auth` no existe. CI usa la imagen `postgis/postgis`.
- **Consecuencias:** quien tenga Docker puede usar `supabase start` igual; las migraciones son las mismas.

### ADR‑004 · Validación del JWT de Supabase
- **Decisión:** si `SUPABASE_JWT_SECRET` está definido se valida HS256 (secreto legado y local);
  si no, se validan ES256/RS256 con el JWKS del proyecto (`/auth/v1/.well-known/jwks.json`).
  Audiencia `authenticated`. Los roles se leen de `usuario_roles` en cada request; una cuenta
  `suspendido` recibe 403.
- **Consecuencias:** `scripts/firmar_token.py` (`make token`) firma tokens de desarrollo para
  usuarios del seed; se niega a correr fuera de dev/test.

### ADR‑005 · Todo usuario nuevo es `vecino`
- **Decisión:** un trigger sobre `auth.users` crea la fila en `usuarios` y le da el rol `vecino`.
  Los roles `dueno`, `mensajero` y `admin` se agregan por flujo o por el admin.
- **Consecuencias:** un dueño o admin también puede pedir mandados con la misma cuenta (SPEC §3).

### ADR‑006 · Tablas de solo inserción sin `updated_at`
- **Contexto:** SPEC §8 pide `created_at`/`updated_at` en todas las tablas.
- **Decisión:** `eventos`, `mandado_eventos` y `movimientos` son registros inmutables (bitácora,
  auditoría, libro contable) y solo llevan `created_at`. El resto tiene ambos y un trigger
  mantiene `updated_at`.

### ADR‑007 · Detalles del modelo de datos
- `dia_semana`: 0 = domingo … 6 = sábado (coincide con `extract(dow)` y `Date.getDay()`).
  Una franja con `cierra < abre` cruza la medianoche (p. ej. 18:00–01:00).
- Estados y tipos como `text` + `CHECK` (más fáciles de evolucionar que `enum`).
- Agregados a la SPEC: `barrios.slug` y `barrios.centroide_verificado` (los centroides del seed
  son aproximados), `lista_espera.acepta_datos_at` (Ley 1581), `mensajeros.suspendido_hasta`
  (suspensión de 48 h, §7.5), `deleted_at` en `usuarios`, `negocios` y `direcciones`.
- `mandados` exige `tarifa = comision_plataforma + neto_mensajero` por `CHECK`.
- Las reglas de §7 se cargan en la tabla `config` (migración `..._datos_referencia.sql`) para
  todos los ambientes; categorías y barrios piloto también, porque producción los necesita.
  Solo los negocios y usuarios `[DEMO]` van en el seed.

### ADR‑008 · Feature flags por variables de entorno en Fase 0–1
- **Decisión:** `MANDADOS_ACTIVOS`, `MODALIDAD_A_ACTIVA` y `PAGOS_PROVEEDOR` se leen del entorno.
  La tabla `config` ya guarda las mismas claves; en Fase 2 el API las leerá de ahí para poder
  cambiarlas desde el admin. La selección stub/real está solo en `app/services/__init__.py`.

### ADR‑009 · Hosting y ambientes *(default SPEC §14.2 y §14.8)*
- **Decisión:** API en Render free, web en Vercel Hobby, BD en Supabase free.
  `main` → staging, rama `produccion` → producción. Cada PR obtiene un preview de Vercel.
  Detalle en [`ambientes.md`](ambientes.md).
- **Consecuencias:** Render free se duerme tras ~15 min sin tráfico (primer request ~30–60 s),
  lo que choca con la meta de p95 < 300 ms (§13). Mitigación barata en Fase 1: un ping
  programado; si no alcanza, pasar a un plan pago o a Fly.io.

### ADR‑010 · Versiones de librerías
- React **18** como pide la SPEC (aunque existe la 19). TypeScript 5.9 (no 7) porque
  `typescript-eslint` aún no soporta TS 7. Tailwind v4 (tokens con `@theme`). Vite 8, Node ≥ 20.19.

### ADR‑011 · Reparto de la tarifa *(default SPEC §14.3)*
- La documentación original dice que "la comisión" es la tarifa completa, pero también que el
  mensajero gana $1.200–$2.500 netos. Se adopta **20 % plataforma / 80 % mensajero**
  (`config.comision_plataforma_pct = 20`).

### ADR‑012 · Barrios que crecen con el mapa
- **Decisión:** los 4 barrios piloto dejan de ser una lista fija en la interfaz. Al registrar su
  negocio, el dueño escribe el barrio (con sugerencias de los que ya existen); si no existe se
  crea, sin importar tildes ni mayúsculas. `GET /barrios` devuelve solo los barrios con negocios
  **activos**, del más poblado al menos, con el centro en el promedio de sus negocios.
- **Consecuencias:** un barrio nuevo aparece en el mapa apenas el admin aprueba su primer
  negocio, no antes (evita barrios basura). `es_piloto` se conserva para el gate y las métricas.
  Los errores de escritura crean barrios duplicados; se corrigen a mano desde la base por ahora.

### ADR‑013 · Catálogo con inventario y apartados *(cambia SPEC §2.2)*
- **Decisión del equipo (Andrés, 2026‑11‑04):** se adelanta al MVP el catálogo por negocio, que
  la SPEC dejaba fuera. Secciones libres, productos y servicios, foto y precio opcionales,
  stock opcional (los servicios no llevan). El carrito crea un **apartado** y abre WhatsApp con el
  pedido escrito; se paga en la tienda (sin pasarela).
- **Estados:** `pendiente → confirmado → listo → entregado`, y `cancelado` desde cualquiera sin
  entregar (el vecino o el negocio). El stock se descuenta al **confirmar**, con bloqueo de filas;
  si se cancela después, vuelve. Apartar solo valida que alcance. Máximo 3 apartados abiertos por
  vecino y negocio.
- **Consecuencias:** apartar exige cuenta (el negocio necesita saber a quién entregar). Nombre y
  precio se copian al apartado, así que editar el catálogo no cambia pedidos viejos. Va en su
  propia rama (`fase-1-catalogo`) y PR. No reemplaza los mandados de la Fase 2: un apartado es
  para recoger en la tienda.
