"""Contratos de la lista de espera y de los reportes de información incorrecta (SPEC §6.1, §6.3)."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.cuenta import CELULAR

RolEspera = Literal["vecino", "negocio", "mensajero"]
MotivoReporte = Literal["cerro", "horario", "ubicacion", "contacto", "otro"]


def _limpiar(v: str | None) -> str | None:
    if v is None:
        return None
    limpio = " ".join(v.split())
    return limpio or None


class ListaEsperaEntrada(BaseModel):
    rol: RolEspera
    nombre: str = Field(min_length=2, max_length=80)
    whatsapp: str = Field(pattern=CELULAR)
    barrio: str = Field(
        min_length=2, max_length=60, description="Slug de un barrio piloto o el nombre de otro"
    )
    negocio_nombre: str | None = Field(default=None, max_length=80)
    negocio_tipo: str | None = Field(default=None, max_length=60)
    que_pediria: str | None = Field(
        default=None, max_length=200, description="¿Qué le habrías pedido? (botón Pedir mandado)"
    )
    acepta_datos: Literal[True] = Field(
        description="Autorización de tratamiento de datos (Ley 1581)"
    )

    @field_validator("nombre", "barrio", "negocio_nombre", "negocio_tipo", "que_pediria")
    @classmethod
    def sin_espacios_extra(cls, v: str | None) -> str | None:
        return _limpiar(v)

    @model_validator(mode="after")
    def negocio_completo(self) -> "ListaEsperaEntrada":
        if self.rol == "negocio" and not (self.negocio_nombre and self.negocio_tipo):
            raise ValueError("Cuéntanos el nombre y el tipo de tu negocio")
        return self


class ListaEsperaRespuesta(BaseModel):
    nuevo: bool = Field(description="false si ese WhatsApp ya estaba inscrito con ese rol")


class Meta(BaseModel):
    valor: int
    meta: int


class Metas(BaseModel):
    negocios_activos: Meta
    vecinos_semana: Meta
    mensajeros_listos: Meta


class ReporteEntrada(BaseModel):
    motivo: MotivoReporte
    detalle: str | None = Field(default=None, max_length=500)

    @field_validator("detalle")
    @classmethod
    def sin_espacios_extra(cls, v: str | None) -> str | None:
        return _limpiar(v)
