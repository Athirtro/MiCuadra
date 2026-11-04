"""Contratos públicos del directorio (SPEC §10)."""

from uuid import UUID

from pydantic import BaseModel, Field

from app.services.mandados import Disponibilidad


class Categoria(BaseModel):
    id: UUID
    slug: str
    nombre: str
    icono: str
    color: str
    orden: int


class Punto(BaseModel):
    lat: float
    lng: float


class Barrio(BaseModel):
    id: UUID
    slug: str
    nombre: str
    centroide: Punto = Field(description="Centro de sus negocios activos")
    es_piloto: bool
    negocios: int = Field(description="Negocios activos en el barrio")


class CategoriaCorta(BaseModel):
    slug: str
    nombre: str
    icono: str
    color: str


class BarrioCorto(BaseModel):
    slug: str
    nombre: str


class NegocioResumen(BaseModel):
    id: UUID
    slug: str
    nombre: str
    descripcion: str | None
    categoria: CategoriaCorta
    barrio: BarrioCorto | None
    ubicacion: Punto
    distancia_m: int = Field(description="Distancia en línea recta desde el punto consultado")
    abierto_ahora: bool
    destacado: bool
    foto_url: str | None


class ListaNegocios(BaseModel):
    items: list[NegocioResumen]
    total: int = Field(description="Negocios que cumplen los filtros dentro del radio")
    siguiente_cursor: str | None


class Horario(BaseModel):
    dia_semana: int = Field(ge=0, le=6, description="0 = domingo … 6 = sábado")
    abre: str = Field(examples=["09:00"])
    cierra: str = Field(examples=["19:30"])


class NegocioDetalle(BaseModel):
    id: UUID
    slug: str
    nombre: str
    descripcion: str | None
    categoria: CategoriaCorta
    barrio: BarrioCorto | None
    ubicacion: Punto
    direccion_texto: str | None
    whatsapp: str | None
    telefono: str | None
    fotos: list[str]
    horarios: list[Horario]
    abierto_ahora: bool
    cerrado_hoy: bool
    destacado: bool
    mandados: Disponibilidad
