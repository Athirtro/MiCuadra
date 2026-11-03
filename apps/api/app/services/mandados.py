"""Capa de mandados (enchufable). El directorio solo conoce la interfaz `MandadoService`.

Fase 0–1: `MandadoStub` → siempre "próximamente".
Fase 2:   `MandadoReal` reemplaza al stub sin tocar el directorio ni el contrato del API.
"""

from typing import Literal, Protocol
from uuid import UUID

from pydantic import BaseModel


class Disponibilidad(BaseModel):
    """Contrato de `GET /negocios/{id}/mandados-disponibles`. No cambia entre fases."""

    disponible: bool
    razon: Literal["proximamente", "sin_mensajeros", "fuera_de_cobertura"] | None = None
    mensajeros_activos: int | None = None
    tarifa_desde: int | None = None


class MandadoService(Protocol):
    def get_disponibilidad(self, negocio_id: UUID) -> Disponibilidad: ...


class MandadoStub:
    def get_disponibilidad(self, negocio_id: UUID) -> Disponibilidad:
        return Disponibilidad(disponible=False, razon="proximamente")
