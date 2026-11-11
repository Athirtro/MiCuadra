"""Contratos del panel de administración (SPEC §6.5) y del tablero del gate (SPEC §9)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.comunidad import RolEspera
from app.schemas.cuenta import CELULAR, NegocioBase
from app.schemas.directorio import BarrioCorto, CategoriaCorta, Punto

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


# ── Carga de negocios por el equipo (SPEC §6.5: visitas en persona y CSV) ──


class NegocioCargaEntrada(NegocioBase):
    """Negocio que carga el equipo: el WhatsApp va solo si el dueño dio permiso."""

    whatsapp: str | None = Field(default=None, pattern=CELULAR)
    estado: Literal["activo", "pendiente"] = "activo"


class FilaCsv(BaseModel):
    """Una fila de la plantilla, tal cual viene del archivo (todo texto)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    nombre: str = ""
    categoria: str = ""
    barrio: str = ""
    direccion: str = ""
    ubicacion: str = Field(default="", description="«lat, lng» o un enlace de Google Maps")
    whatsapp: str = ""
    telefono: str = ""
    descripcion: str = ""
    horario: str = Field(default="", description="Ej.: «lun-sab 7:00-19:00; dom 8:00-13:00»")


class LoteEntrada(BaseModel):
    filas: list[FilaCsv] = Field(min_length=1, max_length=300)
    estado: Literal["activo", "pendiente"] = "activo"
    simular: bool = Field(default=True, description="true = solo revisa, no crea nada")
    solo_listas: bool = Field(
        default=False,
        description="true = crea las filas listas aunque otras tengan errores (quedan para después)",
    )


class FilaValida(BaseModel):
    fila: int = Field(description="Número de fila en el archivo (la 1 es el encabezado)")
    nombre: str
    categoria: str
    barrio: str | None
    ubicacion: Punto
    whatsapp: str | None
    franjas: int = Field(description="Franjas de horario reconocidas")
    ubicacion_automatica: bool = Field(
        default=False, description="Se ubicó por la dirección: conviene revisar el pin"
    )
    metodo_ubicacion: Literal["google", "nomenclatura"] | None = Field(
        default=None,
        description="google = placa o cuadra; nomenclatura = aproximada por las calles",
    )
    detalle_ubicacion: str | None = Field(
        default=None, description="Cómo entendió Google la dirección o cómo se interpoló"
    )


class ErrorFila(BaseModel):
    fila: int
    nombre: str
    mensajes: list[str]


class LoteResultado(BaseModel):
    validas: list[FilaValida]
    errores: list[ErrorFila]
    creados: int = Field(description="0 si se simuló o si hubo errores: se crean todos o ninguno")
