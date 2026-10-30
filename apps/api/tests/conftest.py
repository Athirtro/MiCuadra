"""Pruebas contra Postgres + PostGIS real (base `micuadra_test`, se recrea en cada corrida).

Sin base disponible, las pruebas marcadas `db` se saltan, salvo con REQUIRE_DB=1 (CI)."""

import os
from collections.abc import Iterator

import pytest

os.environ["ENTORNO"] = "test"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://localhost:5432/micuadra_test"
)
os.environ["SUPABASE_JWT_SECRET"] = "secreto-de-pruebas-con-al-menos-32-caracteres"
os.environ["MANDADOS_ACTIVOS"] = "false"

import psycopg
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app
from scripts import db as db_script
from scripts import seed

get_settings.cache_clear()


@pytest.fixture(scope="session")
def base_de_datos() -> Iterator[None]:
    try:
        db_script.reset()
    except psycopg.OperationalError as e:
        if os.environ.get("REQUIRE_DB") == "1":
            raise
        pytest.skip(f"Postgres no disponible: {e}")
    with psycopg.connect(db_script.url_psycopg()) as conn:
        db_script.migrar(conn)
        seed.sembrar(conn)
    yield


@pytest.fixture
def conn(base_de_datos: None) -> Iterator[psycopg.Connection]:
    # autocommit: la prueba no deja transacciones abiertas mientras el API consulta.
    with psycopg.connect(db_script.url_psycopg(), autocommit=True) as c:
        yield c


@pytest.fixture
def client(base_de_datos: None) -> Iterator[TestClient]:
    app = create_app()
    with TestClient(app) as c:
        yield c
