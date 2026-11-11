"""Servicio del directorio. No importa nada de mandados salvo la interfaz `MandadoService`."""

from collections import defaultdict
from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import RowMapping, bindparam, text
from sqlalchemy.orm import Session

from app.schemas.directorio import (
    Barrio,
    BarrioCorto,
    Categoria,
    CategoriaCorta,
    Horario,
    ListaNegocios,
    NegocioDetalle,
    NegocioResumen,
    ProductoEncontrado,
    Punto,
)
from app.services.horarios import ZONA_NEGOCIOS, Franja, esta_abierto
from app.services.mandados import MandadoService

# Tope de candidatos dentro del radio: en 1 km de un barrio de Pereira hay decenas, no miles.
MAX_CANDIDATOS = 500

_COLUMNAS = """
  n.id, n.slug, n.nombre, n.descripcion, n.direccion_texto, n.whatsapp, n.telefono,
  n.cerrado_hoy_fecha, coalesce(n.destacado_hasta > now(), false) as destacado,
  st_y(n.ubicacion::geometry) as lat, st_x(n.ubicacion::geometry) as lng,
  c.slug as cat_slug, c.nombre as cat_nombre, c.icono as cat_icono, c.color as cat_color,
  b.slug as barrio_slug, b.nombre as barrio_nombre
"""
_DESDE = """
  from negocios n
  join categorias c on c.id = n.categoria_id
  left join barrios b on b.id = n.barrio_id
"""
_ACTIVO = "n.estado = 'activo' and n.deleted_at is null"
MAX_PRODUCTOS = 3  # productos que se muestran por tienda al buscar
_TEXTO_NEGOCIO = "n.nombre || ' ' || coalesce(n.descripcion, '') || ' ' || c.nombre"
_TEXTO_ITEM = "i.nombre || ' ' || coalesce(i.descripcion, '')"


def _coincide(columna: str, i: int) -> str:
    return f"normalizar({columna}) like '%' || normalizar(:q{i}) || '%'"


def _productos_que_coinciden(
    db: Session, ids: list[UUID], palabras: list[str]
) -> dict[UUID, list[ProductoEncontrado]]:
    """Por tienda, los productos visibles que tienen todas las palabras (ofertas y baratos primero)."""
    if not ids or not palabras:
        return {}
    condiciones = " and ".join(_coincide(_TEXTO_ITEM, k) for k in range(len(palabras)))
    filas = db.execute(
        text(
            "select negocio_id, nombre, precio, precio_oferta from ("
            " select i.negocio_id, i.nombre, i.precio, i.precio_oferta, row_number() over ("
            "  partition by i.negocio_id order by i.precio_oferta is null,"
            "  coalesce(i.precio_oferta, i.precio) nulls last, i.nombre) as puesto"
            f" from catalogo_items i where i.visible and i.negocio_id in :ids and {condiciones}"
            ") t where puesto <= :max"
        ).bindparams(bindparam("ids", expanding=True)),
        {"ids": ids, "max": MAX_PRODUCTOS, **{f"q{k}": p for k, p in enumerate(palabras)}},
    ).mappings()
    productos: dict[UUID, list[ProductoEncontrado]] = defaultdict(list)
    for f in filas:
        productos[f["negocio_id"]].append(
            ProductoEncontrado(
                nombre=f["nombre"], precio=f["precio"], precio_oferta=f["precio_oferta"]
            )
        )
    return productos


def negocio_activo_existe(db: Session, negocio_id: UUID) -> bool:
    existe = db.execute(
        text(f"select exists(select 1 from negocios n where n.id = :id and {_ACTIVO})"),
        {"id": negocio_id},
    ).scalar_one()
    return bool(existe)


def listar_categorias(db: Session) -> list[Categoria]:
    filas = db.execute(
        text(
            "select id, slug, nombre, icono, color, orden from categorias where activa order by orden"
        )
    ).mappings()
    return [Categoria.model_validate(dict(f)) for f in filas]


def listar_barrios(db: Session) -> list[Barrio]:
    """Barrios que ya tienen negocios en el mapa, del más poblado al menos.

    La lista crece sola: cada negocio aprobado suma su barrio. El centro es el promedio de
    sus negocios, así el mapa abre donde de verdad están las tiendas.
    """
    filas = db.execute(
        text(
            "select b.id, b.slug, b.nombre, b.es_piloto, count(*) as negocios,"
            " avg(st_y(n.ubicacion::geometry)) as lat, avg(st_x(n.ubicacion::geometry)) as lng"
            " from barrios b"
            " join negocios n on n.barrio_id = b.id"
            "  and n.estado = 'activo' and n.deleted_at is null"
            " group by b.id order by negocios desc, b.nombre"
        )
    ).mappings()
    return [
        Barrio(
            id=f["id"],
            slug=f["slug"],
            nombre=f["nombre"],
            es_piloto=f["es_piloto"],
            negocios=f["negocios"],
            centroide=Punto(lat=f["lat"], lng=f["lng"]),
        )
        for f in filas
    ]


def _franjas_por_negocio(db: Session, ids: list[UUID]) -> dict[UUID, list[Franja]]:
    if not ids:
        return {}
    filas = db.execute(
        text(
            "select negocio_id, dia_semana, abre, cierra from negocio_horarios"
            " where negocio_id in :ids order by dia_semana, abre"
        ).bindparams(bindparam("ids", expanding=True)),
        {"ids": ids},
    ).all()
    franjas: dict[UUID, list[Franja]] = defaultdict(list)
    for negocio_id, dia, abre, cierra in filas:
        franjas[negocio_id].append(Franja(dia, abre, cierra))
    return franjas


def _categoria(f: RowMapping) -> CategoriaCorta:
    return CategoriaCorta(
        slug=f["cat_slug"], nombre=f["cat_nombre"], icono=f["cat_icono"], color=f["cat_color"]
    )


def _barrio(f: RowMapping) -> BarrioCorto | None:
    if f["barrio_slug"] is None:
        return None
    return BarrioCorto(slug=f["barrio_slug"], nombre=f["barrio_nombre"])


def buscar_negocios(
    db: Session,
    *,
    lat: float,
    lng: float,
    radio_m: int,
    ahora: datetime,
    categoria: str | None = None,
    q: str | None = None,
    abierto_ahora: bool = False,
    con_ofertas: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> ListaNegocios:
    """Negocios activos dentro del radio, destacados primero y luego por distancia.

    "Abierto ahora" se calcula en Python (misma función que prueban los tests de horarios),
    por eso se filtra y pagina después de traer los candidatos del radio.
    """
    filtros = [_ACTIVO, "st_dwithin(n.ubicacion, p.g, :radio)"]
    params: dict[str, Any] = {"lat": lat, "lng": lng, "radio": radio_m, "max": MAX_CANDIDATOS}
    if categoria:
        filtros.append("c.slug = :categoria")
        params["categoria"] = categoria
    if con_ofertas:
        filtros.append("o.ofertas > 0")
    palabras = (q or "").split()[:5]
    for i, palabra in enumerate(palabras):
        # Cada palabra debe aparecer en nombre, descripción o categoría (sin tildes),
        # parecerse al nombre (errores de tipeo: "panaderia" ≈ "panadria")
        # o estar en algún producto visible del catálogo ("cemento", "acetaminofén").
        filtros.append(
            f"({_coincide(_TEXTO_NEGOCIO, i)}"
            f" or word_similarity(normalizar(:q{i}), normalizar(n.nombre)) >= 0.5"
            " or exists (select 1 from catalogo_items i where i.negocio_id = n.id and i.visible"
            f" and {_coincide(_TEXTO_ITEM, i)}))"
        )
        params[f"q{i}"] = palabra

    filas = (
        db.execute(
            text(
                f"select {_COLUMNAS}, round(st_distance(n.ubicacion, p.g))::int as distancia_m,"
                " (select url from negocio_fotos f where f.negocio_id = n.id"
                "  order by f.orden limit 1) as foto_url, o.ofertas"
                f" {_DESDE} cross join (select st_point(:lng, :lat, 4326)::geography as g) p"
                " cross join lateral (select count(*)::int as ofertas from catalogo_items i"
                "  where i.negocio_id = n.id and i.visible and i.precio_oferta is not null) o"
                f" where {' and '.join(filtros)}"
                " order by destacado desc, distancia_m, n.nombre limit :max"
            ),
            params,
        )
        .mappings()
        .all()
    )

    franjas = _franjas_por_negocio(db, [f["id"] for f in filas])
    productos = _productos_que_coinciden(db, [f["id"] for f in filas], palabras)
    items = []
    for f in filas:
        abierto = esta_abierto(franjas.get(f["id"], []), ahora, f["cerrado_hoy_fecha"])
        if abierto_ahora and not abierto:
            continue
        items.append(
            NegocioResumen(
                id=f["id"],
                slug=f["slug"],
                nombre=f["nombre"],
                descripcion=f["descripcion"],
                categoria=_categoria(f),
                barrio=_barrio(f),
                ubicacion=Punto(lat=f["lat"], lng=f["lng"]),
                distancia_m=f["distancia_m"],
                abierto_ahora=abierto,
                destacado=f["destacado"],
                foto_url=f["foto_url"],
                ofertas=f["ofertas"],
                productos=productos.get(f["id"], []),
            )
        )

    pagina = items[offset : offset + limit]
    siguiente = offset + limit
    return ListaNegocios(
        items=pagina,
        total=len(items),
        siguiente_cursor=str(siguiente) if siguiente < len(items) else None,
    )


def get_negocio_detail(
    db: Session, id_o_slug: str, *, ahora: datetime, mandados: MandadoService
) -> NegocioDetalle | None:
    try:
        condicion, valor = "n.id = :valor", UUID(id_o_slug)
    except ValueError:
        condicion, valor = "n.slug = :valor", id_o_slug  # type: ignore[assignment]
    f = (
        db.execute(
            text(f"select {_COLUMNAS} {_DESDE} where {condicion} and {_ACTIVO}"), {"valor": valor}
        )
        .mappings()
        .one_or_none()
    )
    if f is None:
        return None

    negocio_id: UUID = f["id"]
    fotos = (
        db.execute(
            text("select url from negocio_fotos where negocio_id = :id order by orden"),
            {"id": negocio_id},
        )
        .scalars()
        .all()
    )
    franjas = _franjas_por_negocio(db, [negocio_id]).get(negocio_id, [])
    cerrado_hoy_fecha: date | None = f["cerrado_hoy_fecha"]
    hoy = ahora.astimezone(ZONA_NEGOCIOS).date()

    return NegocioDetalle(
        id=negocio_id,
        slug=f["slug"],
        nombre=f["nombre"],
        descripcion=f["descripcion"],
        categoria=_categoria(f),
        barrio=_barrio(f),
        ubicacion=Punto(lat=f["lat"], lng=f["lng"]),
        direccion_texto=f["direccion_texto"],
        whatsapp=f["whatsapp"],
        telefono=f["telefono"],
        fotos=list(fotos),
        horarios=[
            Horario(
                dia_semana=h.dia_semana,
                abre=h.abre.strftime("%H:%M"),
                cierra=h.cierra.strftime("%H:%M"),
            )
            for h in franjas
        ],
        abierto_ahora=esta_abierto(franjas, ahora, cerrado_hoy_fecha),
        cerrado_hoy=cerrado_hoy_fecha == hoy,
        destacado=f["destacado"],
        # Hook transaccional (SPEC §4): Fase 1 → stub "próximamente"; Fase 2 → mandados reales.
        mandados=mandados.get_disponibilidad(negocio_id),
    )
