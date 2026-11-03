"""Registro, formulario de bienvenida y registro de negocios por su dueño."""

import json
from collections.abc import Iterator

import psycopg
import pytest
from fastapi.testclient import TestClient

from scripts.firmar_token import firmar
from scripts.seed import DOMINIO, _id

pytestmark = pytest.mark.db

V1 = "/api/v1"

NEGOCIO = {
    "nombre": "Arepas  La Esquina",
    "categoria": "comida-casera",
    "whatsapp": "3104567890",
    "descripcion": "Arepas de choclo y chócolo con quesito.",
    "direccion_texto": "Calle 72 # 25-10, frente al parque",
    "ubicacion": {"lat": 4.7982, "lng": -75.7302},  # al lado del centro de Cuba
    "horarios": [
        {"dia_semana": 6, "abre": "16:00", "cierra": "22:00"},
        {"dia_semana": 0, "abre": "08:00", "cierra": "13:00"},
    ],
}


def _auth(clave: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {firmar(clave)}"}


@pytest.fixture
def nuevo(conn: psycopg.Connection) -> Iterator[str]:
    """Usuario recién registrado con Google (el trigger de auth crea su perfil)."""
    clave = "nuevo-google"
    uid = _id(f"usuario:{clave}")
    conn.execute("delete from auth.users where id = %s", (uid,))
    conn.execute(
        "insert into auth.users (id, email, raw_user_meta_data) values (%s, %s, %s)",
        (
            uid,
            f"{clave}@{DOMINIO}",
            json.dumps({"full_name": "Valeria Ospina", "avatar_url": "https://foto/valeria.png"}),
        ),
    )
    yield clave
    conn.execute("delete from negocios where dueno_id = %s", (uid,))
    conn.execute("delete from auth.users where id = %s", (uid,))


def _perfil(tipo: str = "vecino", **cambios: object) -> dict[str, object]:
    return {
        "tipo": tipo,
        "nombre": "Valeria  Ospina ",
        "celular": "3001112233",
        "barrio": "cuba",
        "acepta_datos": True,
        **cambios,
    }


def test_registro_con_google_trae_nombre_y_foto(client: TestClient, nuevo: str) -> None:
    r = client.get(f"{V1}/yo", headers=_auth(nuevo))
    assert r.status_code == 200
    p = r.json()
    assert p["nombre"] == "Valeria Ospina" and p["foto_url"] == "https://foto/valeria.png"
    assert p["roles"] == ["vecino"]
    assert p["perfil_completo"] is False  # → la web muestra el formulario de bienvenida


def test_bienvenida_como_vecino(client: TestClient, nuevo: str) -> None:
    r = client.put(f"{V1}/yo/perfil", json=_perfil(), headers=_auth(nuevo))
    assert r.status_code == 200
    p = r.json()
    assert p["perfil_completo"] is True and p["roles"] == ["vecino"]
    assert p["nombre"] == "Valeria Ospina" and p["celular"] == "3001112233"
    assert p["barrio"] == {"slug": "cuba", "nombre": "Cuba"}


def test_bienvenida_como_empresario_agrega_rol_dueno(client: TestClient, nuevo: str) -> None:
    r = client.put(f"{V1}/yo/perfil", json=_perfil("dueno", barrio=None), headers=_auth(nuevo))
    assert r.status_code == 200
    assert r.json()["roles"] == ["dueno", "vecino"] and r.json()["barrio"] is None


@pytest.mark.parametrize(
    ("cambios", "codigo"),
    [
        ({"celular": "6063334455"}, "datos_invalidos"),  # fijo, no celular
        ({"acepta_datos": False}, "datos_invalidos"),
        ({"tipo": "mensajero"}, "datos_invalidos"),
        ({"barrio": "no-existe"}, "barrio_invalido"),
    ],
)
def test_bienvenida_invalida(
    client: TestClient, nuevo: str, cambios: dict[str, object], codigo: str
) -> None:
    r = client.put(f"{V1}/yo/perfil", json=_perfil(**cambios), headers=_auth(nuevo))
    assert r.status_code == 422 and r.json()["error"]["codigo"] == codigo


def test_sin_sesion_no_hay_perfil(client: TestClient) -> None:
    assert client.get(f"{V1}/yo").status_code == 401
    assert client.put(f"{V1}/yo/perfil", json=_perfil()).status_code == 401


def test_vecino_no_puede_registrar_negocios(client: TestClient, nuevo: str) -> None:
    client.put(f"{V1}/yo/perfil", json=_perfil(), headers=_auth(nuevo))
    r = client.post(f"{V1}/mis-negocios", json=NEGOCIO, headers=_auth(nuevo))
    assert r.status_code == 403


def test_empresario_registra_negocio_pendiente(client: TestClient, nuevo: str) -> None:
    client.put(f"{V1}/yo/perfil", json=_perfil("dueno"), headers=_auth(nuevo))
    r = client.post(f"{V1}/mis-negocios", json=NEGOCIO, headers=_auth(nuevo))
    assert r.status_code == 201, r.text
    n = r.json()
    assert n["estado"] == "pendiente" and n["nombre"] == "Arepas La Esquina"
    assert n["slug"] == "arepas-la-esquina-cuba" and n["barrio"]["slug"] == "cuba"

    # Aparece en "mis negocios" pero no en el directorio público hasta que lo aprueben
    mios = client.get(f"{V1}/mis-negocios", headers=_auth(nuevo)).json()
    assert [m["slug"] for m in mios] == ["arepas-la-esquina-cuba"]
    assert client.get(f"{V1}/negocios/{n['slug']}").status_code == 404

    # Mismo nombre otra vez → slug distinto
    otro = client.post(f"{V1}/mis-negocios", json=NEGOCIO, headers=_auth(nuevo)).json()
    assert otro["slug"].startswith("arepas-la-esquina-cuba-") and otro["slug"] != n["slug"]


def test_horarios_del_negocio_quedan_guardados(
    client: TestClient, conn: psycopg.Connection, nuevo: str
) -> None:
    client.put(f"{V1}/yo/perfil", json=_perfil("dueno"), headers=_auth(nuevo))
    n = client.post(f"{V1}/mis-negocios", json=NEGOCIO, headers=_auth(nuevo)).json()
    franjas = conn.execute(
        "select dia_semana, to_char(abre, 'HH24:MI'), to_char(cierra, 'HH24:MI')"
        " from negocio_horarios where negocio_id = %s order by dia_semana",
        (n["id"],),
    ).fetchall()
    assert franjas == [(0, "08:00", "13:00"), (6, "16:00", "22:00")]


def test_negocio_lejos_de_los_barrios_piloto_queda_sin_barrio(
    client: TestClient, nuevo: str
) -> None:
    client.put(f"{V1}/yo/perfil", json=_perfil("dueno"), headers=_auth(nuevo))
    lejos = {**NEGOCIO, "ubicacion": {"lat": 4.85, "lng": -75.79}}  # Cerritos
    r = client.post(f"{V1}/mis-negocios", json=lejos, headers=_auth(nuevo))
    assert r.status_code == 201 and r.json()["barrio"] is None
    assert r.json()["slug"].endswith("-pereira")


@pytest.mark.parametrize(
    ("cambios", "codigo"),
    [
        ({"categoria": "joyeria"}, "categoria_invalida"),
        ({"ubicacion": {"lat": 6.25, "lng": -75.56}}, "datos_invalidos"),  # Medellín
        ({"horarios": [{"dia_semana": 1, "abre": "25:00", "cierra": "18:00"}]}, "datos_invalidos"),
        ({"horarios": [{"dia_semana": 1, "abre": "08:00", "cierra": "08:00"}]}, "datos_invalidos"),
        ({"descripcion": "x" * 281}, "datos_invalidos"),
        ({"whatsapp": "123"}, "datos_invalidos"),
    ],
)
def test_negocio_invalido(
    client: TestClient, nuevo: str, cambios: dict[str, object], codigo: str
) -> None:
    client.put(f"{V1}/yo/perfil", json=_perfil("dueno"), headers=_auth(nuevo))
    r = client.post(f"{V1}/mis-negocios", json={**NEGOCIO, **cambios}, headers=_auth(nuevo))
    assert r.status_code == 422 and r.json()["error"]["codigo"] == codigo


def test_fotos_del_negocio(client: TestClient, nuevo: str) -> None:
    client.put(f"{V1}/yo/perfil", json=_perfil("dueno"), headers=_auth(nuevo))
    nid = client.post(f"{V1}/mis-negocios", json=NEGOCIO, headers=_auth(nuevo)).json()["id"]
    ruta = f"{V1}/mis-negocios/{nid}/fotos"
    base = f"https://demo.supabase.co/storage/v1/object/public/negocio-fotos/{nid}/"

    for i in range(5):
        r = client.post(ruta, json={"url": f"{base}{i}.webp"}, headers=_auth(nuevo))
        assert r.status_code == 201 and r.json()["orden"] == i
    r = client.post(ruta, json={"url": f"{base}6.webp"}, headers=_auth(nuevo))
    assert r.status_code == 422 and r.json()["error"]["codigo"] == "limite_fotos"

    # Al borrar una, su lugar queda libre para la siguiente
    assert client.delete(f"{ruta}/2", headers=_auth(nuevo)).status_code == 204
    r = client.post(ruta, json={"url": f"{base}nueva.webp"}, headers=_auth(nuevo))
    assert r.json() == {"orden": 2, "url": f"{base}nueva.webp"}
    fotos = client.get(ruta, headers=_auth(nuevo)).json()
    assert [f["orden"] for f in fotos] == [0, 1, 2, 3, 4]


@pytest.mark.parametrize(
    "url",
    [
        "https://otro-sitio.com/foto.webp",
        "https://demo.supabase.co/storage/v1/object/public/negocio-fotos/OTRO/foto.webp",
        "https://demo.supabase.co/storage/v1/object/public/negocio-fotos/{nid}/sub/foto.webp",
        "https://demo.supabase.co/storage/v1/object/public/negocio-fotos/{nid}/../x.webp",
    ],
)
def test_fotos_solo_del_bucket_y_carpeta_del_negocio(
    client: TestClient, nuevo: str, url: str
) -> None:
    client.put(f"{V1}/yo/perfil", json=_perfil("dueno"), headers=_auth(nuevo))
    nid = client.post(f"{V1}/mis-negocios", json=NEGOCIO, headers=_auth(nuevo)).json()["id"]
    r = client.post(
        f"{V1}/mis-negocios/{nid}/fotos", json={"url": url.format(nid=nid)}, headers=_auth(nuevo)
    )
    assert r.status_code == 422


def test_fotos_de_negocio_ajeno(client: TestClient, nuevo: str) -> None:
    client.put(f"{V1}/yo/perfil", json=_perfil("dueno"), headers=_auth(nuevo))
    nid = client.post(f"{V1}/mis-negocios", json=NEGOCIO, headers=_auth(nuevo)).json()["id"]
    assert client.get(f"{V1}/mis-negocios/{nid}/fotos", headers=_auth("dueno2")).status_code == 404
    assert client.get(f"{V1}/mis-negocios/{nid}/fotos", headers=_auth("admin")).status_code == 200
