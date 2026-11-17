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


# ── Nomenclatura: cuadrícula inventada (calles horizontales, carreras verticales) ──


def _cuadricula() -> "object":
    from app.services.nomenclatura import Nomenclatura

    # Calles 70, 71 y 72 de oeste a este; carreras 26, 26 Bis y 27 de sur a norte. Cada cuadra ≈ 110 m.
    paso = 0.001
    calles = [
        (f"Calle {n}", [[4.800 + i * paso, -75.745], [4.800 + i * paso, -75.735]])
        for i, n in enumerate([70, 71, 72])
    ]
    # La Carrera 26B no existe en el mapa (como pasa en OSM): hay que interpolarla.
    carreras = [
        (nombre, [[4.799, -75.744 + j * paso], [4.803, -75.744 + j * paso]])
        for j, nombre in enumerate(["Carrera 26", "Carrera 26 Bis", "Carrera 27"])
    ]
    return Nomenclatura(calles + carreras)


def test_nomenclatura_esquina_exacta_y_metros_de_la_placa() -> None:
    n = _cuadricula()
    punto, como = n.ubicar("Cra 26 # 71-00")  # type: ignore[attr-defined]
    assert (punto.lat, punto.lng) == (4.801, -75.744)
    assert como == "esquina de la carrera 26 con calle 71"
    punto, como = n.ubicar("Cra 26 # 71-55")  # type: ignore[attr-defined]
    # 55 m de una cuadra de ≈111 m hacia la Calle 72: casi a mitad de cuadra.
    assert 4.8014 < punto.lat < 4.8016 and como.endswith("55 m adelante")


def test_nomenclatura_interpola_la_carrera_que_falta() -> None:
    from app.services.nomenclatura import numero, texto_numero

    assert [numero(x) for x in ("26", "26 Bis", "26A", "26B")] == [26, 26.1, 26.2, 26.4]
    assert [texto_numero(x) for x in (26, 26.1, 26.2, 26.4)] == ["26", "26 Bis", "26A", "26B"]
    punto, como = _cuadricula().ubicar("Cl 71 # 26B-00")  # type: ignore[attr-defined]
    assert como == "sobre la calle 71, entre la carrera 26 Bis y la 27"
    assert punto.lat == 4.801 and -75.743 < punto.lng < -75.742


def test_nomenclatura_no_inventa() -> None:
    n = _cuadricula()
    assert n.ubicar("Cl 99 # 26-10") is None  # type: ignore[attr-defined]  # la calle no está
    assert n.ubicar("Cl 71 # 40-10") is None  # type: ignore[attr-defined]  # fuera de los cruces
    assert n.ubicar("Mz 13 Casa 3") is None  # type: ignore[attr-defined]


def test_las_calles_de_pereira_vienen_con_el_api() -> None:
    from app.services.nomenclatura import cargar

    n = cargar()
    assert n is not None and len(n.tramos) > 200
    punto, _ = n.ubicar("Cra 27 # 71-08")  # Cuba
    assert 4.79 < punto.lat < 4.81 and -75.75 < punto.lng < -75.72


def test_encadenado_google_y_nomenclatura() -> None:
    from app.schemas.directorio import Punto
    from app.services.geocodificar import PAUSA_GOOGLE_S, Encontrado, GoogleNoDisponible, encadenar

    llamadas_google: list[str] = []
    ahora = [1000.0]

    def google_rechaza(d: str, b: str | None, c: Punto | None = None) -> Encontrado | None:
        llamadas_google.append(d)
        raise GoogleNoDisponible("REQUEST_DENIED")

    def local(d: str, b: str | None, c: Punto | None = None) -> Encontrado | None:
        if d == "Cl 71 # 26B-08":
            return Encontrado(Punto(lat=4.8, lng=-75.7), "entre…", "nomenclatura")
        return None

    buscar = encadenar(google_rechaza, local, reloj=lambda: ahora[0])
    r = buscar("Cl 71 # 26B-08", "Cuba", None)
    assert r is not None and r.metodo == "nomenclatura"
    # El rechazo no llega a la revisión, y Google queda en pausa: no se le vuelve a preguntar.
    assert buscar("Cl 1 # 1-01", None, None) is None
    assert llamadas_google == ["Cl 71 # 26B-08"]
    ahora[0] += PAUSA_GOOGLE_S + 1
    buscar("Cl 1 # 1-01", None, None)
    assert len(llamadas_google) == 2
    assert encadenar(None, local)("Cl 1 # 1-01", None, None) is None
