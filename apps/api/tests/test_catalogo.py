"""Catálogo del negocio y apartados: carrito del vecino → panel del dueño, con stock."""

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
FOTOS = "https://demo.supabase.co/storage/v1/object/public/negocio-fotos"
_ips = (f"203.0.113.{i % 250}" for i in itertools.count())


def _h(clave: str | None = None) -> dict[str, str]:
    """Cabeceras: token del usuario del seed (si hay) e IP distinta para no chocar con el límite."""
    h = {"X-Forwarded-For": next(_ips)}
    if clave:
        h["Authorization"] = f"Bearer {firmar(clave)}"
    return h


@pytest.fixture
def negocio(conn: psycopg.Connection) -> Iterator[UUID]:
    """Negocio activo de dueno1, con el catálogo y los apartados limpios."""
    nid = conn.execute(
        "select id from negocios where dueno_id = %s and estado = 'activo' limit 1",
        (_id("usuario:dueno1"),),
    ).fetchone()[0]

    def limpiar() -> None:
        conn.execute("delete from apartados where negocio_id = %s", (nid,))
        conn.execute("delete from catalogo_items where negocio_id = %s", (nid,))
        conn.execute("delete from catalogo_secciones where negocio_id = %s", (nid,))

    limpiar()
    yield nid
    limpiar()


def _item(client: TestClient, nid: UUID, **datos: object) -> dict[str, object]:
    r = client.post(f"{V1}/mis-negocios/{nid}/catalogo/items", json=datos, headers=_h("dueno1"))
    assert r.status_code == 201, r.text
    return r.json()


def _apartar(
    client: TestClient, nid: UUID, items: list[tuple[object, int]], quien: str | None = "vecino1"
):
    return client.post(
        f"{V1}/negocios/{nid}/apartados",
        json={
            "items": [{"item_id": i, "cantidad": c} for i, c in items],
            "nota": " Paso  a las 5 ",
        },
        headers=_h(quien),
    )


# ── Catálogo ──


def test_dueno_arma_catalogo_y_el_publico_ve_solo_lo_visible(
    client: TestClient, negocio: UUID
) -> None:
    r = client.post(
        f"{V1}/mis-negocios/{negocio}/catalogo/secciones",
        json={"nombre": "  Panes ", "orden": 1},
        headers=_h("dueno1"),
    )
    assert r.status_code == 201 and r.json()["nombre"] == "Panes"
    seccion = r.json()["id"]

    pan = _item(client, negocio, nombre="Pan  de bono", precio=1500, stock=20, seccion_id=seccion)
    corte = _item(client, negocio, nombre="Corte clásico", tipo="servicio", precio=15000, stock=9)
    _item(client, negocio, nombre="Torta secreta", visible=False)

    assert pan["nombre"] == "Pan de bono" and pan["stock"] == 20
    assert corte["stock"] is None  # un servicio no lleva inventario

    publico = client.get(f"{V1}/negocios/{negocio}/catalogo").json()
    assert [s["nombre"] for s in publico["secciones"]] == ["Panes"]
    assert {i["nombre"] for i in publico["items"]} == {"Pan de bono", "Corte clásico"}

    propio = client.get(f"{V1}/mis-negocios/{negocio}/catalogo", headers=_h("dueno1")).json()
    assert len(propio["items"]) == 3

    # Borrar la sección deja el pan sin sección, no lo borra.
    r = client.delete(
        f"{V1}/mis-negocios/{negocio}/catalogo/secciones/{seccion}", headers=_h("dueno1")
    )
    assert r.status_code == 204
    items = client.get(f"{V1}/negocios/{negocio}/catalogo").json()["items"]
    assert next(i for i in items if i["nombre"] == "Pan de bono")["seccion_id"] is None


def test_catalogo_ajeno_foto_externa_y_negocio_inexistente(
    client: TestClient, negocio: UUID
) -> None:
    r = client.post(
        f"{V1}/mis-negocios/{negocio}/catalogo/items",
        json={"nombre": "Pan"},
        headers=_h("dueno2"),
    )
    assert r.status_code == 404 and r.json()["error"]["codigo"] == "negocio_no_encontrado"

    for foto in (
        "https://otro.com/pan.webp",
        f"{FOTOS}/{negocio}/pan.webp",
        f"{FOTOS}/{negocio}/catalogo/../x.webp",
    ):
        r = client.post(
            f"{V1}/mis-negocios/{negocio}/catalogo/items",
            json={"nombre": "Pan", "foto_url": foto},
            headers=_h("dueno1"),
        )
        assert r.status_code == 422 and r.json()["error"]["codigo"] == "foto_invalida", foto

    ok = _item(client, negocio, nombre="Pan", foto_url=f"{FOTOS}/{negocio}/catalogo/abc.webp")
    assert ok["foto_url"].endswith("/catalogo/abc.webp")
    assert client.get(f"{V1}/negocios/no-existe/catalogo").status_code == 404


def test_ajustar_stock_no_baja_de_cero(client: TestClient, negocio: UUID) -> None:
    pan = _item(client, negocio, nombre="Pan", stock=3)
    url = f"{V1}/mis-negocios/{negocio}/catalogo/items/{pan['id']}/stock"
    assert client.post(url, json={"delta": 10}, headers=_h("dueno1")).json()["stock"] == 13
    assert client.post(url, json={"delta": -50}, headers=_h("dueno1")).json()["stock"] == 0


# ── Apartados ──


def test_apartar_suma_total_y_el_dueno_lo_ve_con_el_vecino(
    client: TestClient, negocio: UUID
) -> None:
    pan = _item(client, negocio, nombre="Pan", precio=1500, stock=10)
    torta = _item(client, negocio, nombre="Torta por encargo")  # sin precio

    assert _apartar(client, negocio, [(pan["id"], 1)], quien=None).status_code == 401

    r = _apartar(client, negocio, [(pan["id"], 2), (torta["id"], 1), (pan["id"], 1)])
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["estado"] == "pendiente" and len(a["codigo"]) == 4
    assert a["total"] == 4500 and a["hay_sin_precio"] is True
    assert a["nota"] == "Paso a las 5"
    assert {(i["nombre"], i["cantidad"]) for i in a["items"]} == {
        ("Pan", 3),
        ("Torta por encargo", 1),
    }
    assert a["vecino"] is None  # el vecino no necesita verse a sí mismo

    # Apartar no descuenta: el stock se reserva cuando el negocio confirma.
    items = client.get(f"{V1}/negocios/{negocio}/catalogo").json()["items"]
    assert next(i for i in items if i["nombre"] == "Pan")["stock"] == 10

    del_negocio = client.get(
        f"{V1}/mis-negocios/{negocio}/apartados?estado=abiertos", headers=_h("dueno1")
    ).json()
    assert [x["codigo"] for x in del_negocio] == [a["codigo"]]
    assert del_negocio[0]["vecino"]["nombre"] == "Laura Restrepo"

    mios = client.get(f"{V1}/mis-negocios", headers=_h("dueno1")).json()
    assert next(n for n in mios if n["id"] == str(negocio))["apartados_pendientes"] == 1

    assert [x["codigo"] for x in client.get(f"{V1}/mis-apartados", headers=_h("vecino1")).json()][
        :1
    ] == [a["codigo"]]
    assert a["codigo"] not in {
        x["codigo"] for x in client.get(f"{V1}/mis-apartados", headers=_h("vecino2")).json()
    }


def test_no_se_aparta_lo_agotado_ni_lo_oculto(client: TestClient, negocio: UUID) -> None:
    pan = _item(client, negocio, nombre="Pan", stock=2)
    oculto = _item(client, negocio, nombre="Oculto", visible=False)
    agotado = _item(client, negocio, nombre="Leche", stock=0)

    r = _apartar(client, negocio, [(pan["id"], 3)])
    assert r.status_code == 422 and r.json()["error"]["mensaje"] == "De «Pan» quedan 2."
    r = _apartar(client, negocio, [(agotado["id"], 1)])
    assert r.json()["error"]["mensaje"] == "«Leche» se agotó."
    r = _apartar(client, negocio, [(oculto["id"], 1)])
    assert r.status_code == 422 and r.json()["error"]["codigo"] == "item_no_disponible"


def test_confirmar_descuenta_y_cancelar_devuelve_el_stock(
    client: TestClient, negocio: UUID
) -> None:
    pan = _item(client, negocio, nombre="Pan", precio=1000, stock=5)
    corte = _item(client, negocio, nombre="Corte", tipo="servicio", precio=15000)
    a = _apartar(client, negocio, [(pan["id"], 3), (corte["id"], 1)]).json()
    url = f"{V1}/mis-negocios/{negocio}/apartados/{a['id']}/estado"

    def stock() -> int:
        items = client.get(f"{V1}/mis-negocios/{negocio}/catalogo", headers=_h("dueno1")).json()
        return next(i for i in items["items"] if i["nombre"] == "Pan")["stock"]

    r = client.post(url, json={"estado": "listo"}, headers=_h("dueno1"))
    assert r.status_code == 409 and r.json()["error"]["codigo"] == "transicion_invalida"

    assert (
        client.post(url, json={"estado": "confirmado"}, headers=_h("dueno1")).json()["estado"]
        == "confirmado"
    )
    assert stock() == 2
    assert (
        client.post(url, json={"estado": "listo"}, headers=_h("dueno1")).json()["estado"] == "listo"
    )

    r = client.post(url, json={"estado": "cancelado", "motivo": "No vino"}, headers=_h("dueno1"))
    assert r.json()["estado"] == "cancelado" and r.json()["cancelado_por"] == "negocio"
    assert r.json()["motivo_cancelacion"] == "No vino"
    assert stock() == 5

    # Otro dueño no puede tocar el apartado.
    otro = client.post(url, json={"estado": "confirmado"}, headers=_h("dueno2"))
    assert otro.status_code == 404


def test_confirmar_sin_stock_suficiente_no_cambia_nada(client: TestClient, negocio: UUID) -> None:
    pan = _item(client, negocio, nombre="Pan", stock=4)
    primero = _apartar(client, negocio, [(pan["id"], 3)]).json()
    segundo = _apartar(client, negocio, [(pan["id"], 3)], quien="vecino2").json()
    base = f"{V1}/mis-negocios/{negocio}/apartados"

    assert (
        client.post(
            f"{base}/{primero['id']}/estado", json={"estado": "confirmado"}, headers=_h("dueno1")
        ).status_code
        == 200
    )
    r = client.post(
        f"{base}/{segundo['id']}/estado", json={"estado": "confirmado"}, headers=_h("dueno1")
    )
    assert r.status_code == 409 and r.json()["error"]["codigo"] == "sin_stock"
    assert "quedan 1" in r.json()["error"]["mensaje"]
    estados = {x["id"]: x["estado"] for x in client.get(base, headers=_h("dueno1")).json()}
    assert estados[segundo["id"]] == "pendiente"


def test_vecino_cancela_el_suyo_y_hay_tope_de_abiertos(client: TestClient, negocio: UUID) -> None:
    pan = _item(client, negocio, nombre="Pan", stock=50)
    ids = [_apartar(client, negocio, [(pan["id"], 1)]).json()["id"] for _ in range(3)]
    r = _apartar(client, negocio, [(pan["id"], 1)])
    assert r.status_code == 422 and r.json()["error"]["codigo"] == "demasiados_apartados"

    ajeno = client.post(f"{V1}/mis-apartados/{ids[0]}/cancelar", json={}, headers=_h("vecino2"))
    assert ajeno.status_code == 404
    r = client.post(
        f"{V1}/mis-apartados/{ids[0]}/cancelar", json={"motivo": "Ya no"}, headers=_h("vecino1")
    )
    assert r.json()["estado"] == "cancelado" and r.json()["cancelado_por"] == "vecino"
    # Al cancelar uno, vuelve a poder apartar.
    assert _apartar(client, negocio, [(pan["id"], 1)]).status_code == 201
    r = client.post(f"{V1}/mis-apartados/{ids[0]}/cancelar", json={}, headers=_h("vecino1"))
    assert r.status_code == 409
