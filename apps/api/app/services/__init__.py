"""Selección de implementaciones según los feature flags. Único lugar donde se hace el cambio
de stub a implementación real (`MANDADOS_ACTIVOS`, `PAGOS_PROVEEDOR`)."""

from typing import Annotated

from fastapi import Depends

from app.config import Settings, get_settings
from app.services.mandados import MandadoService, MandadoStub
from app.services.notificaciones import LogNotification, NotificationService
from app.services.pagos import ManualPayment, PaymentService


def get_mandado_service(settings: Annotated[Settings, Depends(get_settings)]) -> MandadoService:
    # Fase 2: `return MandadoReal(...) if settings.mandados_activos else MandadoStub()`
    return MandadoStub()


def get_payment_service(settings: Annotated[Settings, Depends(get_settings)]) -> PaymentService:
    # Fase 3: `WompiPayment` cuando settings.pagos_proveedor == "wompi"
    return ManualPayment()


def get_notification_service() -> NotificationService:
    return LogNotification()
