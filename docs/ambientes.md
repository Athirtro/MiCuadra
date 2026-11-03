# Ambientes

| Ambiente | Web (Vercel) | API (Render) | Base de datos (Supabase) | Rama |
|---|---|---|---|---|
| **dev** | `localhost:5173` | `localhost:8000` | Postgres local (`micuadra`) | cualquiera |
| **preview** | URL de preview por PR | apunta al API de staging | proyecto staging | PR |
| **staging** | dominio de staging de Vercel | `micuadra-api-staging` | proyecto `micuadra-staging` | `main` |
| **prod** | `micuadra.co` (o `*.vercel.app` mientras tanto) | `micuadra-api` | proyecto `micuadra-prod` | `produccion` |

Para pasar a producción: PR de `main` → `produccion`.

## Configuración inicial (una sola vez)

Necesita las cuentas del equipo; nada de esto se puede automatizar desde el repo.

### 1. Supabase (dos proyectos: staging y prod, región São Paulo)
1. Crear el proyecto. En **Database → Extensions** activar `postgis` y `pg_trgm` (la migración
   también lo intenta).
2. Copiar la cadena de conexión (Session pooler) como `DATABASE_URL`.
3. Desde tu máquina: `DATABASE_URL=... make db-migrate`. En staging también `make db-seed`.
   **Nunca** correr el seed en prod.
4. **Auth → URL Configuration:** Site URL = URL de la web; agregar las URLs de redirección.
5. **Auth → SMTP:** el correo incluido de Supabase tiene un límite muy bajo por hora; para
   *magic links* reales configurar un SMTP propio (p. ej. la capa gratuita de Resend o Brevo).
6. Copiar `SUPABASE_URL`. Si el proyecto usa llaves de firma asimétricas, dejar
   `SUPABASE_JWT_SECRET` vacío (el API usa el JWKS); si usa el secreto legado, copiarlo.

> Supabase free pausa los proyectos tras 7 días sin actividad. Staging puede pausarse; prod
> tendrá tráfico real.

### 2. Render (API)
1. **New → Blueprint** apuntando a este repo: crea los dos servicios de `render.yaml`.
2. Cargar en cada servicio `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET` y
   `CORS_ORIGINS` (dominio de la web de ese ambiente, separados por coma).
3. Verificar: `curl https://<servicio>.onrender.com/api/v1/health` → `{"estado":"ok", …}`.

### 3. Vercel (web)
1. Importar el repo dejando **Root Directory en la raíz** (usa `vercel.json` y `.vercelignore` de la raíz,
   que instalan el workspace de pnpm y construyen `apps/web`).
2. Production Branch = `produccion`. Asignar un dominio de staging a la rama `main`.
3. Variable `VITE_API_URL` = `https://<servicio-render>.onrender.com/api/v1` por ambiente.

### 4. GitHub
- Proteger `main` y `produccion`: PR obligatorio y CI verde (`API`, `Web`, `Tipos…`).
