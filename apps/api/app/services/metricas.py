"""Tablero del gate (SPEC §9) y metas visibles de la landing (SPEC §6.1).

Las semanas van de lunes a domingo en hora de Bogotá. Los negocios [DEMO] no cuentan: el gate
debe medir datos reales."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.admin import Criterio, Gate, PuntoSerie, Semaforo
from app.schemas.comunidad import Meta, Metas

ZONA = ZoneInfo("America/Bogota")
NO_DEMO = "nombre not like '[DEMO]%'"
SEMANA = "date_trunc('week', created_at at time zone 'America/Bogota')"

META_SESIONES = 200
SEMANAS_SEGUIDAS = 3
META_RETENCION = 0.25
META_CLICS = 40
DIAS_CLICS = 14
META_ENTREVISTAS = 10
META_MENSAJEROS = 15
META_NEGOCIOS = 40
META_CATEGORIAS = 3


def lunes_local(ahora: datetime) -> datetime:
    """Inicio (sin zona) de la semana en curso en Bogotá, igual que `date_trunc('week', ...)`."""
    local = ahora.astimezone(ZONA).replace(tzinfo=None)
    return (local - timedelta(days=local.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )


def _semaforo(cumple: bool, progreso: float) -> Semaforo:
    if cumple:
        return "verde"
    return "amarillo" if progreso >= 0.5 else "rojo"


def _criterio(
    id: int,
    nombre: str,
    meta: str,
    valor: str,
    progreso: float,
    cumple: bool,
    detalle: str | None = None,
    serie: list[PuntoSerie] | None = None,
) -> Criterio:
    progreso = max(0.0, min(progreso, 1.0))
    return Criterio(
        id=id,
        nombre=nombre,
        meta=meta,
        valor=valor,
        progreso=round(progreso, 3),
        estado=_semaforo(cumple, progreso),
        detalle=detalle,
        serie=serie or [],
    )


def _etiqueta(semana: datetime) -> str:
    return semana.strftime("%d/%m")


def _negocios_activos(db: Session) -> tuple[int, int, int]:
    """(activos reales, categorías distintas, activos demo)."""
    fila = db.execute(
        text(
            f"select count(*) filter (where {NO_DEMO}),"
            f" count(distinct categoria_id) filter (where {NO_DEMO}),"
            f" count(*) filter (where not ({NO_DEMO}))"
            " from negocios where estado = 'activo' and deleted_at is null"
        )
    ).one()
    return int(fila[0]), int(fila[1]), int(fila[2])


def _mensajeros_en_espera(db: Session) -> int:
    return int(
        db.execute(text("select count(*) from lista_espera where rol = 'mensajero'")).scalar_one()
    )


def metas(db: Session, ahora: datetime) -> Metas:
    activos, _, _ = _negocios_activos(db)
    vecinos = db.execute(
        text(
            "select count(distinct anon_id) from eventos"
            " where tipo = 'sesion' and created_at >= :desde"
        ),
        {"desde": ahora - timedelta(days=7)},
    ).scalar_one()
    return Metas(
        negocios_activos=Meta(valor=activos, meta=META_NEGOCIOS),
        vecinos_semana=Meta(valor=int(vecinos), meta=META_SESIONES),
        mensajeros_listos=Meta(valor=_mensajeros_en_espera(db), meta=META_MENSAJEROS),
    )


def _adopcion(db: Session, lunes: datetime) -> Criterio:
    desde = lunes - timedelta(weeks=5)
    conteos: dict[datetime, int] = dict(
        db.execute(
            text(
                f"select {SEMANA} as semana, count(distinct anon_id) from eventos"
                f" where tipo = 'sesion' and created_at >= (:desde at time zone 'America/Bogota')"
                " group by 1"
            ),
            {"desde": desde},
        ).all()
    )
    semanas = [desde + timedelta(weeks=i) for i in range(6)]
    serie = [
        PuntoSerie(
            etiqueta="Esta semana" if s == lunes else _etiqueta(s), valor=int(conteos.get(s, 0))
        )
        for s in semanas
    ]
    completas = [p.valor for p in serie[-1 - SEMANAS_SEGUIDAS : -1]]
    return _criterio(
        1,
        "Adopción",
        f"≥ {META_SESIONES} sesiones únicas por semana, {SEMANAS_SEGUIDAS} semanas seguidas",
        f"{completas[-1]} la semana pasada",
        min(completas) / META_SESIONES,
        all(v >= META_SESIONES for v in completas),
        "Cuenta visitantes distintos (anon_id) con evento de sesión.",
        serie,
    )


def _retencion(db: Session, lunes: datetime) -> Criterio:
    # Una cohorte se puede medir cuando su semana siguiente ya terminó.
    limite = lunes - timedelta(weeks=1)
    filas = db.execute(
        text(
            "with primera as ("
            f"  select anon_id, min({SEMANA}) as cohorte from eventos"
            "   where tipo = 'sesion' group by anon_id),"
            " semanas as ("
            f"  select distinct anon_id, {SEMANA} as semana from eventos where tipo = 'sesion')"
            " select p.cohorte, count(*) as total, count(s.anon_id) as volvieron"
            " from primera p left join semanas s"
            "   on s.anon_id = p.anon_id and s.semana = p.cohorte + interval '7 days'"
            " where p.cohorte >= :desde and p.cohorte < :limite"
            " group by p.cohorte order by p.cohorte"
        ),
        {"desde": limite - timedelta(weeks=4), "limite": limite},
    ).all()
    serie = [
        PuntoSerie(etiqueta=_etiqueta(c), valor=round(100 * v / t) if t else 0) for c, t, v in filas
    ]
    if not filas:
        return _criterio(
            2,
            "Retención",
            f"≥ {round(META_RETENCION * 100)} % vuelve la semana siguiente a su primera visita",
            "Sin datos todavía",
            0,
            False,
            "Se mide cuando termina la semana siguiente a la primera visita.",
        )
    _, total, volvieron = filas[-1]
    tasa = volvieron / total if total else 0
    return _criterio(
        2,
        "Retención",
        f"≥ {round(META_RETENCION * 100)} % vuelve la semana siguiente a su primera visita",
        f"{round(tasa * 100)} % ({volvieron} de {total})",
        tasa / META_RETENCION,
        tasa >= META_RETENCION,
        "Última cohorte semanal completa. La serie muestra el % de cada cohorte.",
        serie,
    )


def calcular_gate(db: Session, ahora: datetime) -> Gate:
    lunes = lunes_local(ahora)

    clics = int(
        db.execute(
            text(
                "select count(*) from eventos"
                " where tipo = 'click_pedir_mandado' and created_at >= :desde"
            ),
            {"desde": ahora - timedelta(days=DIAS_CLICS)},
        ).scalar_one()
    )
    entrevistas = db.execute(
        text("select count(*) filter (where confirma_intencion), count(*) from entrevistas")
    ).one()
    confirman, total_entrevistas = int(entrevistas[0]), int(entrevistas[1])
    mensajeros = _mensajeros_en_espera(db)
    activos, categorias, demo = _negocios_activos(db)

    criterios = [
        _adopcion(db, lunes),
        _retencion(db, lunes),
        _criterio(
            3,
            "Demanda de mandados",
            f"≥ {META_CLICS} clics en «Pedir mandado» en {DIAS_CLICS} días",
            f"{clics} clics",
            clics / META_CLICS,
            clics >= META_CLICS,
            f"Últimos {DIAS_CLICS} días.",
        ),
        _criterio(
            4,
            "Validación cualitativa",
            f"≥ {META_ENTREVISTAS} entrevistas confirmando intención",
            f"{confirman} confirman",
            confirman / META_ENTREVISTAS,
            confirman >= META_ENTREVISTAS,
            f"{total_entrevistas} entrevistas registradas en total.",
        ),
        _criterio(
            5,
            "Oferta",
            f"≥ {META_MENSAJEROS} mensajeros en lista de espera",
            f"{mensajeros} mensajeros",
            mensajeros / META_MENSAJEROS,
            mensajeros >= META_MENSAJEROS,
        ),
        _criterio(
            6,
            "Cobertura",
            f"≥ {META_NEGOCIOS} negocios activos de ≥ {META_CATEGORIAS} categorías",
            f"{activos} negocios · {categorias} categorías",
            min(activos / META_NEGOCIOS, categorias / META_CATEGORIAS),
            activos >= META_NEGOCIOS and categorias >= META_CATEGORIAS,
            f"No cuenta los {demo} negocios [DEMO]." if demo else None,
        ),
    ]
    cumplidos = sum(c.estado == "verde" for c in criterios)
    return Gate(
        criterios=criterios,
        cumplidos=cumplidos,
        listo=cumplidos == len(criterios),
        generado_at=ahora,
    )
