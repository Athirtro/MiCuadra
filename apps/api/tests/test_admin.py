"""Lista de espera, reportes, panel de administración y tablero del gate."""

import itertools
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.horarios import ahora_utc
from scripts.firmar_token import firmar

pytestmark = pytest.mark.db

V1 = "/api/v1"
# Miércoles 4 de noviembre de 2026, 10 a. m. en Bogotá
AHORA = datetime(2026, 11, 4, 15, 0, tzinfo=UTC)
_ips = (f"198.51.100.{i % 250}" for i in itertools.count())


def _ip() -> dict[str, str]:
    """Cada solicitud desde una IP distinta para no chocar con el límite por IP."""
    return {"X-Forwarded-For": next(_ips)}


def _auth(clave: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {firmar(clave)}"}


ADMIN = _auth("admin")


@pytest.fixture
def api(base_de_datos: None, conn: psycopg.Connection) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[ahora_utc] = lambda: AHORA
    conn.execute("delete from lista_espera")
    conn.execute("delete from incidencias")
    conn.execute("delete from entrevistas")
    conn.execute("delete from eventos")
    with TestClient(app) as c:
        yield c
    conn.execute("delete from negocios where nombre like 'Real %'")


def _inscripcion(**cambios: object) -> dict[str, object]:
    return {
        "rol": "vecino",
        "nombre": "Laura  Restrepo",
        "whatsapp": "3104445566",
        "barrio": "cuba",
        "acepta_datos": True,
        **cambios,
    }


# ── Lista de espera ──


def test_lista_espera_guarda_y_evita_duplicados(api: TestClient, conn: psycopg.Connection) -> None:
    r = api.post(f"{V1}/lista-espera", json=_inscripcion(), headers=_ip())
    assert r.status_code == 201 and r.json() == {"nuevo": True}

    otra_vez = _inscripcion(nombre="Laura R.", que_pediria="El pan de la mañana")
    r = api.post(f"{V1}/lista-espera", json=otra_vez, headers=_ip())
    assert r.status_code == 201 and r.json() == {"nuevo": False}

    # El mismo WhatsApp con otro rol sí es otra inscripción
    r = api.post(f"{V1}/lista-espera", json=_inscripcion(rol="mensajero"), headers=_ip())
    assert r.json() == {"nuevo": True}

    filas = conn.execute(
        "select rol, nombre, barrio_texto, que_pediria from lista_espera order by rol"
    ).fetchall()
    assert filas == [
        ("mensajero", "Laura Restrepo", "Cuba", None),
        ("vecino", "Laura R.", "Cuba", "El pan de la mañana"),
    ]


def test_lista_espera_con_otro_barrio_y_negocio(api: TestClient, conn: psycopg.Connection) -> None:
    datos = _inscripcion(
        rol="negocio",
        barrio="Villa Santana",
        negocio_nombre="Fruver Don Arcesio",
        negocio_tipo="Fruver",
    )
    assert api.post(f"{V1}/lista-espera", json=datos, headers=_ip()).status_code == 201
    fila = conn.execute(
        "select barrio_texto, barrio_id, negocio_nombre from lista_espera"
    ).fetchone()
    assert fila == ("Villa Santana", None, "Fruver Don Arcesio")


@pytest.mark.parametrize(
    "cambios",
    [
        {"whatsapp": "6063334455"},
        {"acepta_datos": False},
        {"rol": "admin"},
        {"rol": "negocio"},  # sin nombre ni tipo del negocio
    ],
)
def test_lista_espera_invalida(api: TestClient, cambios: dict[str, object]) -> None:
    r = api.post(f"{V1}/lista-espera", json=_inscripcion(**cambios), headers=_ip())
    assert r.status_code == 422


def test_metas_de_la_landing(api: TestClient, conn: psycopg.Connection) -> None:
    for i in range(3):
        api.post(
            f"{V1}/lista-espera",
            json=_inscripcion(rol="mensajero", whatsapp=f"310000000{i}"),
            headers=_ip(),
        )
    conn.execute(
        "insert into eventos (tipo, anon_id, created_at) values"
        " ('sesion', 'a1', %(r)s), ('sesion', 'a1', %(r)s), ('sesion', 'a2', %(r)s),"
        " ('sesion', 'viejo', %(v)s)",
        {"r": AHORA - timedelta(days=1), "v": AHORA - timedelta(days=9)},
    )
    m = api.get(f"{V1}/lista-espera/metas").json()
    assert m["mensajeros_listos"] == {"valor": 3, "meta": 15}
    assert m["vecinos_semana"] == {"valor": 2, "meta": 200}
    # Los negocios [DEMO] del seed no cuentan
    assert m["negocios_activos"] == {"valor": 0, "meta": 40}


# ── Reportes ──


def _negocio_activo(conn: psycopg.Connection) -> tuple[str, str]:
    fila = conn.execute(
        "select id::text, slug from negocios where estado = 'activo' order by slug limit 1"
    ).fetchone()
    assert fila
    return fila[0], fila[1]


def test_reportar_informacion_incorrecta(api: TestClient, conn: psycopg.Connection) -> None:
    nid, slug = _negocio_activo(conn)
    r = api.post(
        f"{V1}/negocios/{nid}/reportes",
        json={"motivo": "horario", "detalle": "  Abre a las 7, no a las 8 "},
        headers=_ip(),
    )
    assert r.status_code == 204

    cola = api.get(f"{V1}/admin/reportes?estado=abierta", headers=ADMIN).json()
    assert [(c["negocio_slug"], c["motivo"], c["detalle"]) for c in cola] == [
        (slug, "horario", "Abre a las 7, no a las 8")
    ]
    negocio = next(
        n for n in api.get(f"{V1}/admin/negocios", headers=ADMIN).json() if n["slug"] == slug
    )
    assert negocio["reportes_abiertos"] == 1

    r = api.patch(
        f"{V1}/admin/reportes/{cola[0]['id']}", json={"estado": "resuelta"}, headers=ADMIN
    )
    assert r.status_code == 204
    assert api.get(f"{V1}/admin/reportes?estado=abierta", headers=ADMIN).json() == []


def test_reportar_negocio_inexistente_o_motivo_invalido(
    api: TestClient, conn: psycopg.Connection
) -> None:
    falso = "00000000-0000-0000-0000-000000000000"
    r = api.post(f"{V1}/negocios/{falso}/reportes", json={"motivo": "cerro"}, headers=_ip())
    assert r.status_code == 404
    nid, _ = _negocio_activo(conn)
    r = api.post(f"{V1}/negocios/{nid}/reportes", json={"motivo": "feo"}, headers=_ip())
    assert r.status_code == 422


# ── Panel de administración ──


@pytest.mark.parametrize(
    ("metodo", "ruta"),
    [
        ("get", "/admin/negocios"),
        ("get", "/admin/lista-espera"),
        ("get", "/admin/lista-espera.csv"),
        ("get", "/admin/reportes"),
        ("get", "/admin/entrevistas"),
        ("get", "/admin/metricas"),
    ],
)
def test_admin_solo_para_admins(api: TestClient, metodo: str, ruta: str) -> None:
    assert getattr(api, metodo)(f"{V1}{ruta}").status_code == 401
    assert getattr(api, metodo)(f"{V1}{ruta}", headers=_auth("dueno1")).status_code == 403
    assert getattr(api, metodo)(f"{V1}{ruta}", headers=ADMIN).status_code == 200


def _pendiente(conn: psycopg.Connection) -> str:
    """Negocio pendiente registrado por dueno1 junto al centro de Cuba."""
    return str(
        conn.execute(
            "insert into negocios (slug, nombre, categoria_id, whatsapp, direccion_texto,"
            " barrio_id, ubicacion, estado, dueno_id)"
            " select 'real-arepas', 'Real Arepas', c.id, '3104567890', 'Calle 72', b.id,"
            " b.centroide, 'pendiente', u.id"
            " from categorias c, barrios b, usuarios u"
            " where c.slug = 'comida-casera' and b.slug = 'cuba'"
            " and u.email like 'dueno1@%%' returning id"
        ).fetchone()[0]  # type: ignore[index]
    )


def test_aprobar_negocio_lo_muestra_en_el_mapa(api: TestClient, conn: psycopg.Connection) -> None:
    nid = _pendiente(conn)
    cola = api.get(f"{V1}/admin/negocios?estado=pendiente", headers=ADMIN).json()
    assert all(n["estado"] == "pendiente" for n in cola)
    nuevo = next(n for n in cola if n["slug"] == "real-arepas")
    assert nuevo["dueno"]["nombre"] == "Rosa Gómez"
    assert api.get(f"{V1}/negocios/real-arepas").status_code == 404

    r = api.post(f"{V1}/admin/negocios/{nid}/estado", json={"estado": "activo"}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["estado"] == "activo"
    assert api.get(f"{V1}/negocios/real-arepas").status_code == 200

    centro = conn.execute(
        "select st_y(centroide::geometry), st_x(centroide::geometry) from barrios where slug = 'cuba'"
    ).fetchone()
    assert centro
    mapa = api.get(f"{V1}/negocios", params={"lat": centro[0], "lng": centro[1], "radio_m": 300})
    assert "real-arepas" in [n["slug"] for n in mapa.json()["items"]]


def test_rechazar_exige_motivo(api: TestClient, conn: psycopg.Connection) -> None:
    nid = _pendiente(conn)
    ruta = f"{V1}/admin/negocios/{nid}/estado"
    assert api.post(ruta, json={"estado": "rechazado"}, headers=ADMIN).status_code == 422
    r = api.post(
        ruta, json={"estado": "rechazado", "motivo": "Falta la dirección exacta"}, headers=ADMIN
    )
    assert r.json()["motivo_rechazo"] == "Falta la dirección exacta"
    # El dueño ve el motivo en "mis negocios"
    mios = api.get(f"{V1}/mis-negocios", headers=_auth("dueno1")).json()
    assert next(m for m in mios if m["id"] == nid)["motivo_rechazo"] == "Falta la dirección exacta"


def test_filtros_de_negocios(api: TestClient) -> None:
    uno = api.get(f"{V1}/admin/negocios", headers=ADMIN).json()[0]
    barrio, categoria = uno["barrio"]["slug"], uno["categoria"]["slug"]
    ruta = f"{V1}/admin/negocios?barrio={barrio}&categoria={categoria}"
    filtrados = api.get(ruta, headers=ADMIN).json()
    assert uno["id"] in [n["id"] for n in filtrados]
    assert all(
        n["barrio"]["slug"] == barrio and n["categoria"]["slug"] == categoria for n in filtrados
    )
    q = uno["nombre"].replace("[DEMO] ", "").upper()
    assert uno["id"] in [
        n["id"] for n in api.get(f"{V1}/admin/negocios?q={q}", headers=ADMIN).json()
    ]
    assert api.get(f"{V1}/admin/negocios?q=zzzz", headers=ADMIN).json() == []


def test_lista_espera_admin_y_csv(api: TestClient) -> None:
    api.post(f"{V1}/lista-espera", json=_inscripcion(), headers=_ip())
    api.post(
        f"{V1}/lista-espera",
        json=_inscripcion(rol="mensajero", nombre="Andrés Mejía", whatsapp="3200000000"),
        headers=_ip(),
    )
    mensajeros = api.get(f"{V1}/admin/lista-espera?rol=mensajero", headers=ADMIN).json()
    assert [m["nombre"] for m in mensajeros] == ["Andrés Mejía"]

    r = api.patch(
        f"{V1}/admin/lista-espera/{mensajeros[0]['id']}", json={"contactado": True}, headers=ADMIN
    )
    assert r.status_code == 204
    pendientes = api.get(f"{V1}/admin/lista-espera?contactado=false", headers=ADMIN).json()
    assert [p["rol"] for p in pendientes] == ["vecino"]

    csv = api.get(f"{V1}/admin/lista-espera.csv", headers=ADMIN)
    assert csv.headers["content-type"].startswith("text/csv")
    lineas = csv.text.lstrip("﻿").splitlines()
    assert lineas[0].startswith("id,rol,nombre,whatsapp")
    assert any("Andrés Mejía,3200000000,Cuba" in linea and ",sí," in linea for linea in lineas)


# ── Tablero del gate ──


def _sesiones(conn: psycopg.Connection, cuando: datetime, cuantas: int, prefijo: str) -> None:
    conn.execute(
        "insert into eventos (tipo, anon_id, created_at)"
        " select 'sesion', %s || g, %s from generate_series(1, %s) g",
        (prefijo, cuando, cuantas),
    )


def test_gate_con_datos(api: TestClient, conn: psycopg.Connection) -> None:
    semana = timedelta(weeks=1)
    # 3 semanas completas con ≥ 200 visitantes; 60 de la primera vuelven la semana siguiente
    _sesiones(conn, AHORA - 3 * semana, 220, "s3-")
    _sesiones(conn, AHORA - 2 * semana, 210, "s2-")
    _sesiones(conn, AHORA - 2 * semana, 60, "s3-")
    _sesiones(conn, AHORA - semana, 205, "s1-")
    conn.execute(
        "insert into eventos (tipo, anon_id, created_at)"
        " select 'click_pedir_mandado', 'c' || g, %s from generate_series(1, 25) g",
        (AHORA - timedelta(days=3),),
    )
    for i in range(4):
        api.post(
            f"{V1}/admin/entrevistas",
            json={"persona": f"Doña {i}", "confirma_intencion": i < 3, "notas": "Pediría pan"},
            headers=ADMIN,
        )

    gate = api.get(f"{V1}/admin/metricas", headers=ADMIN).json()
    c = {x["id"]: x for x in gate["criterios"]}
    assert len(c) == 6 and gate["listo"] is False

    assert c[1]["estado"] == "verde" and c[1]["valor"] == "205 la semana pasada"
    assert [p["valor"] for p in c[1]["serie"]][-4:] == [220, 270, 205, 0]
    assert c[1]["serie"][-1]["etiqueta"] == "Esta semana"

    # Cohorte de hace 2 semanas (210 nuevos + 60 que ya venían): nadie volvió
    # La de hace 3: 60 de 220 volvieron → 27 %
    assert [p["valor"] for p in c[2]["serie"]] == [27, 0]
    assert c[2]["estado"] == "rojo" and c[2]["valor"] == "0 % (0 de 210)"

    assert c[3]["valor"] == "25 clics" and c[3]["estado"] == "amarillo"
    assert c[4]["valor"] == "3 confirman" and c[4]["estado"] == "rojo"
    assert c[5]["estado"] == "rojo"
    assert c[6]["valor"] == "0 negocios · 0 categorías"
    assert "[DEMO]" in c[6]["detalle"]
    assert gate["cumplidos"] == 1

    entrevistas = api.get(f"{V1}/admin/entrevistas", headers=ADMIN).json()
    assert len(entrevistas) == 4 and entrevistas[0]["notas"] == "Pediría pan"


def test_gate_vacio(api: TestClient) -> None:
    gate = api.get(f"{V1}/admin/metricas", headers=ADMIN).json()
    assert gate["cumplidos"] == 0
    assert all(c["estado"] == "rojo" for c in gate["criterios"])
    assert gate["criterios"][1]["valor"] == "Sin datos todavía"


# ── Carga de negocios por el equipo ──

CUBA = "4.7966, -75.7301"


def test_admin_crea_negocio_sin_dueno_y_sin_whatsapp(api: TestClient) -> None:
    datos = {
        "nombre": "Real Ferretería La Sierra",
        "categoria": "ferreteria",
        "direccion_texto": "Cr 26 # 70-16",
        "barrio": "Cuba",
        "ubicacion": {"lat": 4.7966, "lng": -75.7301},
        "horarios": [{"dia_semana": 1, "abre": "07:00", "cierra": "18:00"}],
    }
    r = api.post(f"{V1}/admin/negocios", json=datos, headers=ADMIN)
    assert r.status_code == 201, r.text
    n = r.json()
    assert n["estado"] == "activo" and n["creado_por_admin"] is True
    assert n["dueno"] is None and n["whatsapp"] is None
    assert n["barrio"]["slug"] == "cuba"
    # Ya sale en el mapa público.
    assert api.get(f"{V1}/negocios/{n['slug']}").status_code == 200

    otra = api.post(f"{V1}/admin/negocios", json=datos, headers=ADMIN)
    assert otra.status_code == 409 and otra.json()["error"]["codigo"] == "negocio_repetido"
    vecino = api.post(f"{V1}/admin/negocios", json=datos, headers=_auth("vecino1"))
    assert vecino.status_code == 403


def test_lote_simula_explica_errores_y_crea_todo_o_nada(api: TestClient) -> None:
    buena = {
        "nombre": "Real Pastel Pan",
        "categoria": "Panadería",
        "barrio": "Cuba",
        "direccion": "Cra 27 # 71-08",
        "ubicacion": CUBA,
        "whatsapp": "+57 310 456 7890",
        "horario": "lun-sab 6:00-20:00; dom 7-13",
    }
    mala = {
        "nombre": "Real Tienda Sin Datos",
        "categoria": "Joyería",
        "direccion": "x",
        "ubicacion": "Calle 71",
        "horario": "lunes",
    }
    url = f"{V1}/admin/negocios/lote"

    r = api.post(url, json={"filas": [buena, mala, buena]}, headers=ADMIN).json()
    assert [v["fila"] for v in r["validas"]] == [2]
    assert r["validas"][0]["categoria"] == "panaderia"
    assert r["validas"][0]["whatsapp"] == "3104567890" and r["validas"][0]["franjas"] == 7
    errores = {e["fila"]: e["mensajes"] for e in r["errores"]}
    assert set(errores) == {3, 4}
    assert "No existe la categoría «Joyería»." in errores[3]
    assert any("latitud, longitud" in m for m in errores[3])
    assert errores[4] == ["Está repetido en el archivo."]

    # Con errores no se crea nada, aunque se pida de verdad.
    r = api.post(url, json={"filas": [buena, mala], "simular": False}, headers=ADMIN).json()
    assert r["creados"] == 0
    assert api.get(f"{V1}/admin/negocios?q=Real Pastel", headers=ADMIN).json() == []

    r = api.post(
        url, json={"filas": [buena], "simular": False, "estado": "pendiente"}, headers=ADMIN
    ).json()
    assert r["creados"] == 1
    creados = api.get(f"{V1}/admin/negocios?q=Real Pastel", headers=ADMIN).json()
    assert [(n["estado"], n["creado_por_admin"]) for n in creados] == [("pendiente", True)]

    # Subir el mismo archivo otra vez no duplica.
    r = api.post(url, json={"filas": [buena]}, headers=ADMIN).json()
    assert r["errores"][0]["mensajes"] == ["Ya está en MiCuadra (mismo nombre en esa cuadra)."]
