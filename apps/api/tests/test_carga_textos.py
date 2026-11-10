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
