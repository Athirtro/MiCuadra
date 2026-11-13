"""Pruebas del API con Postgres + PostGIS real y datos del seed."""

from uuid import uuid4

import psycopg
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from app.auth import UsuarioActual, requiere_rol
from app.config import Settings, get_settings
from app.main import create_app
from scripts.firmar_token import firmar

pytestmark = pytest.mark.db

V1 = "/api/v1"


def _negocio(conn: psycopg.Connection, estado: str) -> str:
    fila = conn.execute(
        "select id from negocios where estado = %s order by nombre limit 1", (estado,)
    ).fetchone()
    assert fila
    return str(fila[0])


def _auth(usuario: str, **kw: float) -> dict[str, str]:
    return {"Authorization": f"Bearer {firmar(usuario, **kw)}"}


# ── Sistema ──


def test_health_con_postgis(client: TestClient) -> None:
    r = client.get(f"{V1}/health")
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["estado"] == "ok" and cuerpo["db"] == "ok"
    assert cuerpo["postgis"]


# ── Hook de mandados en el directorio ──


def test_mandados_disponibles_usa_el_stub(client: TestClient, conn: psycopg.Connection) -> None:
    r = client.get(f"{V1}/negocios/{_negocio(conn, 'activo')}/mandados-disponibles")
    assert r.status_code == 200
    assert r.json() == {
        "disponible": False,
        "razon": "proximamente",
        "mensajeros_activos": None,
        "tarifa_desde": None,
    }


@pytest.mark.parametrize("caso", ["pendiente", "inexistente"])
def test_mandados_disponibles_404(client: TestClient, conn: psycopg.Connection, caso: str) -> None:
    negocio_id = _negocio(conn, "pendiente") if caso == "pendiente" else str(uuid4())
    r = client.get(f"{V1}/negocios/{negocio_id}/mandados-disponibles")
    assert r.status_code == 404
    assert r.json()["error"]["codigo"] == "negocio_no_encontrado"


def test_error_de_validacion_en_espanol(client: TestClient) -> None:
    r = client.get(f"{V1}/negocios/no-es-uuid/mandados-disponibles")
    assert r.status_code == 422
    assert r.json()["error"]["codigo"] == "datos_invalidos"


# ── Mandados apagados por flag ──


@pytest.mark.parametrize(
    ("metodo", "ruta"),
    [
        ("post", "/mandados/cotizar"),
        ("post", "/mandados"),
        ("get", "/mandados"),
        ("get", "/mandados/disponibles"),
        ("get", f"/mandados/{uuid4()}"),
    ],
)
def test_mandados_responden_501_proximamente(client: TestClient, metodo: str, ruta: str) -> None:
    r = client.request(metodo, f"{V1}{ruta}")
    assert r.status_code == 501
    assert r.json()["error"]["codigo"] == "proximamente"


def test_mandados_con_flag_activo_aun_no_implementados(base_de_datos: None) -> None:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(mandados_activos=True)
    r = TestClient(app).post(f"{V1}/mandados")
    assert r.status_code == 501
    assert r.json()["error"]["codigo"] == "no_implementado"


# ── Auth con JWT de Supabase ──


def test_yo_sin_token(client: TestClient) -> None:
    r = client.get(f"{V1}/yo")
    assert r.status_code == 401
    assert r.json()["error"]["codigo"] == "no_autenticado"


@pytest.mark.parametrize(
    ("headers", "codigo"),
    [
        ({"Authorization": "Bearer basura"}, "token_invalido"),
        (
            {
                "Authorization": f"Bearer {firmar('admin', secreto='otro-secreto-de-32-caracteres-xxxx')}"
            },
            "token_invalido",
        ),
        (_auth("admin", horas=-1), "sesion_expirada"),
    ],
)
def test_yo_token_rechazado(client: TestClient, headers: dict[str, str], codigo: str) -> None:
    r = client.get(f"{V1}/yo", headers=headers)
    assert r.status_code == 401
    assert r.json()["error"]["codigo"] == codigo


@pytest.mark.parametrize(
    ("usuario", "roles"),
    [
        ("admin", ["admin", "vecino"]),
        ("dueno1", ["dueno", "vecino"]),
        ("mensajero1", ["mensajero", "vecino"]),
    ],
)
def test_yo_devuelve_roles(client: TestClient, usuario: str, roles: list[str]) -> None:
    r = client.get(f"{V1}/yo", headers=_auth(usuario))
    assert r.status_code == 200
    assert r.json()["email"] == f"{usuario}@demo.micuadra.co"
    assert r.json()["roles"] == roles


def test_requiere_rol(base_de_datos: None) -> None:
    app = create_app()

    @app.get("/solo-admin")
    def _solo_admin(u: UsuarioActual = Depends(requiere_rol("admin"))) -> dict[str, str]:  # noqa: B008
        return {"ok": str(u.id)}

    c = TestClient(app)
    assert c.get("/solo-admin", headers=_auth("admin")).status_code == 200
    r = c.get("/solo-admin", headers=_auth("vecino1"))
    assert r.status_code == 403
    assert r.json()["error"]["codigo"] == "sin_permiso"


# ── Esquema y seed ──


def test_seed_cumple_lo_pedido(conn: psycopg.Connection) -> None:
    q = conn.execute
    assert q("select count(*) from barrios where es_piloto").fetchone() == (4,)
    assert q("select count(*) from categorias").fetchone() == (11,)  # 10 de la SPEC + ferretería
    total, activos, cats = q(
        "select count(*), count(*) filter (where estado = 'activo'), count(distinct categoria_id)"
        " from negocios where nombre like '[DEMO]%'"
    ).fetchone()  # type: ignore[misc]
    assert total == 45 and activos >= 40 and cats >= 5
    assert q("select count(distinct barrio_id) from negocios").fetchone() == (4,)
    assert q("select count(*) from mensajeros where nivel = 'AB'").fetchone() == (2,)
    assert q("select count(*) from mensajeros").fetchone() == (5,)


def test_rls_activo_en_todas_las_tablas(conn: psycopg.Connection) -> None:
    sin_rls = conn.execute(
        "select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace"
        " where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity"
    ).fetchall()
    assert sin_rls == []


def test_seed_es_idempotente_y_se_limpia(conn: psycopg.Connection) -> None:
    from scripts import seed

    seed.sembrar(conn)
    assert conn.execute("select count(*) from negocios").fetchone() == (45,)
    seed.limpiar(conn)
    assert conn.execute("select count(*) from negocios").fetchone() == (0,)
    assert conn.execute("select count(*) from usuarios").fetchone() == (0,)
    seed.sembrar(conn)  # deja la base como estaba para el resto de pruebas
