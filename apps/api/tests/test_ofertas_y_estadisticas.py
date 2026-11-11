"""Ofertas del día, búsqueda por producto y estadísticas del negocio para su dueño."""

import itertools
from collections.abc import Iterator
from uuid import UUID

import psycopg
import pytest
from fastapi.testclient import TestClient

from scripts.firmar_token import firmar
from scripts.seed import _id

pytestmark = pytest.mark.db

V1 = "/api/v1"
_ips = (f"198.51.100.{i % 250}" for i in itertools.count())


def _h(clave: str | None = None) -> dict[str, str]:
    h = {"X-Forwarded-For": next(_ips)}
    if clave:
        h["Authorization"] = f"Bearer {firmar(clave)}"
    return h


@pytest.fixture
def negocio(conn: psycopg.Connection) -> Iterator[tuple[UUID, float, float]]:
    """Negocio activo de dueno1 (id, lat, lng) con catálogo, apartados y eventos limpios."""
    nid, lat, lng = conn.execute(
        "select id, st_y(ubicacion::geometry), st_x(ubicacion::geometry) from negocios"
        " where dueno_id = %s and estado = 'activo' limit 1",
        (_id("usuario:dueno1"),),
    ).fetchone()

    def limpiar() -> None:
        conn.execute("delete from apartados where negocio_id = %s", (nid,))
        conn.execute("delete from catalogo_items where negocio_id = %s", (nid,))
        conn.execute("delete from eventos where negocio_id = %s", (nid,))

    limpiar()
    yield nid, lat, lng
    limpiar()


def _item(client: TestClient, nid: UUID, **datos: object) -> dict[str, object]:
    r = client.post(f"{V1}/mis-negocios/{nid}/catalogo/items", json=datos, headers=_h("dueno1"))
    assert r.status_code == 201, r.text
    return r.json()


def _buscar(client: TestClient, lat: float, lng: float, **params: object) -> list[dict]:
    r = client.get(f"{V1}/negocios", params={"lat": lat, "lng": lng, "radio_m": 1000, **params})
    assert r.status_code == 200, r.text
    return r.json()["items"]


def test_oferta_se_aparta_al_precio_rebajado_y_filtra_el_mapa(
    client: TestClient, negocio: tuple[UUID, float, float]
) -> None:
    nid, lat, lng = negocio
    for malo in ({"precio": 2000, "precio_oferta": 2000}, {"precio_oferta": 500}):
        r = client.post(
            f"{V1}/mis-negocios/{nid}/catalogo/items",
            json={"nombre": "Pan", **malo},
            headers=_h("dueno1"),
        )
        assert r.status_code == 422, malo

    pan = _item(client, nid, nombre="Pan rebajado", precio=2000, precio_oferta=1500)
    _item(client, nid, nombre="Pan normal", precio=1000)
    assert pan["precio_oferta"] == 1500

    r = client.post(
        f"{V1}/negocios/{nid}/apartados",
        json={"items": [{"item_id": pan["id"], "cantidad": 2}]},
        headers=_h("vecino1"),
    )
    assert r.status_code == 201, r.text
    assert r.json()["total"] == 3000

    con_ofertas = _buscar(client, lat, lng, con_ofertas=True)
    assert str(nid) in {n["id"] for n in con_ofertas}
    assert all(n["ofertas"] > 0 for n in con_ofertas)
    assert next(n for n in con_ofertas if n["id"] == str(nid))["ofertas"] == 1


def test_buscar_por_producto_muestra_lo_que_coincide(
    client: TestClient, negocio: tuple[UUID, float, float]
) -> None:
    nid, lat, lng = negocio
    _item(client, nid, nombre="Cuajada xilofónica", precio=9000)
    _item(client, nid, nombre="Cuajada xilofónica grande", precio=12000, precio_oferta=10000)
    _item(client, nid, nombre="Xilofónica escondida", precio=1, visible=False)

    encontrados = _buscar(client, lat, lng, q="xilofonica")  # sin tilde
    assert [n["id"] for n in encontrados] == [str(nid)]
    productos = encontrados[0]["productos"]
    # La oferta va primero; lo oculto no aparece.
    assert [p["nombre"] for p in productos] == ["Cuajada xilofónica grande", "Cuajada xilofónica"]
    assert productos[0]["precio_oferta"] == 10000

    assert _buscar(client, lat, lng, q="xilofonica grande")[0]["productos"][0]["precio"] == 12000
    assert all(n["productos"] == [] for n in _buscar(client, lat, lng))


def test_estadisticas_cuentan_vistas_contactos_y_apartados(
    client: TestClient, conn: psycopg.Connection, negocio: tuple[UUID, float, float]
) -> None:
    nid, _, _ = negocio
    for tipo, anon in [
        ("vista_perfil", "a"),
        ("vista_perfil", "a"),
        ("vista_perfil", "b"),
        ("click_whatsapp", "a"),
        ("click_como_llegar", "b"),
    ]:
        conn.execute(
            "insert into eventos (tipo, negocio_id, anon_id) values (%s, %s, %s)", (tipo, nid, anon)
        )
    # Un evento viejo cuenta en el periodo anterior, no en el actual.
    conn.execute(
        "insert into eventos (tipo, negocio_id, anon_id, created_at)"
        " values ('vista_perfil', %s, 'c', now() - interval '10 days')",
        (nid,),
    )
    pan = _item(client, nid, nombre="Pan", precio=1000)
    r = client.post(
        f"{V1}/negocios/{nid}/apartados",
        json={"items": [{"item_id": pan["id"], "cantidad": 3}]},
        headers=_h("vecino1"),
    )
    assert r.status_code == 201, r.text

    url = f"{V1}/mis-negocios/{nid}/estadisticas?dias=7"
    r = client.get(url, headers=_h("dueno1"))
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["totales"] == {
        "vistas": 3,
        "vecinos": 2,
        "whatsapp": 1,
        "como_llegar": 1,
        "apartados": 1,
        "vendido": 0,
    }
    assert e["anteriores"]["vistas"] == 1
    assert len(e["por_dia"]) == 7
    hoy = e["por_dia"][-1]
    assert (hoy["vistas"], hoy["contactos"], hoy["apartados"]) == (3, 2, 1)
    assert e["mas_apartados"] == [{"nombre": "Pan", "unidades": 3}]

    assert client.get(url, headers=_h("dueno2")).status_code == 404
    assert client.get(url, headers=_h("admin")).status_code == 200
    assert (
        client.get(f"{V1}/mis-negocios/{nid}/estadisticas?dias=0", headers=_h("dueno1")).status_code
        == 422
    )
