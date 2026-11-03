"""Registro de eventos anónimos: fuente de verdad del tablero del gate (SPEC §9)."""

import json
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.ratelimit import limite

router = APIRouter(tags=["eventos"])

TipoEvento = Literal[
    "vista_perfil",
    "click_whatsapp",
    "click_pedir_mandado",
    "click_como_llegar",
    "busqueda",
    "sesion",
]


class EventoEntrada(BaseModel):
    tipo: TipoEvento
    anon_id: str = Field(
        min_length=8,
        max_length=64,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="Id aleatorio guardado en el navegador; sin datos personales",
    )
    negocio_id: UUID | None = None
    metadata: dict[str, str | int | float | bool | None] = Field(default_factory=dict)

    @field_validator("metadata")
    @classmethod
    def metadata_pequena(
        cls, v: dict[str, str | int | float | bool | None]
    ) -> dict[str, str | int | float | bool | None]:
        if len(v) > 10 or len(json.dumps(v)) > 1000:
            raise ValueError("metadata demasiado grande")
        return v


@router.post(
    "/eventos",
    status_code=204,
    response_class=Response,
    dependencies=[Depends(limite(120, 60))],
)
def registrar_evento(evento: EventoEntrada, db: Annotated[Session, Depends(get_db)]) -> None:
    # Un negocio_id que no existe se guarda como null en vez de fallar.
    db.execute(
        text(
            "insert into eventos (tipo, anon_id, negocio_id, metadata)"
            " values (:tipo, :anon_id, (select id from negocios where id = :negocio_id),"
            " cast(:metadata as jsonb))"
        ),
        {
            "tipo": evento.tipo,
            "anon_id": evento.anon_id,
            "negocio_id": evento.negocio_id,
            "metadata": json.dumps(evento.metadata),
        },
    )
    db.commit()
