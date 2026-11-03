"""Horarios de los negocios y cálculo de "Abierto ahora" en hora de Bogotá.

`dia_semana`: 0 = domingo … 6 = sábado. Una franja con `cierra <= abre` cruza la medianoche
(p. ej. viernes 18:00–01:00 sigue abierta el sábado a la 00:30).
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

ZONA_NEGOCIOS = ZoneInfo("America/Bogota")


@dataclass(frozen=True)
class Franja:
    dia_semana: int
    abre: time
    cierra: time


def ahora_utc() -> datetime:
    """Dependencia del reloj (las pruebas la reemplazan)."""
    return datetime.now(UTC)


def dia_semana(d: date) -> int:
    # Python: lunes = 0 … domingo = 6  →  MiCuadra: domingo = 0 … sábado = 6
    return (d.weekday() + 1) % 7


def esta_abierto(
    franjas: Iterable[Franja], ahora: datetime, cerrado_hoy_fecha: date | None = None
) -> bool:
    local = ahora.astimezone(ZONA_NEGOCIOS)
    if cerrado_hoy_fecha == local.date():
        return False
    hoy, hora = dia_semana(local.date()), local.time().replace(tzinfo=None)
    ayer = (hoy - 1) % 7
    for f in franjas:
        if f.abre < f.cierra:
            if f.dia_semana == hoy and f.abre <= hora < f.cierra:
                return True
        else:  # cruza la medianoche
            if f.dia_semana == hoy and hora >= f.abre:
                return True
            if f.dia_semana == ayer and hora < f.cierra:
                return True
    return False
