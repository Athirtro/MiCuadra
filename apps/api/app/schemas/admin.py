"""Contratos del panel de administración (SPEC §6.5) y del tablero del gate (SPEC §9)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.comunidad import RolEspera
from app.schemas.directorio import BarrioCorto, CategoriaCorta

EstadoNegocio = Literal["borrador", "pendiente", "activo", "rechazado", "inactivo"]
EstadoReporte = Literal["abierta", "resuelta", "descartada"]
Semaforo = Literal["verde", "amarillo", "rojo"]


class DuenoCorto(BaseModel):
    nombre: str | None
    email: str | None
    celular: str | None


class NegocioAdmin(BaseModel):
    id: UUID
    slug: str
    nombre: str
    estado: EstadoNegocio
    motivo_rechazo: str | None
    categoria: CategoriaCorta
    barrio: BarrioCorto | None
    whatsapp: str | None
    direccion_texto: str | None
    descripcion: str | None
    dueno: DuenoCorto | None
    creado_por_admin: bool
    reportes_abiertos: int
    created_at: datetime


class CambioEstadoNegocio(BaseModel):
    estado: Literal["activo", "rechazado", "inactivo", "pendiente"]
    motivo: str | None = Field(default=None, max_length=280)

    @model_validator(mode="after")
    def motivo_si_rechaza(self) -> "CambioEstadoNegocio":
        self.motivo = " ".join((self.motivo or "").split()) or None
        if self.estado == "rechazado" and not self.motivo:
            raise ValueError("Escribe el motivo del rechazo para que el dueño sepa qué corregir")
        return self


class InscritoEspera(BaseModel):
    id: UUID
    rol: RolEspera
    nombre: str
    whatsapp: str
    barrio_texto: str
    negocio_nombre: str | None
    negocio_tipo: str | None
    que_pediria: str | None
    contactado: bool
    created_at: datetime


class CambioInscrito(BaseModel):
    contactado: bool


class Reporte(BaseModel):
    id: UUID
    negocio_id: UUID
    negocio_slug: str
    negocio_nombre: str
    motivo: str
    detalle: str | None
    estado: EstadoReporte
    created_at: datetime


class CambioReporte(BaseModel):
    estado: EstadoReporte


class EntrevistaEntrada(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    persona: str = Field(min_length=1, max_length=80, description="Alias o primer nombre")
    barrio_texto: str | None = Field(default=None, max_length=60)
    confirma_intencion: bool
    notas: str | None = Field(default=None, max_length=1000)


class Entrevista(EntrevistaEntrada):
    id: UUID
    created_at: datetime


class PuntoSerie(BaseModel):
    etiqueta: str
    valor: int


class Criterio(BaseModel):
    id: int
    nombre: str
    meta: str
    valor: str
    progreso: float = Field(ge=0, le=1)
    estado: Semaforo
    detalle: str | None
    serie: list[PuntoSerie]


class Gate(BaseModel):
    criterios: list[Criterio]
    cumplidos: int
    listo: bool = Field(description="Se cumplen los 6 criterios a la vez")
    generado_at: datetime
