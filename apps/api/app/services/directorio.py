"""Servicio del directorio. No importa nada de mandados salvo la interfaz `MandadoService`."""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


def negocio_activo_existe(db: Session, negocio_id: UUID) -> bool:
    existe = db.execute(
        text(
            "select exists(select 1 from negocios"
            " where id = :id and estado = 'activo' and deleted_at is null)"
        ),
        {"id": negocio_id},
    ).scalar_one()
    return bool(existe)
