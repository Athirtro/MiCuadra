"""Lo que el equipo escribe en la planilla: horario y ubicación en texto libre."""

import pytest

from app.services.carga import interpretar_horario, interpretar_ubicacion


def _franjas(texto: str) -> list[tuple[int, str, str]]:
    return [(h.dia_semana, h.abre, h.cierra) for h in interpretar_horario(texto)]


def test_horario_por_rangos_y_dos_franjas() -> None:
    franjas = _franjas("lun-sab 7:00-12:00 y 14:00-19:00; dom 8-13")
    assert (1, "07:00", "12:00") in franjas and (1, "14:00", "19:00") in franjas
    assert (6, "14:00", "19:00") in franjas
    assert (0, "08:00", "13:00") in franjas
    assert len(franjas) == 13


def test_horario_todos_los_dias_con_tildes_y_listas() -> None:
    assert {d for d, _, _ in _franjas("Todos los días 6:00-21:00")} == set(range(7))
    assert _franjas("Mié, Vie 9:30-18:00") == [(3, "09:30", "18:00"), (5, "09:30", "18:00")]
    # Rango que pasa por el domingo.
    assert [d for d, _, _ in _franjas("vie a lun 10-22")] == [5, 6, 0, 1]


@pytest.mark.parametrize(
    ("texto", "error"),
    [
        ("lunes", "No entendí «lunes»"),
        ("lun-xyz 7-19", "No entendí los días"),
        ("lun 25:00-19:00", "No entendí la hora"),
    ],
)
def test_horario_con_errores_explica_que_falla(texto: str, error: str) -> None:
    with pytest.raises(ValueError, match=error):
        interpretar_horario(texto)


@pytest.mark.parametrize(
    "texto",
    [
        "4.7966, -75.7301",
        "4.7966 -75.7301",
        "https://www.google.com/maps/place/Pan/@4.7966,-75.7301,17z",
        "https://maps.google.com/?q=4.7966,-75.7301",
    ],
)
def test_ubicacion_en_varios_formatos(texto: str) -> None:
    p = interpretar_ubicacion(texto)
    assert (p.lat, p.lng) == (4.7966, -75.7301)


def test_ubicacion_ilegible() -> None:
    with pytest.raises(ValueError, match="latitud, longitud"):
        interpretar_ubicacion("Calle 71 # 26B-08")


# ── Google Geocoding (sin red: se simula la respuesta) ──


def _respuesta(cuerpo: dict[str, object]) -> object:
    import io
    import json

    return io.BytesIO(json.dumps(cuerpo).encode())


def test_limpia_la_direccion_antes_de_buscar() -> None:
    from app.services.geocodificar import limpiar_direccion

    assert limpiar_direccion("Cl 69 # 25-46 L-2") == "Cl 69 # 25-46"
    assert limpiar_direccion("Cl 72 # 26B-07 (Intercambiador de Cuba)") == "Cl 72 # 26B-07"


def test_google_solo_vale_si_es_preciso_y_en_pereira(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import geocodificar

    respuestas = {
        "Cra 27 # 71-08": {
            "status": "OK",
            "results": [
                {
                    "formatted_address": "Cra. 27 #71-08, Pereira, Risaralda",
                    "geometry": {
                        "location": {"lat": 4.8037, "lng": -75.7379},
                        "location_type": "ROOFTOP",
                    },
                }
            ],
        },
        # Solo encontró la calle: se descarta.
        "Cl 71 # 26B-08": {
            "status": "OK",
            "results": [
                {
                    "geometry": {
                        "location": {"lat": 4.80, "lng": -75.74},
                        "location_type": "GEOMETRIC_CENTER",
                    }
                }
            ],
        },
        "Cr 1 # 1-01": {"status": "ZERO_RESULTS", "results": []},
    }
    pedidos: list[str] = []

    def falso(url: str, timeout: float) -> object:
        pedidos.append(url)
        for direccion, cuerpo in respuestas.items():
            if direccion.replace(" ", "+").replace("#", "%23") in url:
                return _respuesta(cuerpo)
        raise AssertionError(url)

    monkeypatch.setattr(geocodificar.urllib.request, "urlopen", falso)
    buscar = geocodificar.con_google("clave-de-prueba")
    e = buscar("Cra 27 # 71-08", "Cuba")
    assert e is not None and (e.punto.lat, e.punto.lng) == (4.8037, -75.7379)
    assert "components=country%3ACO%7Clocality%3APereira" in pedidos[0]
    assert buscar("Cl 71 # 26B-08", "Cuba") is None
    assert buscar("Cr 1 # 1-01", None) is None
    buscar("Cra 27 # 71-08", "Cuba")
    assert len(pedidos) == 3  # la repetida sale de la caché


def test_si_google_rechaza_se_avisa_y_no_se_guarda(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import geocodificar

    llamadas: list[str] = []

    def falso(url: str, timeout: float) -> object:
        llamadas.append(url)
        return _respuesta({"status": "REQUEST_DENIED", "error_message": "You must enable Billing"})

    monkeypatch.setattr(geocodificar.urllib.request, "urlopen", falso)
    buscar = geocodificar.con_google("clave")
    with pytest.raises(geocodificar.GoogleNoDisponible):
        buscar("Cra 27 # 71-08", "Cuba")
    with pytest.raises(geocodificar.GoogleNoDisponible):
        buscar("Cra 27 # 71-08", "Cuba")
    assert len(llamadas) == 2  # un rechazo no queda en caché: al arreglar la facturación funciona
