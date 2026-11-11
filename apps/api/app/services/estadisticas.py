"""Estadísticas del negocio: vistas, contactos y apartados por día (hora de Bogotá)."""

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.estadisticas import Dia, Estadisticas, ProductoTop, Totales
from app.services.cuenta import _verificar_dueno
from app.services.horarios import ZONA_NEGOCIOS

_ZONA = "America/Bogota"


def _totales(db: Session, negocio_id: UUID, desde: datetime, hasta: datetime) -> Totales:
    p: dict[str, Any] = {"id": negocio_id, "desde": desde, "hasta": hasta}
    ev = (
        db.execute(
            text(
                "select count(*) filter (where tipo = 'vista_perfil') as vistas,"
                " count(distinct anon_id) filter (where tipo = 'vista_perfil') as vecinos,"
                " count(*) filter (where tipo = 'click_whatsapp') as whatsapp,"
                " count(*) filter (where tipo = 'click_como_llegar') as como_llegar"
                " from eventos where negocio_id = :id and created_at >= :desde"
                " and created_at < :hasta"
            ),
            p,
        )
        .mappings()
        .one()
    )
    ap = (
        db.execute(
            text(
                "select count(*) filter (where estado <> 'cancelado') as apartados,"
                " coalesce(sum(total) filter (where estado = 'entregado'), 0) as vendido"
                " from apartados where negocio_id = :id and created_at >= :desde"
                " and created_at < :hasta"
            ),
            p,
        )
        .mappings()
        .one()
    )
    return Totales(**ev, apartados=ap["apartados"], vendido=ap["vendido"])


def estadisticas_negocio(
    db: Session, negocio_id: UUID, usuario_id: UUID, es_admin: bool, ahora: datetime, dias: int
) -> Estadisticas:
    _verificar_dueno(db, negocio_id, usuario_id, es_admin)
    hoy = ahora.astimezone(ZONA_NEGOCIOS).date()
    primer_dia = hoy - timedelta(days=dias - 1)
    desde = datetime.combine(primer_dia, datetime.min.time(), ZONA_NEGOCIOS)
    hasta = datetime.combine(hoy + timedelta(days=1), datetime.min.time(), ZONA_NEGOCIOS)

    p: dict[str, Any] = {"id": negocio_id, "desde": desde, "hasta": hasta, "zona": _ZONA}
    conteos: dict[Any, dict[str, int]] = {}
    for f in db.execute(
        text(
            "select (created_at at time zone :zona)::date as dia,"
            " count(*) filter (where tipo = 'vista_perfil') as vistas,"
            " count(*) filter (where tipo in ('click_whatsapp', 'click_como_llegar')) as contactos"
            " from eventos where negocio_id = :id and created_at >= :desde"
            " and created_at < :hasta group by 1"
        ),
        p,
    ).mappings():
        conteos[f["dia"]] = {"vistas": f["vistas"], "contactos": f["contactos"]}
    for f in db.execute(
        text(
            "select (created_at at time zone :zona)::date as dia, count(*) as n from apartados"
            " where negocio_id = :id and estado <> 'cancelado' and created_at >= :desde"
            " and created_at < :hasta group by 1"
        ),
        p,
    ).mappings():
        conteos.setdefault(f["dia"], {})["apartados"] = f["n"]

    por_dia = []
    for k in range(dias):
        fecha = primer_dia + timedelta(days=k)
        c = conteos.get(fecha, {})
        por_dia.append(
            Dia(
                fecha=fecha,
                vistas=c.get("vistas", 0),
                contactos=c.get("contactos", 0),
                apartados=c.get("apartados", 0),
            )
        )

    top = db.execute(
        text(
            "select ai.nombre, sum(ai.cantidad)::int as unidades from apartado_items ai"
            " join apartados a on a.id = ai.apartado_id"
            " where a.negocio_id = :id and a.estado <> 'cancelado' and a.created_at >= :desde"
            " and a.created_at < :hasta group by ai.nombre order by unidades desc, ai.nombre"
            " limit 5"
        ),
        p,
    ).mappings()

    return Estadisticas(
        dias=dias,
        totales=_totales(db, negocio_id, desde, hasta),
        anteriores=_totales(db, negocio_id, desde - timedelta(days=dias), desde),
        por_dia=por_dia,
        mas_apartados=[ProductoTop(**dict(f)) for f in top],
    )
