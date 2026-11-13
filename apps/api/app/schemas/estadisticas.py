"""Estadísticas del negocio para su dueño (SPEC §6.4)."""

from datetime import date

from pydantic import BaseModel, Field


class Totales(BaseModel):
    vistas: int = Field(description="Veces que abrieron la ficha")
    vecinos: int = Field(description="Personas distintas que abrieron la ficha")
    whatsapp: int = Field(description="Toques en «WhatsApp»")
    como_llegar: int = Field(description="Toques en «Cómo llegar» (ficha o mapa)")
    apartados: int = Field(description="Apartados recibidos (sin contar cancelados)")
    vendido: int = Field(description="Pesos COP de los apartados entregados")


class Dia(BaseModel):
    fecha: date
    vistas: int
    contactos: int = Field(description="WhatsApp + Cómo llegar")
    apartados: int


class ProductoTop(BaseModel):
    nombre: str
    unidades: int


class Estadisticas(BaseModel):
    dias: int
    totales: Totales
    anteriores: Totales = Field(
        description="Los mismos números del periodo anterior, para comparar"
    )
    por_dia: list[Dia] = Field(
        description="Un día por fila, del más viejo al de hoy (hora de Bogotá)"
    )
    mas_apartados: list[ProductoTop] = Field(description="Hasta 5 productos con más unidades")
