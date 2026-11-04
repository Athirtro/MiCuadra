"""Cuenta del usuario autenticado: perfil y negocios que registra como dueño."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Response
from sqlalchemy.orm import Session

from app.auth import UsuarioActual, get_usuario_actual, requiere_rol
from app.config import Settings, get_settings
from app.db import get_db
from app.ratelimit import limite
from app.schemas.cuenta import Foto, FotoEntrada, MiNegocio, NegocioEntrada, Perfil, PerfilEntrada
from app.services import cuenta

router = APIRouter(tags=["cuenta"])

Usuario = Annotated[UsuarioActual, Depends(get_usuario_actual)]
Dueno = Annotated[UsuarioActual, Depends(requiere_rol("dueno", "admin"))]
Db = Annotated[Session, Depends(get_db)]


@router.get("/yo", response_model=Perfil)
def yo(usuario: Usuario, db: Db) -> Perfil:
    """Perfil del usuario autenticado. `perfil_completo=false` → mostrar el formulario de bienvenida."""
    return cuenta.obtener_perfil(db, usuario.id, usuario.email)


@router.put("/yo/perfil", response_model=Perfil)
def guardar_perfil(datos: PerfilEntrada, usuario: Usuario, db: Db) -> Perfil:
    return cuenta.guardar_perfil(db, usuario.id, usuario.email, datos)


@router.get("/mis-negocios", response_model=list[MiNegocio])
def mis_negocios(usuario: Dueno, db: Db) -> list[MiNegocio]:
    return cuenta.listar_mis_negocios(db, usuario.id)


@router.post(
    "/mis-negocios",
    response_model=MiNegocio,
    status_code=201,
    dependencies=[Depends(limite(30, 3600))],
)
def registrar_negocio(datos: NegocioEntrada, usuario: Dueno, db: Db) -> MiNegocio:
    """Registra un negocio en estado `pendiente` hasta que un admin lo apruebe."""
    return cuenta.crear_negocio(db, usuario.id, datos)


@router.get("/mis-negocios/{negocio_id}/fotos", response_model=list[Foto])
def fotos(negocio_id: UUID, usuario: Dueno, db: Db) -> list[Foto]:
    return cuenta.listar_fotos(db, negocio_id, usuario.id, "admin" in usuario.roles)


@router.post(
    "/mis-negocios/{negocio_id}/fotos",
    response_model=Foto,
    status_code=201,
    dependencies=[Depends(limite(60, 3600))],
)
def agregar_foto(
    negocio_id: UUID,
    datos: FotoEntrada,
    usuario: Dueno,
    db: Db,
    settings: Annotated[Settings, Depends(get_settings)],
) -> Foto:
    """Registra una foto que la web ya subió a Supabase Storage (`negocio-fotos/{id}/…`)."""
    prefijo = cuenta.prefijo_fotos(settings.supabase_url, negocio_id)
    return cuenta.agregar_foto(
        db, negocio_id, usuario.id, "admin" in usuario.roles, datos.url, prefijo
    )


@router.delete("/mis-negocios/{negocio_id}/fotos/{orden}", status_code=204, response_class=Response)
def borrar_foto(
    negocio_id: UUID, orden: Annotated[int, Path(ge=0, le=4)], usuario: Dueno, db: Db
) -> None:
    cuenta.borrar_foto(db, negocio_id, usuario.id, "admin" in usuario.roles, orden)
