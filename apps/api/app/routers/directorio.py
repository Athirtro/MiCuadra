"""Directorio (núcleo). En Fase 0 solo expone el hook de mandados; el resto llega en Fase 1."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ApiError
from app.services import get_mandado_service
from app.services.directorio import negocio_activo_existe
from app.services.mandados import Disponibilidad, MandadoService

router = APIRouter(prefix="/negocios", tags=["directorio"])


@router.get("/{negocio_id}/mandados-disponibles", response_model=Disponibilidad)
def mandados_disponibles(
    negocio_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    mandados: Annotated[MandadoService, Depends(get_mandado_service)],
) -> Disponibilidad:
    if not negocio_activo_existe(db, negocio_id):
        raise ApiError(404, "negocio_no_encontrado", "Ese negocio no existe o no está activo.")
    return mandados.get_disponibilidad(negocio_id)
