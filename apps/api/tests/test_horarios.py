"""Criterio de aceptación Fase 1: "Abierto ahora" correcto con hora de Bogotá, franjas partidas
y "cerrado hoy"."""

from datetime import UTC, date, datetime, time, timedelta, timezone

import pytest

from app.services.horarios import Franja, dia_semana, esta_abierto

BOGOTA = timezone(timedelta(hours=-5))  # Colombia no tiene horario de verano

# Barbería: lunes a sábado 9:00–12:30 y 14:00–19:30 (franja partida)
BARBERIA = [
    Franja(d, a, c)
    for d in range(1, 7)
    for a, c in [(time(9), time(12, 30)), (time(14), time(19, 30))]
]
# Comidas: viernes y sábado 18:00–01:00 (cruza la medianoche)
NOCTURNO = [Franja(5, time(18), time(1)), Franja(6, time(18), time(1))]


def en_bogota(y: int, m: int, d: int, h: int, mi: int = 0) -> datetime:
    return datetime(y, m, d, h, mi, tzinfo=BOGOTA)


def test_dia_semana_domingo_es_cero() -> None:
    assert dia_semana(date(2026, 11, 1)) == 0  # domingo
    assert dia_semana(date(2026, 11, 7)) == 6  # sábado


@pytest.mark.parametrize(
    ("hora", "minuto", "abierto"),
    [
        (8, 59, False),
        (9, 0, True),
        (12, 29, True),
        (12, 30, False),  # cierre exclusivo
        (13, 0, False),  # entre franjas
        (14, 0, True),
        (19, 29, True),
        (19, 30, False),
    ],
)
def test_franja_partida(hora: int, minuto: int, abierto: bool) -> None:
    martes = en_bogota(2026, 11, 3, hora, minuto)
    assert esta_abierto(BARBERIA, martes) is abierto


def test_cerrado_el_dia_sin_franjas() -> None:
    domingo = en_bogota(2026, 11, 1, 10)
    assert esta_abierto(BARBERIA, domingo) is False


def test_usa_hora_de_bogota_no_utc() -> None:
    # 2026-11-03 13:30 UTC = 08:30 en Bogotá → todavía cerrado
    assert esta_abierto(BARBERIA, datetime(2026, 11, 3, 13, 30, tzinfo=UTC)) is False
    # 2026-11-04 00:30 UTC = martes 19:30 en Bogotá → ya cerró
    assert esta_abierto(BARBERIA, datetime(2026, 11, 4, 0, 30, tzinfo=UTC)) is False
    # 2026-11-04 00:00 UTC = martes 19:00 en Bogotá → abierto
    assert esta_abierto(BARBERIA, datetime(2026, 11, 4, 0, 0, tzinfo=UTC)) is True


@pytest.mark.parametrize(
    ("momento", "abierto"),
    [
        (en_bogota(2026, 11, 6, 17, 59), False),  # viernes antes de abrir
        (en_bogota(2026, 11, 6, 23, 0), True),  # viernes noche
        (en_bogota(2026, 11, 7, 0, 30), True),  # sábado madrugada (franja del viernes)
        (en_bogota(2026, 11, 7, 1, 0), False),  # sábado 01:00 cerró
        (en_bogota(2026, 11, 8, 0, 30), True),  # domingo madrugada (franja del sábado)
        (en_bogota(2026, 11, 9, 0, 30), False),  # lunes madrugada: el domingo no abre
    ],
)
def test_franja_que_cruza_medianoche(momento: datetime, abierto: bool) -> None:
    assert esta_abierto(NOCTURNO, momento) is abierto


def test_cerrado_hoy_gana_sobre_el_horario() -> None:
    martes = en_bogota(2026, 11, 3, 10)
    assert esta_abierto(BARBERIA, martes, cerrado_hoy_fecha=date(2026, 11, 3)) is False
    # El "cerrado hoy" de ayer ya no aplica
    assert esta_abierto(BARBERIA, martes, cerrado_hoy_fecha=date(2026, 11, 2)) is True


def test_cerrado_hoy_usa_la_fecha_de_bogota() -> None:
    # 2026-11-04 01:00 UTC todavía es martes 3 en Bogotá (20:00)
    momento = datetime(2026, 11, 4, 1, 0, tzinfo=UTC)
    nocturno_martes = [Franja(2, time(18), time(23))]
    assert esta_abierto(nocturno_martes, momento) is True
    assert esta_abierto(nocturno_martes, momento, cerrado_hoy_fecha=date(2026, 11, 3)) is False


def test_franja_hasta_medianoche() -> None:
    tienda = [Franja(2, time(18), time(0))]  # martes 18:00–24:00
    assert esta_abierto(tienda, en_bogota(2026, 11, 3, 23, 59)) is True
    assert esta_abierto(tienda, en_bogota(2026, 11, 4, 0, 1)) is False
