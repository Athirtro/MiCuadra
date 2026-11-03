"""Lista de espera, metas visibles de la landing y reportes de información incorrecta."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.ratelimit import limite
from app.schemas.comunidad import ListaEsperaEntrada, ListaEsperaRespuesta, Metas, ReporteEntrada
from app.services import comunidad, metricas
from app.services.horarios import ahora_utc

router = APIRouter(tags=["comunidad"])

Db = Annotated[Session, Depends(get_db)]


@router.post(
    "/lista-espera",
    response_model=ListaEsperaRespuesta,
    status_code=201,
    dependencies=[Depends(limite(10, 3600))],
)
def inscribirse(datos: ListaEsperaEntrada, db: Db) -> ListaEsperaRespuesta:
    """Inscribe en la lista de espera. Un mismo WhatsApp con el mismo rol no se duplica."""
    return ListaEsperaRespuesta(nuevo=comunidad.inscribir(db, datos))


@router.get("/lista-espera/metas", response_model=Metas)
def metas(db: Db, ahora: Annotated[datetime, Depends(ahora_utc)]) -> Metas:
    """Barra de metas de la landing: negocios activos, vecinos de la semana, mensajeros."""
    return metricas.metas(db, ahora)


@router.post(
    "/negocios/{negocio_id}/reportes",
    status_code=204,
    response_class=Response,
    dependencies=[Depends(limite(10, 3600))],
)
def reportar(negocio_id: UUID, datos: ReporteEntrada, db: Db) -> None:
    """«Reportar información incorrecta». Va a la cola de moderación del admin."""
    comunidad.reportar(db, negocio_id, datos)
