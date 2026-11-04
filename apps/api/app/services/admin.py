"""Panel de administración: aprobación de negocios, lista de espera, reportes y entrevistas."""

import csv
import io
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import RowMapping
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.schemas.admin import (
    CambioEstadoNegocio,
    DuenoCorto,
    Entrevista,
    EntrevistaEntrada,
    EstadoNegocio,
    EstadoReporte,
    InscritoEspera,
    NegocioAdmin,
    Reporte,
)
from app.schemas.comunidad import RolEspera
from app.schemas.directorio import BarrioCorto, CategoriaCorta
from app.services.notificaciones import NotificationService

_NEGOCIOS = (
    "select n.id, n.slug, n.nombre, n.estado, n.motivo_rechazo, n.whatsapp, n.direccion_texto,"
    " n.descripcion, n.creado_por_admin, n.created_at,"
    " c.slug as cat_slug, c.nombre as cat_nombre, c.icono as cat_icono, c.color as cat_color,"
    " b.slug as barrio_slug, b.nombre as barrio_nombre,"
    " u.id as dueno_id, u.nombre as dueno_nombre, u.email as dueno_email,"
    " u.celular as dueno_celular,"
    " (select count(*) from incidencias i"
    "   where i.negocio_id = n.id and i.estado = 'abierta') as reportes_abiertos"
    " from negocios n join categorias c on c.id = n.categoria_id"
    " left join barrios b on b.id = n.barrio_id"
    " left join usuarios u on u.id = n.dueno_id"
    " where n.deleted_at is null"
)


def _negocio(f: RowMapping) -> NegocioAdmin:
    return NegocioAdmin(
        id=f["id"],
        slug=f["slug"],
        nombre=f["nombre"],
        estado=f["estado"],
        motivo_rechazo=f["motivo_rechazo"],
        categoria=CategoriaCorta(
            slug=f["cat_slug"], nombre=f["cat_nombre"], icono=f["cat_icono"], color=f["cat_color"]
        ),
        barrio=BarrioCorto(slug=f["barrio_slug"], nombre=f["barrio_nombre"])
        if f["barrio_slug"]
        else None,
        whatsapp=f["whatsapp"],
        direccion_texto=f["direccion_texto"],
        descripcion=f["descripcion"],
        dueno=DuenoCorto(
            nombre=f["dueno_nombre"], email=f["dueno_email"], celular=f["dueno_celular"]
        )
        if f["dueno_id"]
        else None,
        creado_por_admin=f["creado_por_admin"],
        reportes_abiertos=f["reportes_abiertos"],
        created_at=f["created_at"],
    )


def listar_negocios(
    db: Session,
    estado: EstadoNegocio | None,
    barrio: str | None,
    categoria: str | None,
    q: str | None,
) -> list[NegocioAdmin]:
    filtros: list[str] = []
    params: dict[str, object] = {}
    if estado:
        filtros.append("n.estado = :estado")
        params["estado"] = estado
    if barrio:
        filtros.append("b.slug = :barrio")
        params["barrio"] = barrio
    if categoria:
        filtros.append("c.slug = :categoria")
        params["categoria"] = categoria
    if q:
        filtros.append("normalizar(n.nombre) like '%' || normalizar(:q) || '%'")
        params["q"] = q
    sql = _NEGOCIOS + "".join(f" and {f}" for f in filtros)
    # Los pendientes más viejos primero: es la cola de aprobación.
    sql += " order by (n.estado = 'pendiente') desc, n.created_at asc limit 500"
    return [_negocio(f) for f in db.execute(text(sql), params).mappings().all()]


def cambiar_estado_negocio(
    db: Session,
    negocio_id: UUID,
    cambio: CambioEstadoNegocio,
    notificaciones: NotificationService,
) -> NegocioAdmin:
    antes = (
        db.execute(
            text("select estado, dueno_id from negocios where id = :id and deleted_at is null"),
            {"id": negocio_id},
        )
        .mappings()
        .one_or_none()
    )
    if antes is None:
        raise ApiError(404, "negocio_no_encontrado", "No encontramos ese negocio.")
    db.execute(
        text("update negocios set estado = :estado, motivo_rechazo = :motivo where id = :id"),
        {
            "id": negocio_id,
            "estado": cambio.estado,
            "motivo": cambio.motivo if cambio.estado == "rechazado" else None,
        },
    )
    db.commit()
    if cambio.estado == "activo" and antes["estado"] == "pendiente" and antes["dueno_id"]:
        notificaciones.send(antes["dueno_id"], "negocio_aprobado")
    fila = db.execute(text(_NEGOCIOS + " and n.id = :id"), {"id": negocio_id}).mappings().one()
    return _negocio(fila)


def listar_espera(
    db: Session, rol: RolEspera | None, contactado: bool | None
) -> list[InscritoEspera]:
    filtros: list[str] = []
    params: dict[str, object] = {}
    if rol:
        filtros.append("rol = :rol")
        params["rol"] = rol
    if contactado is not None:
        filtros.append("contactado = :contactado")
        params["contactado"] = contactado
    where = (" where " + " and ".join(filtros)) if filtros else ""
    filas = db.execute(
        text(
            "select id, rol, nombre, whatsapp, barrio_texto, negocio_nombre, negocio_tipo,"
            f" que_pediria, contactado, created_at from lista_espera{where}"
            " order by created_at desc"
        ),
        params,
    ).mappings()
    return [InscritoEspera.model_validate(dict(f)) for f in filas]


def lista_espera_csv(db: Session, rol: RolEspera | None, contactado: bool | None) -> str:
    salida = io.StringIO()
    escritor = csv.writer(salida)
    campos = list(InscritoEspera.model_fields)
    escritor.writerow(campos)
    for i in listar_espera(db, rol, contactado):
        fila = i.model_dump()
        escritor.writerow(
            [
                "sí" if v is True else "no" if v is False else "" if v is None else v
                for v in (fila[c] for c in campos)
            ]
        )
    # BOM para que Excel abra bien las tildes.
    return "\ufeff" + salida.getvalue()


def marcar_contactado(db: Session, inscrito_id: UUID, contactado: bool) -> None:
    filas = db.execute(
        text("update lista_espera set contactado = :c where id = :id returning id"),
        {"id": inscrito_id, "c": contactado},
    ).first()
    if not filas:
        raise ApiError(404, "no_encontrado", "No encontramos esa inscripción.")
    db.commit()


def listar_reportes(db: Session, estado: EstadoReporte | None) -> list[Reporte]:
    filas = db.execute(
        text(
            "select i.id, i.negocio_id, n.slug as negocio_slug, n.nombre as negocio_nombre,"
            " i.tipo as motivo, i.descripcion as detalle, i.estado, i.created_at"
            " from incidencias i join negocios n on n.id = i.negocio_id"
            " where i.mandado_id is null and (cast(:estado as text) is null or i.estado = :estado)"
            " order by i.created_at desc limit 500"
        ),
        {"estado": estado},
    ).mappings()
    return [Reporte.model_validate(dict(f)) for f in filas]


def cambiar_estado_reporte(
    db: Session, reporte_id: UUID, estado: EstadoReporte, admin_id: UUID
) -> None:
    filas = db.execute(
        text(
            "update incidencias set estado = :estado,"
            " resuelta_por = case when cast(:estado as text) = 'abierta' then null else cast(:admin as uuid) end"
            " where id = :id and mandado_id is null returning id"
        ),
        {"id": reporte_id, "estado": estado, "admin": admin_id},
    ).first()
    if not filas:
        raise ApiError(404, "no_encontrado", "No encontramos ese reporte.")
    db.commit()


def listar_entrevistas(db: Session) -> list[Entrevista]:
    filas = db.execute(
        text(
            "select id, persona, barrio_texto, confirma_intencion, notas, created_at"
            " from entrevistas order by created_at desc"
        )
    ).mappings()
    return [Entrevista.model_validate(dict(f)) for f in filas]


def registrar_entrevista(db: Session, datos: EntrevistaEntrada, admin_id: UUID) -> Entrevista:
    fila = (
        db.execute(
            text(
                "insert into entrevistas (persona, barrio_texto, confirma_intencion, notas,"
                " registrada_por) values (:persona, :barrio, :confirma, :notas, :admin)"
                " returning id, persona, barrio_texto, confirma_intencion, notas, created_at"
            ),
            {
                "persona": datos.persona,
                "barrio": datos.barrio_texto or None,
                "confirma": datos.confirma_intencion,
                "notas": datos.notas or None,
                "admin": admin_id,
            },
        )
        .mappings()
        .one()
    )
    db.commit()
    return Entrevista.model_validate(dict(fila))
