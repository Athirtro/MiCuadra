"""Lista de espera y reportes de información incorrecta."""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.schemas.comunidad import ListaEsperaEntrada, ReporteEntrada


def inscribir(db: Session, datos: ListaEsperaEntrada) -> bool:
    """Guarda la inscripción. Si el WhatsApp ya estaba con ese rol, actualiza sus datos.

    Devuelve `True` si es una inscripción nueva."""
    barrio = (
        db.execute(
            text("select id, nombre from barrios where slug = :s or lower(nombre) = lower(:s)"),
            {"s": datos.barrio},
        )
        .mappings()
        .first()
    )
    nuevo = bool(
        db.execute(
            text(
                "insert into lista_espera (rol, nombre, whatsapp, barrio_texto, barrio_id,"
                " negocio_nombre, negocio_tipo, que_pediria, acepta_datos_at)"
                " values (:rol, :nombre, :whatsapp, :barrio_texto, :barrio_id,"
                " :negocio_nombre, :negocio_tipo, :que_pediria, now())"
                " on conflict (whatsapp, rol) do update set"
                " nombre = excluded.nombre, barrio_texto = excluded.barrio_texto,"
                " barrio_id = excluded.barrio_id,"
                " negocio_nombre = coalesce(excluded.negocio_nombre, lista_espera.negocio_nombre),"
                " negocio_tipo = coalesce(excluded.negocio_tipo, lista_espera.negocio_tipo),"
                " que_pediria = coalesce(excluded.que_pediria, lista_espera.que_pediria)"
                " returning (xmax = 0) as nuevo"
            ),
            {
                "rol": datos.rol,
                "nombre": datos.nombre,
                "whatsapp": datos.whatsapp,
                "barrio_texto": barrio["nombre"] if barrio else datos.barrio,
                "barrio_id": barrio["id"] if barrio else None,
                "negocio_nombre": datos.negocio_nombre if datos.rol == "negocio" else None,
                "negocio_tipo": datos.negocio_tipo if datos.rol == "negocio" else None,
                "que_pediria": datos.que_pediria,
            },
        ).scalar_one()
    )
    db.commit()
    return nuevo


def reportar(db: Session, negocio_id: UUID, datos: ReporteEntrada) -> None:
    existe = db.execute(
        text("select 1 from negocios where id = :id and estado = 'activo' and deleted_at is null"),
        {"id": negocio_id},
    ).first()
    if not existe:
        raise ApiError(404, "negocio_no_encontrado", "No encontramos ese negocio.")
    db.execute(
        text(
            "insert into incidencias (negocio_id, tipo, descripcion)"
            " values (:id, :tipo, :descripcion)"
        ),
        {"id": negocio_id, "tipo": datos.motivo, "descripcion": datos.detalle},
    )
    db.commit()
