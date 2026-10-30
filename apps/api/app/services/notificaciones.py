"""Notificaciones de cambio de estado. Web Push llega con la Fase 2; por ahora solo se registra."""

import logging
from typing import Literal, Protocol
from urllib.parse import quote
from uuid import UUID

logger = logging.getLogger(__name__)

Evento = Literal[
    "negocio_aprobado",
    "mandado_nuevo_cerca",
    "mandado_aceptado",
    "mandado_recogido",
    "mandado_en_camino",
    "mandado_entregado",
]


class NotificationService(Protocol):
    def send(
        self, usuario_id: UUID, evento: Evento, datos: dict[str, str] | None = None
    ) -> None: ...


class LogNotification:
    def send(self, usuario_id: UUID, evento: Evento, datos: dict[str, str] | None = None) -> None:
        # Sin datos personales en logs: solo el id y el tipo de evento.
        logger.info("notificacion evento=%s usuario=%s", evento, usuario_id)


def enlace_whatsapp(celular: str, texto: str) -> str:
    """`3001234567` → `https://wa.me/573001234567?text=...` (respaldo de cada notificación)."""
    digitos = "".join(c for c in celular if c.isdigit())
    if len(digitos) == 10:
        digitos = "57" + digitos
    return f"https://wa.me/{digitos}?text={quote(texto)}"
