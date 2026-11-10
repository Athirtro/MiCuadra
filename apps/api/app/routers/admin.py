"""Panel de administración (SPEC §6.5). Solo rol `admin`."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.auth import UsuarioActual, requiere_rol
from app.db import get_db
from app.schemas.admin import (
    CambioEstadoNegocio,
    CambioInscrito,
    CambioReporte,
    Entrevista,
    EntrevistaEntrada,
    EstadoNegocio,
    EstadoReporte,
    Gate,
    InscritoEspera,
    LoteEntrada,
    LoteResultado,
    NegocioAdmin,
    NegocioCargaEntrada,
    Reporte,
)
from app.schemas.comunidad import RolEspera
from app.services import admin, carga, get_notification_service, metricas
from app.services.horarios import ahora_utc
from app.services.notificaciones import NotificationService

router = APIRouter(prefix="/admin", tags=["admin"])

Admin = Annotated[UsuarioActual, Depends(requiere_rol("admin"))]
Db = Annotated[Session, Depends(get_db)]


@router.post("/negocios", response_model=NegocioAdmin, status_code=201)
def crear_negocio(datos: NegocioCargaEntrada, _: Admin, db: Db) -> NegocioAdmin:
    """El equipo carga un negocio que visitó (sin dueño todavía; el dueño lo reclama después)."""
    return carga.crear_negocio(db, datos)


@router.post("/negocios/lote", response_model=LoteResultado)
def cargar_lote(lote: LoteEntrada, _: Admin, db: Db) -> LoteResultado:
    """Carga por CSV. Con `simular` solo revisa; si alguna fila tiene errores no se crea ninguna."""
    return carga.cargar_lote(db, lote)


@router.get("/negocios", response_model=list[NegocioAdmin])
def negocios(
    _: Admin,
    db: Db,
    estado: EstadoNegocio | None = None,
    barrio: Annotated[str | None, Query(max_length=40)] = None,
    categoria: Annotated[str | None, Query(max_length=40)] = None,
    q: Annotated[str | None, Query(max_length=80)] = None,
) -> list[NegocioAdmin]:
    """Negocios con filtros. Los pendientes salen primero (cola de aprobación)."""
    return admin.listar_negocios(db, estado, barrio, categoria, q.strip() if q else None)


@router.post("/negocios/{negocio_id}/estado", response_model=NegocioAdmin)
def cambiar_estado_negocio(
    negocio_id: UUID,
    cambio: CambioEstadoNegocio,
    _: Admin,
    db: Db,
    notificaciones: Annotated[NotificationService, Depends(get_notification_service)],
) -> NegocioAdmin:
    """Aprobar (`activo`), rechazar con motivo, desactivar o devolver a `pendiente`."""
    return admin.cambiar_estado_negocio(db, negocio_id, cambio, notificaciones)


@router.get("/lista-espera", response_model=list[InscritoEspera])
def lista_espera(
    _: Admin, db: Db, rol: RolEspera | None = None, contactado: bool | None = None
) -> list[InscritoEspera]:
    return admin.listar_espera(db, rol, contactado)


@router.get(
    "/lista-espera.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}}},
)
def lista_espera_csv(
    _: Admin, db: Db, rol: RolEspera | None = None, contactado: bool | None = None
) -> Response:
    return Response(
        admin.lista_espera_csv(db, rol, contactado),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="lista-espera.csv"'},
    )


@router.patch("/lista-espera/{inscrito_id}", status_code=204, response_class=Response)
def marcar_contactado(inscrito_id: UUID, cambio: CambioInscrito, _: Admin, db: Db) -> None:
    admin.marcar_contactado(db, inscrito_id, cambio.contactado)


@router.get("/reportes", response_model=list[Reporte])
def reportes(_: Admin, db: Db, estado: EstadoReporte | None = None) -> list[Reporte]:
    return admin.listar_reportes(db, estado)


@router.patch("/reportes/{reporte_id}", status_code=204, response_class=Response)
def cambiar_estado_reporte(reporte_id: UUID, cambio: CambioReporte, usuario: Admin, db: Db) -> None:
    admin.cambiar_estado_reporte(db, reporte_id, cambio.estado, usuario.id)


@router.get("/entrevistas", response_model=list[Entrevista])
def entrevistas(_: Admin, db: Db) -> list[Entrevista]:
    return admin.listar_entrevistas(db)


@router.post("/entrevistas", response_model=Entrevista, status_code=201)
def registrar_entrevista(datos: EntrevistaEntrada, usuario: Admin, db: Db) -> Entrevista:
    """Criterio 4 del gate: entrevista hecha en persona por el equipo."""
    return admin.registrar_entrevista(db, datos, usuario.id)


@router.get("/metricas", response_model=Gate)
def tablero_gate(_: Admin, db: Db, ahora: Annotated[datetime, Depends(ahora_utc)]) -> Gate:
    """Los 6 criterios del gate con valor actual, meta y semáforo (SPEC §9)."""
    return metricas.calcular_gate(db, ahora)
