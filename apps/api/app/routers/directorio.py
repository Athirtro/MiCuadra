"""Directorio público (núcleo). Solo conoce la interfaz `MandadoService`."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ApiError
from app.schemas.directorio import Barrio, Categoria, ListaNegocios, NegocioDetalle
from app.services import directorio as servicio
from app.services import get_mandado_service
from app.services.horarios import ahora_utc
from app.services.mandados import Disponibilidad, MandadoService

router = APIRouter(tags=["directorio"])

# Pereira cabe holgada en este recuadro; evita consultas a coordenadas sin sentido.
_LAT = {"ge": 4.6, "le": 5.0}
_LNG = {"ge": -76.0, "le": -75.5}


@router.get("/categorias", response_model=list[Categoria])
def categorias(db: Annotated[Session, Depends(get_db)]) -> list[Categoria]:
    return servicio.listar_categorias(db)


@router.get("/barrios", response_model=list[Barrio])
def barrios(db: Annotated[Session, Depends(get_db)]) -> list[Barrio]:
    return servicio.listar_barrios(db)


@router.get("/negocios", response_model=ListaNegocios)
def negocios(
    db: Annotated[Session, Depends(get_db)],
    ahora: Annotated[datetime, Depends(ahora_utc)],
    lat: Annotated[float, Query(**_LAT)],
    lng: Annotated[float, Query(**_LNG)],
    radio_m: Annotated[int, Query(ge=100, le=3000)] = 1000,
    categoria: Annotated[str | None, Query(max_length=40)] = None,
    q: Annotated[str | None, Query(max_length=80)] = None,
    abierto_ahora: bool = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: Annotated[str | None, Query(pattern=r"^\d{1,4}$")] = None,
) -> ListaNegocios:
    return servicio.buscar_negocios(
        db,
        lat=lat,
        lng=lng,
        radio_m=radio_m,
        ahora=ahora,
        categoria=categoria,
        q=q.strip() if q else None,
        abierto_ahora=abierto_ahora,
        limit=limit,
        offset=int(cursor) if cursor else 0,
    )


@router.get("/negocios/{id_o_slug}", response_model=NegocioDetalle)
def negocio(
    id_o_slug: str,
    db: Annotated[Session, Depends(get_db)],
    ahora: Annotated[datetime, Depends(ahora_utc)],
    mandados: Annotated[MandadoService, Depends(get_mandado_service)],
) -> NegocioDetalle:
    detalle = servicio.get_negocio_detail(db, id_o_slug, ahora=ahora, mandados=mandados)
    if detalle is None:
        raise ApiError(404, "negocio_no_encontrado", "Ese negocio no existe o no está activo.")
    return detalle


@router.get("/negocios/{negocio_id}/mandados-disponibles", response_model=Disponibilidad)
def mandados_disponibles(
    negocio_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    mandados: Annotated[MandadoService, Depends(get_mandado_service)],
) -> Disponibilidad:
    if not servicio.negocio_activo_existe(db, negocio_id):
        raise ApiError(404, "negocio_no_encontrado", "Ese negocio no existe o no está activo.")
    return mandados.get_disponibilidad(negocio_id)
