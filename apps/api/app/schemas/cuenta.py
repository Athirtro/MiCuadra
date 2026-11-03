"""Contratos de la cuenta del usuario y del registro de negocios (SPEC §6.4, §6.6)."""

import re
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.auth import Rol
from app.schemas.directorio import BarrioCorto, Horario, Punto

CELULAR = r"^3\d{9}$"
_HORA = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class Perfil(BaseModel):
    id: UUID
    email: str | None
    nombre: str | None
    celular: str | None
    foto_url: str | None
    barrio: BarrioCorto | None
    roles: list[Rol]
    perfil_completo: bool = Field(description="Ya pasó por el formulario de bienvenida")


class PerfilEntrada(BaseModel):
    tipo: Literal["vecino", "dueno"] = Field(description="vecino = consumidor; dueno = empresario")
    nombre: str = Field(min_length=2, max_length=80)
    celular: str = Field(pattern=CELULAR, description="Celular colombiano de 10 dígitos (WhatsApp)")
    barrio: str | None = Field(
        default=None, max_length=40, description="Slug del barrio; null = otro"
    )
    acepta_datos: Literal[True] = Field(
        description="Autorización de tratamiento de datos (Ley 1581)"
    )

    @field_validator("nombre")
    @classmethod
    def sin_espacios_extra(cls, v: str) -> str:
        return " ".join(v.split())


class HorarioEntrada(Horario):
    @model_validator(mode="after")
    def horas_validas(self) -> "HorarioEntrada":
        if not (_HORA.match(self.abre) and _HORA.match(self.cierra)):
            raise ValueError("Las horas van en formato HH:MM (24 horas)")
        if self.abre == self.cierra:
            raise ValueError("La hora de abrir y la de cerrar no pueden ser iguales")
        return self


class NegocioEntrada(BaseModel):
    nombre: str = Field(min_length=2, max_length=80)
    categoria: str = Field(max_length=40, description="Slug de la categoría")
    whatsapp: str = Field(pattern=CELULAR)
    telefono: str | None = Field(default=None, max_length=20)
    descripcion: str | None = Field(default=None, max_length=280)
    direccion_texto: str = Field(min_length=3, max_length=120)
    ubicacion: Punto
    horarios: list[HorarioEntrada] = Field(default_factory=list, max_length=21)

    @field_validator("nombre", "direccion_texto")
    @classmethod
    def sin_espacios_extra(cls, v: str) -> str:
        return " ".join(v.split())

    @field_validator("ubicacion")
    @classmethod
    def en_pereira(cls, v: Punto) -> Punto:
        if not (4.6 <= v.lat <= 5.0 and -76.0 <= v.lng <= -75.5):
            raise ValueError("La ubicación debe estar en Pereira")
        return v


class MiNegocio(BaseModel):
    id: UUID
    slug: str
    nombre: str
    estado: Literal["borrador", "pendiente", "activo", "rechazado", "inactivo"]
    motivo_rechazo: str | None
    categoria: str
    barrio: BarrioCorto | None


class Foto(BaseModel):
    orden: int = Field(ge=0, le=4)
    url: str


class FotoEntrada(BaseModel):
    url: str = Field(
        max_length=300, description="URL pública del archivo ya subido a Supabase Storage"
    )
