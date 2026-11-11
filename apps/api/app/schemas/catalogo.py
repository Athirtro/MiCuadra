"""Catálogo de productos y servicios por negocio, y apartados (carrito → negocio)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

TipoItem = Literal["producto", "servicio"]
EstadoApartado = Literal["pendiente", "confirmado", "listo", "entregado", "cancelado"]


def _limpio(v: str | None) -> str | None:
    if v is None:
        return None
    return " ".join(v.split()) or None


# ── Catálogo ──


class Item(BaseModel):
    id: UUID
    seccion_id: UUID | None
    tipo: TipoItem
    nombre: str
    descripcion: str | None
    precio: int | None = Field(description="Pesos COP; null = preguntar el precio")
    precio_oferta: int | None = Field(
        default=None, description="Precio rebajado (menor que `precio`); null = sin oferta"
    )
    foto_url: str | None
    stock: int | None = Field(description="Unidades disponibles; null = no se controla")
    visible: bool
    orden: int


class Seccion(BaseModel):
    id: UUID
    nombre: str
    orden: int


class Catalogo(BaseModel):
    secciones: list[Seccion]
    items: list[Item] = Field(description="Ordenados por sección y orden")


class SeccionEntrada(BaseModel):
    nombre: str = Field(min_length=1, max_length=40)
    orden: int = Field(default=0, ge=0, le=999)

    @field_validator("nombre")
    @classmethod
    def nombre_limpio(cls, v: str) -> str:
        return " ".join(v.split())


class ItemEntrada(BaseModel):
    seccion_id: UUID | None = None
    tipo: TipoItem = "producto"
    nombre: str = Field(min_length=2, max_length=80)
    descripcion: str | None = Field(default=None, max_length=200)
    precio: int | None = Field(default=None, ge=0, le=10_000_000)
    precio_oferta: int | None = Field(default=None, ge=0, le=10_000_000)
    foto_url: str | None = Field(default=None, max_length=300)
    stock: int | None = Field(default=None, ge=0, le=100_000)
    visible: bool = True
    orden: int = Field(default=0, ge=0, le=999)

    @field_validator("nombre")
    @classmethod
    def nombre_limpio(cls, v: str) -> str:
        return " ".join(v.split())

    @field_validator("descripcion")
    @classmethod
    def descripcion_limpia(cls, v: str | None) -> str | None:
        return _limpio(v)

    @model_validator(mode="after")
    def oferta_menor(self) -> "ItemEntrada":
        if self.precio_oferta is not None and (
            self.precio is None or self.precio_oferta >= self.precio
        ):
            raise ValueError("El precio de oferta debe ser menor que el precio normal.")
        return self


class CambioStock(BaseModel):
    """Ajuste rápido desde el panel: suma o resta unidades (no baja de 0)."""

    delta: int = Field(ge=-100_000, le=100_000)


# ── Apartados ──


class ApartadoItemEntrada(BaseModel):
    item_id: UUID
    cantidad: int = Field(ge=1, le=99)


class ApartadoEntrada(BaseModel):
    items: list[ApartadoItemEntrada] = Field(min_length=1, max_length=30)
    nota: str | None = Field(default=None, max_length=280)

    @field_validator("nota")
    @classmethod
    def nota_limpia(cls, v: str | None) -> str | None:
        return _limpio(v)


class ApartadoItem(BaseModel):
    item_id: UUID | None
    nombre: str
    precio: int | None
    cantidad: int


class NegocioDelApartado(BaseModel):
    id: UUID
    slug: str
    nombre: str
    whatsapp: str | None


class VecinoDelApartado(BaseModel):
    nombre: str | None
    celular: str | None


class Apartado(BaseModel):
    id: UUID
    codigo: str = Field(description="Código corto para decirlo por WhatsApp")
    estado: EstadoApartado
    negocio: NegocioDelApartado
    vecino: VecinoDelApartado | None = Field(
        default=None, description="Solo lo ve el negocio, para saber a quién entregarle"
    )
    items: list[ApartadoItem]
    nota: str | None
    total: int = Field(description="Suma de los ítems con precio, en pesos COP")
    hay_sin_precio: bool
    motivo_cancelacion: str | None
    cancelado_por: Literal["vecino", "negocio"] | None
    created_at: datetime
    updated_at: datetime


class CambioEstadoApartado(BaseModel):
    estado: Literal["confirmado", "listo", "entregado", "cancelado"]
    motivo: str | None = Field(default=None, max_length=200)

    @field_validator("motivo")
    @classmethod
    def motivo_limpio(cls, v: str | None) -> str | None:
        return _limpio(v)
