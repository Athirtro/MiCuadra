"""Directorio público contra PostGIS real con el seed [DEMO]."""

from collections.abc import Iterator
from datetime import UTC, datetime

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.horarios import ahora_utc

pytestmark = pytest.mark.db

V1 = "/api/v1"
# Martes 3 de noviembre de 2026, 10:00 en Bogotá (15:00 UTC)
MARTES_10AM = datetime(2026, 11, 3, 15, 0, tzinfo=UTC)
# Martes 13:00 en Bogotá: barberías y papelerías en su pausa de almuerzo
MARTES_1PM = datetime(2026, 11, 3, 18, 0, tzinfo=UTC)


@pytest.fixture
def api(base_de_datos: None) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[ahora_utc] = lambda: MARTES_10AM
    with TestClient(app) as c:
        yield c


def _centro(conn: psycopg.Connection, barrio: str) -> dict[str, float]:
    fila = conn.execute(
        "select st_y(centroide::geometry), st_x(centroide::geometry) from barrios where slug = %s",
        (barrio,),
    ).fetchone()
    assert fila
    return {"lat": fila[0], "lng": fila[1]}


# ── Catálogos ──


def test_categorias_en_orden(api: TestClient) -> None:
    r = api.get(f"{V1}/categorias")
    assert r.status_code == 200
    slugs = [c["slug"] for c in r.json()]
    assert slugs[:3] == ["tienda", "panaderia", "barberia"] and len(slugs) == 10


def test_barrios_piloto_con_centroide(api: TestClient) -> None:
    r = api.get(f"{V1}/barrios")
    pilotos = {b["slug"]: b for b in r.json() if b["es_piloto"]}
    assert set(pilotos) == {"cuba", "alamos", "boston", "el-jardin"}
    assert 4.7 < pilotos["cuba"]["centroide"]["lat"] < 4.9


# ── Búsqueda geoespacial ──


def test_ordenados_por_distancia_y_dentro_del_radio(
    api: TestClient, conn: psycopg.Connection
) -> None:
    r = api.get(f"{V1}/negocios", params={**_centro(conn, "cuba"), "radio_m": 1000})
    assert r.status_code == 200
    items = r.json()["items"]
    assert items, "Cuba debe tener negocios demo cerca del centro"
    distancias = [n["distancia_m"] for n in items]
    assert distancias == sorted(distancias)
    assert all(d <= 1000 for d in distancias)
    assert {n["barrio"]["slug"] for n in items} == {"cuba"}  # Álamos queda a ~5 km
    assert all(n["categoria"]["color"].startswith("#") for n in items)


def test_solo_negocios_activos(api: TestClient, conn: psycopg.Connection) -> None:
    pendientes = {
        r[0] for r in conn.execute("select id::text from negocios where estado <> 'activo'")
    }
    for barrio in ("cuba", "alamos", "boston", "el-jardin"):
        r = api.get(f"{V1}/negocios", params={**_centro(conn, barrio), "radio_m": 3000})
        assert not pendientes & {n["id"] for n in r.json()["items"]}


def test_caso_borde_del_radio(api: TestClient, conn: psycopg.Connection) -> None:
    """Un negocio a d metros aparece con radio ≥ d y desaparece con radio < d."""
    fila = conn.execute(
        "select n.id::text, st_distance(n.ubicacion, b.centroide)"
        " from negocios n join barrios b on b.slug = 'boston'"
        " where n.estado = 'activo' and st_distance(n.ubicacion, b.centroide) between 150 and 900"
        " order by 2 limit 1"
    ).fetchone()
    assert fila
    negocio_id, distancia = fila[0], float(fila[1])
    centro = _centro(conn, "boston")

    def ids(radio: int) -> set[str]:
        r = api.get(f"{V1}/negocios", params={**centro, "radio_m": radio, "limit": 100})
        return {n["id"] for n in r.json()["items"]}

    assert negocio_id in ids(int(distancia) + 1)
    assert negocio_id not in ids(int(distancia) - 1)


def test_filtro_por_categoria(api: TestClient, conn: psycopg.Connection) -> None:
    r = api.get(
        f"{V1}/negocios", params={**_centro(conn, "alamos"), "radio_m": 3000, "categoria": "tienda"}
    )
    items = r.json()["items"]
    assert items and {n["categoria"]["slug"] for n in items} == {"tienda"}


@pytest.mark.parametrize("q", ["panaderia", "PANADERÍA", "Panadría"])
def test_busqueda_sin_tildes_ni_mayusculas_y_con_errores(
    api: TestClient, conn: psycopg.Connection, q: str
) -> None:
    resultados = []
    for barrio in ("cuba", "alamos", "boston", "el-jardin"):
        r = api.get(f"{V1}/negocios", params={**_centro(conn, barrio), "radio_m": 3000, "q": q})
        resultados += r.json()["items"]
    assert resultados
    assert all(
        "panader" in (n["nombre"] + n["categoria"]["nombre"]).lower().replace("í", "i")
        for n in resultados
    )


def test_busqueda_por_descripcion(api: TestClient, conn: psycopg.Connection) -> None:
    r = api.get(
        f"{V1}/negocios", params={**_centro(conn, "boston"), "radio_m": 3000, "q": "fotocopias"}
    )
    assert r.json()["items"]
    assert {n["categoria"]["slug"] for n in r.json()["items"]} == {"papeleria"}


def test_abierto_ahora_con_hora_de_bogota(base_de_datos: None, conn: psycopg.Connection) -> None:
    app = create_app()
    app.dependency_overrides[ahora_utc] = lambda: MARTES_1PM
    c = TestClient(app)
    params = {**_centro(conn, "cuba"), "radio_m": 3000}
    todos = c.get(f"{V1}/negocios", params=params).json()["items"]
    abiertos = c.get(f"{V1}/negocios", params={**params, "abierto_ahora": True}).json()["items"]
    assert len(abiertos) < len(todos)
    assert all(n["abierto_ahora"] for n in abiertos)
    # A la 1 p. m. las barberías están en su pausa (9–12:30 y 14–19:30)
    assert "barberia" not in {n["categoria"]["slug"] for n in abiertos}


def test_destacado_primero(api: TestClient, conn: psycopg.Connection) -> None:
    centro = _centro(conn, "el-jardin")
    lejano = api.get(f"{V1}/negocios", params={**centro, "radio_m": 1000}).json()["items"][-1]
    conn.execute(
        "update negocios set destacado_hasta = now() + interval '1 day' where id = %s",
        (lejano["id"],),
    )
    try:
        items = api.get(f"{V1}/negocios", params={**centro, "radio_m": 1000}).json()["items"]
        assert items[0]["id"] == lejano["id"] and items[0]["destacado"] is True
    finally:
        conn.execute("update negocios set destacado_hasta = null where id = %s", (lejano["id"],))


def test_paginacion_con_cursor(api: TestClient, conn: psycopg.Connection) -> None:
    params = {**_centro(conn, "cuba"), "radio_m": 3000, "limit": 3}
    p1 = api.get(f"{V1}/negocios", params=params).json()
    assert len(p1["items"]) == 3 and p1["siguiente_cursor"] == "3"
    p2 = api.get(f"{V1}/negocios", params={**params, "cursor": p1["siguiente_cursor"]}).json()
    assert not {n["id"] for n in p1["items"]} & {n["id"] for n in p2["items"]}
    assert p2["total"] == p1["total"]


@pytest.mark.parametrize(
    "params",
    [{"lat": 40.4, "lng": -3.7}, {"lat": 4.8, "lng": -75.7, "radio_m": 50000}, {"lat": 4.8}],
)
def test_parametros_invalidos(api: TestClient, params: dict[str, float]) -> None:
    r = api.get(f"{V1}/negocios", params=params)
    assert r.status_code == 422 and r.json()["error"]["codigo"] == "datos_invalidos"


# ── Perfil ──


def test_perfil_por_slug_con_hook_de_mandados(api: TestClient, conn: psycopg.Connection) -> None:
    slug = conn.execute(
        "select n.slug from negocios n join categorias c on c.id = n.categoria_id"
        " where n.estado = 'activo' and c.slug = 'barberia' limit 1"
    ).fetchone()[0]  # type: ignore[index]
    r = api.get(f"{V1}/negocios/{slug}")
    assert r.status_code == 200
    n = r.json()
    assert n["slug"] == slug and n["fotos"] and n["whatsapp"].startswith("3")
    # Barbería: lunes a sábado, dos franjas → 12 franjas
    assert len(n["horarios"]) == 12 and n["horarios"][0] == {
        "dia_semana": 1,
        "abre": "09:00",
        "cierra": "12:30",
    }
    assert n["abierto_ahora"] is True  # martes 10 a. m.
    assert n["mandados"]["disponible"] is False and n["mandados"]["razon"] == "proximamente"


def test_perfil_por_id_y_cerrado_hoy(api: TestClient, conn: psycopg.Connection) -> None:
    negocio_id = conn.execute(
        "select n.id::text from negocios n join categorias c on c.id = n.categoria_id"
        " where n.estado = 'activo' and c.slug = 'tienda' limit 1"
    ).fetchone()[0]  # type: ignore[index]
    conn.execute(
        "update negocios set cerrado_hoy_fecha = date '2026-11-03' where id = %s", (negocio_id,)
    )
    try:
        n = api.get(f"{V1}/negocios/{negocio_id}").json()
        assert n["cerrado_hoy"] is True and n["abierto_ahora"] is False
    finally:
        conn.execute("update negocios set cerrado_hoy_fecha = null where id = %s", (negocio_id,))


def test_perfil_de_negocio_pendiente_es_404(api: TestClient, conn: psycopg.Connection) -> None:
    slug = conn.execute("select slug from negocios where estado = 'pendiente' limit 1").fetchone()[
        0
    ]  # type: ignore[index]
    r = api.get(f"{V1}/negocios/{slug}")
    assert r.status_code == 404 and r.json()["error"]["codigo"] == "negocio_no_encontrado"


# ── Eventos ──


def test_registra_eventos(api: TestClient, conn: psycopg.Connection) -> None:
    negocio_id = conn.execute(
        "select id::text from negocios where estado = 'activo' limit 1"
    ).fetchone()[0]  # type: ignore[index]
    antes = conn.execute(
        "select count(*) from eventos where tipo = 'click_pedir_mandado'"
    ).fetchone()[0]  # type: ignore[index]
    r = api.post(
        f"{V1}/eventos",
        json={"tipo": "click_pedir_mandado", "anon_id": "anon-12345678", "negocio_id": negocio_id},
    )
    assert r.status_code == 204
    despues = conn.execute(
        "select count(*) from eventos where tipo = 'click_pedir_mandado'"
    ).fetchone()[0]  # type: ignore[index]
    assert despues == antes + 1


def test_evento_con_negocio_inexistente_se_guarda_sin_negocio(
    api: TestClient, conn: psycopg.Connection
) -> None:
    r = api.post(
        f"{V1}/eventos",
        json={
            "tipo": "vista_perfil",
            "anon_id": "anon-fantasma",
            "negocio_id": "00000000-0000-0000-0000-000000000000",
        },
    )
    assert r.status_code == 204
    fila = conn.execute("select negocio_id from eventos where anon_id = 'anon-fantasma'").fetchone()
    assert fila == (None,)


@pytest.mark.parametrize(
    "cuerpo",
    [
        {"tipo": "hackeo", "anon_id": "anon-12345678"},
        {"tipo": "sesion", "anon_id": "corto"},
        {"tipo": "sesion", "anon_id": "con espacios y ñ"},
        {"tipo": "sesion", "anon_id": "anon-12345678", "metadata": {"x": "a" * 2000}},
    ],
)
def test_eventos_invalidos(api: TestClient, cuerpo: dict[str, object]) -> None:
    assert api.post(f"{V1}/eventos", json=cuerpo).status_code == 422


def test_eventos_tienen_limite_por_ip(base_de_datos: None) -> None:
    c = TestClient(create_app())
    cuerpo = {"tipo": "sesion", "anon_id": "anon-rafaga"}
    cabeceras = {"X-Forwarded-For": "203.0.113.7"}
    codigos = [
        c.post(f"{V1}/eventos", json=cuerpo, headers=cabeceras).status_code for _ in range(125)
    ]
    assert codigos.count(204) == 120 and codigos[-1] == 429
    # Otra IP no se ve afectada
    otra = c.post(f"{V1}/eventos", json=cuerpo, headers={"X-Forwarded-For": "203.0.113.8"})
    assert otra.status_code == 204


def test_vista_previa_al_compartir(api: TestClient, conn: psycopg.Connection) -> None:
    fila = conn.execute(
        "select n.slug, n.nombre from negocios n"
        " where n.estado = 'activo' and exists (select 1 from negocio_fotos f where f.negocio_id = n.id)"
        " order by n.slug limit 1"
    ).fetchone()
    assert fila
    slug, nombre = fila
    r = api.get(f"{V1}/compartir/n/{slug}")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    assert f'<meta property="og:title" content="{nombre}' in r.text
    assert 'property="og:image" content="https://placehold.co/' in r.text
    assert f'content="http://localhost:5173/n/{slug}"' in r.text

    r = api.get(f"{V1}/compartir/n/no-existe")
    assert r.status_code == 404 and "icono-512.png" in r.text
