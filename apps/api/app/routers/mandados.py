"""Endpoints de mandados (Fase 2+). Mientras `MANDADOS_ACTIVOS=false` responden 501
`{ "error": { "codigo": "proximamente" } }`. Los contratos completos se definen en Fase 2."""

from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.errors import ApiError


def requiere_mandados_activos(settings: Annotated[Settings, Depends(get_settings)]) -> None:
    if not settings.mandados_activos:
        raise ApiError(501, "proximamente", "Los mandados llegan pronto a tu barrio.")


router = APIRouter(
    prefix="/mandados",
    tags=["mandados"],
    dependencies=[Depends(requiere_mandados_activos)],
    responses={501: {"description": "Mandados aún no activos"}},
)


def _no_implementado() -> NoReturn:
    raise ApiError(501, "no_implementado", "Esta función se construye en la Fase 2.")


@router.post("/cotizar")
def cotizar() -> None:
    _no_implementado()


@router.post("")
def crear() -> None:
    _no_implementado()


@router.get("")
def listar() -> None:
    _no_implementado()


@router.get("/disponibles")
def disponibles() -> None:
    _no_implementado()


@router.get("/{mandado_id}")
def detalle(mandado_id: str) -> None:
    _no_implementado()
