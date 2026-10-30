# CLAUDE.md — MiCuadra

**MiCuadra — "El mapa vivo de tu cuadra".** PWA mobile‑first para Pereira (barrios piloto Cuba,
Álamos, Boston, El Jardín) con dos capas **desacopladas**: un directorio hiperlocal gratuito de
micronegocios (núcleo) y una red de mandados entre vecinos (capa enchufable, Fase 2+).
La especificación completa está en [`SPEC.md`](SPEC.md); las decisiones en
[`docs/decisiones.md`](docs/decisiones.md).

## Fase actual

**Fase 0 — Setup** (rama `fase-0-setup`). Trabajar una fase a la vez (SPEC §12); al cerrar
cada fase: lint + tests, verificar criterios de aceptación, commit, PR y **detenerse**.
No adelantar funcionalidades de fases futuras salvo los stubs que pide la SPEC.

## Stack

| Capa | Herramienta |
|---|---|
| Web | React 18 + Vite + TypeScript estricto, Tailwind v4, React Router 6, TanStack Query 5, `vite-plugin-pwa` |
| API | FastAPI (Python 3.12, `uv`), SQLAlchemy 2 (SQL con `text()` por ahora), Pydantic v2, PyJWT |
| BD | Postgres + PostGIS (Supabase en la nube; Postgres de Homebrew en local) |
| Auth | Supabase Auth; el API valida el JWT (HS256 con secreto o JWKS) y lee roles de `usuario_roles` |
| Deploy | Web en Vercel (`apps/web/vercel.json`), API en Render (`render.yaml`) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |

## Comandos

```bash
make install        # uv sync + pnpm install
make db-reset       # SOLO local: recrea la base, migra y carga el seed [DEMO]
make dev            # API :8000 + web :5173 (proxy /api → :8000)
make check          # lint + typecheck + test (lo mismo que CI)
make db-migrate     # aplica migraciones pendientes (local o Supabase según DATABASE_URL)
make db-seed        # datos [DEMO] idempotentes      make seed-clean  # los borra
make gen-types      # regenera packages/shared/src/api.ts desde el OpenAPI (commitearlo)
make token U=admin  # JWT de desarrollo para un usuario del seed (admin, dueno1, vecino1, mensajero1…)
```

Pruebas del API: `cd apps/api && uv run pytest`. Usan la base `micuadra_test` (se recrea en
cada corrida; `TEST_DATABASE_URL` la cambia). Sin Postgres, las pruebas `db` se saltan; en CI
(`REQUIRE_DB=1`) fallan.

## Estructura

```
apps/api/        FastAPI
  app/main.py        create_app(), prefijo /api/v1
  app/config.py      Settings (env) + feature flags
  app/auth.py        JWT de Supabase, get_usuario_actual, requiere_rol(...)
  app/errors.py      ApiError y formato { "error": { "codigo", "mensaje" } }
  app/services/      Interfaces + implementaciones; __init__.py elige según flags
  app/routers/       sistema (health, yo), directorio, mandados (501 mientras flag off)
  scripts/db.py      migrar | seed | seed-clean | reset
  scripts/seed.py    datos [DEMO] deterministas
  tests/
apps/web/        React + Vite (PWA)
  src/styles.css     tokens de marca (claro/oscuro) → utilidades Tailwind (bg-bg, text-ink, bg-green…)
  src/lib/api.ts     cliente fetch + tipos del OpenAPI
packages/shared/ tipos generados (src/api.ts) + constantes de dominio (src/index.ts)
supabase/migrations/  SQL versionado = fuente de verdad del esquema
supabase/local/       shim para correr las migraciones en Postgres sin Supabase
docs/            documentación original, decisiones.md, ambientes.md
landing/         landing original (se porta a /conoce en Fase 1)
```

## Convenciones

- **Idioma:** UI en español de Colombia, tuteando. Dominio en español (`negocio`, `mandado`,
  `mensajero`, `get_disponibilidad`); lo técnico en inglés (`service`, `router`, `hook`).
- **Dinero:** siempre `int` de pesos COP, nunca `float`. Formato `$2.000` (`formatoCOP`).
  Tarifas, comisiones y netos se calculan **solo en el servidor** desde la tabla `config`.
- **Desacople:** el directorio solo importa la interfaz `MandadoService`; el cambio stub → real
  se hace únicamente en `app/services/__init__.py`. Hay una prueba que lo vigila.
- **Esquema:** cambios = nueva migración `supabase/migrations/AAAAMMDDHHMMSS_nombre.sql`; nunca
  editar una ya aplicada. Estados como `text` + `CHECK`. RLS activo en todas las tablas.
- **Errores del API:** lanzar `ApiError(status, "codigo_snake", "Mensaje para el usuario.")`.
- **Contratos:** si cambia un endpoint, correr `make gen-types` y commitear `openapi.json` y
  `api.ts` (CI lo verifica).
- **Secretos:** solo en `.env` (ignorado) y en Vercel/Render/Supabase. `.env.example` documentado.
- **Commits** pequeños en español; una rama y un PR por fase (`fase-N-nombre`).
- `dia_semana`: 0 = domingo … 6 = sábado. Zona horaria del negocio: `America/Bogota`.
