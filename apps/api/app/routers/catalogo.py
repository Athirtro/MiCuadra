"""Catálogo del negocio (público y del dueño) y apartados del vecino."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import UsuarioActual, get_usuario_actual, requiere_rol
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import ApiError
from app.ratelimit import limite
from app.schemas.catalogo import (
    Apartado,
    ApartadoEntrada,
    CambioEstadoApartado,
    CambioStock,
    Catalogo,
    Item,
    ItemEntrada,
    Seccion,
    SeccionEntrada,
)
from app.services import catalogo
from app.services.cuenta import prefijo_fotos

router = APIRouter(tags=["catalogo"])

Usuario = Annotated[UsuarioActual, Depends(get_usuario_actual)]
Dueno = Annotated[UsuarioActual, Depends(requiere_rol("dueno", "admin"))]
Db = Annotated[Session, Depends(get_db)]
Ajustes = Annotated[Settings, Depends(get_settings)]


class FotoBorrada(BaseModel):
    foto_url: str | None = Field(description="Foto que la web debe quitar del almacenamiento")


class Cancelacion(BaseModel):
    motivo: str | None = Field(default=None, max_length=200)


# ── Público ──


@router.get("/negocios/{id_o_slug}/catalogo", response_model=Catalogo)
def catalogo_publico(id_o_slug: str, db: Db) -> Catalogo:
    """Productos y servicios visibles de un negocio activo."""
    resultado = catalogo.catalogo_publico(db, id_o_slug)
    if resultado is None:
        raise ApiError(404, "negocio_no_encontrado", "Este negocio no está en el mapa.")
    return resultado


# ── Dueño ──


@router.get("/mis-negocios/{negocio_id}/catalogo", response_model=Catalogo)
def mi_catalogo(negocio_id: UUID, usuario: Dueno, db: Db) -> Catalogo:
    """Todo el catálogo, incluidos los ítems ocultos."""
    return catalogo.catalogo_dueno(db, negocio_id, usuario.id, "admin" in usuario.roles)


@router.post(
    "/mis-negocios/{negocio_id}/catalogo/secciones",
    response_model=Seccion,
    status_code=201,
    dependencies=[Depends(limite(120, 3600))],
)
def crear_seccion(negocio_id: UUID, datos: SeccionEntrada, usuario: Dueno, db: Db) -> Seccion:
    return catalogo.crear_seccion(db, negocio_id, usuario.id, "admin" in usuario.roles, datos)


@router.put("/mis-negocios/{negocio_id}/catalogo/secciones/{seccion_id}", response_model=Seccion)
def editar_seccion(
    negocio_id: UUID, seccion_id: UUID, datos: SeccionEntrada, usuario: Dueno, db: Db
) -> Seccion:
    return catalogo.editar_seccion(
        db, negocio_id, seccion_id, usuario.id, "admin" in usuario.roles, datos
    )


@router.delete(
    "/mis-negocios/{negocio_id}/catalogo/secciones/{seccion_id}",
    status_code=204,
    response_class=Response,
)
def borrar_seccion(negocio_id: UUID, seccion_id: UUID, usuario: Dueno, db: Db) -> None:
    catalogo.borrar_seccion(db, negocio_id, seccion_id, usuario.id, "admin" in usuario.roles)


@router.post(
    "/mis-negocios/{negocio_id}/catalogo/items",
    response_model=Item,
    status_code=201,
    dependencies=[Depends(limite(300, 3600))],
)
def crear_item(
    negocio_id: UUID, datos: ItemEntrada, usuario: Dueno, db: Db, settings: Ajustes
) -> Item:
    """Producto o servicio nuevo. La foto (opcional) la sube la web a `negocio-fotos/{id}/catalogo/`."""
    return catalogo.crear_item(
        db,
        negocio_id,
        usuario.id,
        "admin" in usuario.roles,
        datos,
        prefijo_fotos(settings.supabase_url, negocio_id),
    )


@router.put("/mis-negocios/{negocio_id}/catalogo/items/{item_id}", response_model=Item)
def editar_item(
    negocio_id: UUID,
    item_id: UUID,
    datos: ItemEntrada,
    usuario: Dueno,
    db: Db,
    settings: Ajustes,
) -> Item:
    return catalogo.editar_item(
        db,
        negocio_id,
        item_id,
        usuario.id,
        "admin" in usuario.roles,
        datos,
        prefijo_fotos(settings.supabase_url, negocio_id),
    )


@router.post("/mis-negocios/{negocio_id}/catalogo/items/{item_id}/stock", response_model=Item)
def ajustar_stock(
    negocio_id: UUID, item_id: UUID, cambio: CambioStock, usuario: Dueno, db: Db
) -> Item:
    """Suma o resta unidades sin abrir el formulario (llegó mercancía, se vendió en la tienda)."""
    return catalogo.ajustar_stock(
        db, negocio_id, item_id, usuario.id, "admin" in usuario.roles, cambio.delta
    )


@router.delete("/mis-negocios/{negocio_id}/catalogo/items/{item_id}", response_model=FotoBorrada)
def borrar_item(negocio_id: UUID, item_id: UUID, usuario: Dueno, db: Db) -> FotoBorrada:
    foto = catalogo.borrar_item(db, negocio_id, item_id, usuario.id, "admin" in usuario.roles)
    return FotoBorrada(foto_url=foto)


@router.get("/mis-negocios/{negocio_id}/apartados", response_model=list[Apartado])
def apartados_del_negocio(
    negocio_id: UUID,
    usuario: Dueno,
    db: Db,
    estado: Annotated[
        Literal["abiertos", "pendiente", "confirmado", "listo", "entregado", "cancelado"] | None,
        Query(),
    ] = None,
) -> list[Apartado]:
    """Apartados que recibió el negocio; `abiertos` = pendientes, confirmados y listos."""
    return catalogo.apartados_del_negocio(
        db, negocio_id, usuario.id, "admin" in usuario.roles, estado
    )


@router.post("/mis-negocios/{negocio_id}/apartados/{apartado_id}/estado", response_model=Apartado)
def cambiar_estado_apartado(
    negocio_id: UUID,
    apartado_id: UUID,
    cambio: CambioEstadoApartado,
    usuario: Dueno,
    db: Db,
) -> Apartado:
    """Confirmar descuenta el stock; cancelar un apartado confirmado lo devuelve."""
    return catalogo.cambiar_estado_por_negocio(
        db, negocio_id, apartado_id, usuario.id, "admin" in usuario.roles, cambio
    )


# ── Vecino ──


@router.post(
    "/negocios/{negocio_id}/apartados",
    response_model=Apartado,
    status_code=201,
    dependencies=[Depends(limite(20, 3600))],
)
def apartar(negocio_id: UUID, datos: ApartadoEntrada, usuario: Usuario, db: Db) -> Apartado:
    """El vecino aparta lo de su carrito. Se paga en la tienda al recoger."""
    return catalogo.crear_apartado(db, negocio_id, usuario.id, datos)


@router.get("/mis-apartados", response_model=list[Apartado])
def mis_apartados(usuario: Usuario, db: Db) -> list[Apartado]:
    return catalogo.mis_apartados(db, usuario.id)


@router.post("/mis-apartados/{apartado_id}/cancelar", response_model=Apartado)
def cancelar_apartado(apartado_id: UUID, datos: Cancelacion, usuario: Usuario, db: Db) -> Apartado:
    return catalogo.cancelar_por_vecino(db, apartado_id, usuario.id, datos.motivo)
