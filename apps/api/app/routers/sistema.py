from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import UsuarioActual, get_usuario_actual
from app.config import Settings, get_settings
from app.db import get_db

router = APIRouter(tags=["sistema"])


class Health(BaseModel):
    estado: Literal["ok", "degradado"]
    entorno: str
    version: str
    db: Literal["ok", "error"]
    postgis: str | None = None


@router.get("/health", response_model=Health, responses={503: {"model": Health}})
def health(
    settings: Annotated[Settings, Depends(get_settings)],
    db: Annotated[Session, Depends(get_db)],
) -> Health | JSONResponse:
    try:
        postgis = db.execute(text("select postgis_lib_version()")).scalar_one()
        return Health(
            estado="ok",
            entorno=settings.entorno,
            version=settings.version,
            db="ok",
            postgis=postgis,
        )
    except Exception:
        cuerpo = Health(
            estado="degradado", entorno=settings.entorno, version=settings.version, db="error"
        )
        return JSONResponse(status_code=503, content=cuerpo.model_dump())


@router.get("/yo", response_model=UsuarioActual)
def yo(usuario: Annotated[UsuarioActual, Depends(get_usuario_actual)]) -> UsuarioActual:
    """Usuario autenticado y sus roles (útil para que la web decida qué mostrar)."""
    return usuario
