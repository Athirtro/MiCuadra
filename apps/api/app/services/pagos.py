"""Cobros de mandados detrás de una interfaz. Montos siempre en pesos enteros (COP).

Fase 1–2: `ManualPayment` (efectivo/Nequi al entregar, se registra en el libro de comisiones).
Fase 3:   `WompiPayment`.
"""

from typing import Literal, Protocol
from uuid import UUID

from pydantic import BaseModel


class ResultadoPago(BaseModel):
    proveedor: Literal["manual", "wompi"]
    estado: Literal["pendiente", "aprobado", "rechazado"]
    monto: int
    referencia_externa: str | None = None
    url_pago: str | None = None


class PaymentService(Protocol):
    def charge(self, mandado_id: UUID, monto: int) -> ResultadoPago: ...


class ManualPayment:
    """El vecino le paga al mensajero en persona; queda pendiente hasta que se confirme."""

    def charge(self, mandado_id: UUID, monto: int) -> ResultadoPago:
        if monto < 0:
            raise ValueError("El monto no puede ser negativo")
        return ResultadoPago(proveedor="manual", estado="pendiente", monto=monto)
