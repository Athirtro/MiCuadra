"""Herramientas de base de datos.

    uv run python scripts/db.py migrar      # aplica /supabase/migrations pendientes
    uv run python scripts/db.py seed        # datos [DEMO] (idempotente)
    uv run python scripts/db.py seed-clean  # borra todo lo [DEMO]
    uv run python scripts/db.py reset       # SOLO local: borra y recrea la base

Funciona igual contra Postgres local y contra Supabase (DATABASE_URL).
"""

import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from scripts import seed as seed_demo

RAIZ = Path(__file__).resolve().parents[3]
MIGRACIONES = RAIZ / "supabase" / "migrations"
SHIM_LOCAL = RAIZ / "supabase" / "local" / "00_shim_supabase.sql"


def url_psycopg() -> str:
    return get_settings().database_url.replace("postgresql+psycopg://", "postgresql://", 1)


def migrar(conn: psycopg.Connection) -> None:
    hay_auth = conn.execute(
        "select exists(select 1 from pg_namespace where nspname = 'auth')"
    ).fetchone()
    if not (hay_auth and hay_auth[0]):
        print("→ Postgres sin Supabase: aplicando shim local")
        conn.execute(SHIM_LOCAL.read_text())

    conn.execute("create schema if not exists ops")
    conn.execute(
        "create table if not exists ops.migraciones ("
        " nombre text primary key, aplicada_at timestamptz not null default now())"
    )
    aplicadas = {r[0] for r in conn.execute("select nombre from ops.migraciones")}
    pendientes = [p for p in sorted(MIGRACIONES.glob("*.sql")) if p.name not in aplicadas]
    if not pendientes:
        print("✓ Sin migraciones pendientes")
    for archivo in pendientes:
        print(f"→ {archivo.name}")
        with conn.transaction():
            conn.execute(archivo.read_text())
            conn.execute("insert into ops.migraciones (nombre) values (%s)", (archivo.name,))
    conn.commit()


def reset() -> None:
    settings = get_settings()
    if settings.entorno not in ("dev", "test"):
        sys.exit(f"reset solo se permite en dev/test (ENTORNO={settings.entorno})")
    url = url_psycopg()
    base, nombre = url.rsplit("/", 1)
    nombre = nombre.split("?")[0]
    with psycopg.connect(f"{base}/postgres", autocommit=True) as admin:
        admin.execute(f'drop database if exists "{nombre}" with (force)')
        admin.execute(f'create database "{nombre}"')
    print(f"✓ Base {nombre} recreada")


def main() -> None:
    comando = sys.argv[1] if len(sys.argv) > 1 else "migrar"
    if comando == "reset":
        reset()
        comando = "migrar"
    with psycopg.connect(url_psycopg()) as conn:
        if comando == "migrar":
            migrar(conn)
        elif comando == "seed":
            seed_demo.sembrar(conn)
        elif comando == "seed-clean":
            seed_demo.limpiar(conn)
        else:
            sys.exit(f"Comando desconocido: {comando}")


if __name__ == "__main__":
    main()
