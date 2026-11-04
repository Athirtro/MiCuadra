"""Catálogo del negocio y apartados.

Reglas del apartado (en un solo lugar, como la máquina de estados de los mandados):
- pendiente → confirmado | cancelado
- confirmado → listo | entregado | cancelado
- listo → entregado | cancelado
El stock se descuenta al **confirmar** (con bloqueo de filas para que dos confirmaciones a la
vez no vendan lo mismo) y vuelve si se cancela después. Al apartar solo se valida que alcance.
"""

import secrets
from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import RowMapping, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.schemas.catalogo import (
    Apartado,
    ApartadoEntrada,
    ApartadoItem,
    CambioEstadoApartado,
    Catalogo,
    Item,
    ItemEntrada,
    NegocioDelApartado,
    Seccion,
    SeccionEntrada,
    VecinoDelApartado,
)
from app.services.cuenta import _verificar_dueno

MAX_SECCIONES = 30
MAX_ITEMS = 300
# Apartados abiertos (sin entregar ni cancelar) que un vecino puede tener en un mismo negocio.
MAX_APARTADOS_ABIERTOS = 3
ABIERTOS = ("pendiente", "confirmado", "listo")
TRANSICIONES: dict[str, set[str]] = {
    "pendiente": {"confirmado", "cancelado"},
    "confirmado": {"listo", "entregado", "cancelado"},
    "listo": {"entregado", "cancelado"},
    "entregado": set(),
    "cancelado": set(),
}
# Sin 0/O ni 1/I/L: se dicta por WhatsApp sin confusiones.
_ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

_COLUMNAS_ITEM = (
    "id, seccion_id, tipo, nombre, descripcion, precio, foto_url, stock, visible, orden"
)


# ── Catálogo ──


def _catalogo(db: Session, negocio_id: UUID, solo_visibles: bool) -> Catalogo:
    secciones = db.execute(
        text(
            "select id, nombre, orden from catalogo_secciones"
            " where negocio_id = :id order by orden, nombre"
        ),
        {"id": negocio_id},
    ).mappings()
    filtro = " and visible" if solo_visibles else ""
    items = db.execute(
        text(
            f"select {_COLUMNAS_ITEM} from catalogo_items"
            f" where negocio_id = :id{filtro} order by orden, nombre"
        ),
        {"id": negocio_id},
    ).mappings()
    return Catalogo(
        secciones=[Seccion.model_validate(dict(s)) for s in secciones],
        items=[Item.model_validate(dict(i)) for i in items],
    )


def catalogo_publico(db: Session, id_o_slug: str) -> Catalogo | None:
    try:
        condicion, valor = "id = :valor", UUID(id_o_slug)
    except ValueError:
        condicion, valor = "slug = :valor", id_o_slug  # type: ignore[assignment]
    negocio_id = db.execute(
        text(
            f"select id from negocios where {condicion}"
            " and estado = 'activo' and deleted_at is null"
        ),
        {"valor": valor},
    ).scalar_one_or_none()
    if negocio_id is None:
        return None
    return _catalogo(db, negocio_id, solo_visibles=True)


def catalogo_dueno(db: Session, negocio_id: UUID, usuario_id: UUID, es_admin: bool) -> Catalogo:
    _verificar_dueno(db, negocio_id, usuario_id, es_admin)
    return _catalogo(db, negocio_id, solo_visibles=False)


def crear_seccion(
    db: Session, negocio_id: UUID, usuario_id: UUID, es_admin: bool, datos: SeccionEntrada
) -> Seccion:
    _verificar_dueno(db, negocio_id, usuario_id, es_admin)
    total = db.execute(
        text("select count(*) from catalogo_secciones where negocio_id = :id"), {"id": negocio_id}
    ).scalar_one()
    if total >= MAX_SECCIONES:
        raise ApiError(422, "limite_secciones", f"Puedes tener hasta {MAX_SECCIONES} secciones.")
    fila = (
        db.execute(
            text(
                "insert into catalogo_secciones (negocio_id, nombre, orden)"
                " values (:negocio, :nombre, :orden) returning id, nombre, orden"
            ),
            {"negocio": negocio_id, "nombre": datos.nombre, "orden": datos.orden},
        )
        .mappings()
        .one()
    )
    db.commit()
    return Seccion.model_validate(dict(fila))


def editar_seccion(
    db: Session,
    negocio_id: UUID,
    seccion_id: UUID,
    usuario_id: UUID,
    es_admin: bool,
    datos: SeccionEntrada,
) -> Seccion:
    _verificar_dueno(db, negocio_id, usuario_id, es_admin)
    fila = (
        db.execute(
            text(
                "update catalogo_secciones set nombre = :nombre, orden = :orden"
                " where id = :id and negocio_id = :negocio returning id, nombre, orden"
            ),
            {"id": seccion_id, "negocio": negocio_id, "nombre": datos.nombre, "orden": datos.orden},
        )
        .mappings()
        .one_or_none()
    )
    if fila is None:
        raise ApiError(404, "seccion_no_encontrada", "Esa sección ya no existe.")
    db.commit()
    return Seccion.model_validate(dict(fila))


def borrar_seccion(
    db: Session, negocio_id: UUID, seccion_id: UUID, usuario_id: UUID, es_admin: bool
) -> None:
    """Borra la sección; sus ítems quedan sin sección (no se pierden)."""
    _verificar_dueno(db, negocio_id, usuario_id, es_admin)
    borrada = db.execute(
        text(
            "delete from catalogo_secciones where id = :id and negocio_id = :negocio returning id"
        ),
        {"id": seccion_id, "negocio": negocio_id},
    ).first()
    if borrada is None:
        raise ApiError(404, "seccion_no_encontrada", "Esa sección ya no existe.")
    db.commit()


def _validar_item(db: Session, negocio_id: UUID, datos: ItemEntrada, prefijo_fotos: str) -> None:
    if datos.seccion_id is not None:
        existe = db.execute(
            text("select 1 from catalogo_secciones where id = :id and negocio_id = :negocio"),
            {"id": datos.seccion_id, "negocio": negocio_id},
        ).first()
        if existe is None:
            raise ApiError(422, "seccion_invalida", "Elige una sección de tu catálogo.")
    if datos.foto_url is not None:
        # Solo fotos subidas desde MiCuadra a la carpeta del catálogo de este negocio.
        carpeta = f"{prefijo_fotos}catalogo/"
        resto = datos.foto_url[len(carpeta) :]
        if not datos.foto_url.startswith(carpeta) or "/" in resto or ".." in resto or not resto:
            raise ApiError(422, "foto_invalida", "Sube la foto desde MiCuadra.")


def _parametros_item(datos: ItemEntrada) -> dict[str, object]:
    return {
        "seccion": datos.seccion_id,
        "tipo": datos.tipo,
        "nombre": datos.nombre,
        "descripcion": datos.descripcion,
        "precio": datos.precio,
        "foto": datos.foto_url,
        # Un servicio no lleva inventario.
        "stock": None if datos.tipo == "servicio" else datos.stock,
        "visible": datos.visible,
        "orden": datos.orden,
    }


def crear_item(
    db: Session,
    negocio_id: UUID,
    usuario_id: UUID,
    es_admin: bool,
    datos: ItemEntrada,
    prefijo_fotos: str,
) -> Item:
    _verificar_dueno(db, negocio_id, usuario_id, es_admin)
    _validar_item(db, negocio_id, datos, prefijo_fotos)
    total = db.execute(
        text("select count(*) from catalogo_items where negocio_id = :id"), {"id": negocio_id}
    ).scalar_one()
    if total >= MAX_ITEMS:
        raise ApiError(
            422, "limite_items", f"Puedes tener hasta {MAX_ITEMS} productos y servicios."
        )
    fila = (
        db.execute(
            text(
                "insert into catalogo_items"
                " (negocio_id, seccion_id, tipo, nombre, descripcion, precio, foto_url, stock,"
                " visible, orden)"
                " values (:negocio, :seccion, :tipo, :nombre, :descripcion, :precio, :foto,"
                " :stock, :visible, :orden)"
                f" returning {_COLUMNAS_ITEM}"
            ),
            {"negocio": negocio_id, **_parametros_item(datos)},
        )
        .mappings()
        .one()
    )
    db.commit()
    return Item.model_validate(dict(fila))


def editar_item(
    db: Session,
    negocio_id: UUID,
    item_id: UUID,
    usuario_id: UUID,
    es_admin: bool,
    datos: ItemEntrada,
    prefijo_fotos: str,
) -> Item:
    _verificar_dueno(db, negocio_id, usuario_id, es_admin)
    _validar_item(db, negocio_id, datos, prefijo_fotos)
    fila = (
        db.execute(
            text(
                "update catalogo_items set seccion_id = :seccion, tipo = :tipo, nombre = :nombre,"
                " descripcion = :descripcion, precio = :precio, foto_url = :foto, stock = :stock,"
                " visible = :visible, orden = :orden"
                f" where id = :id and negocio_id = :negocio returning {_COLUMNAS_ITEM}"
            ),
            {"id": item_id, "negocio": negocio_id, **_parametros_item(datos)},
        )
        .mappings()
        .one_or_none()
    )
    if fila is None:
        raise ApiError(404, "item_no_encontrado", "Ese producto ya no existe.")
    db.commit()
    return Item.model_validate(dict(fila))


def ajustar_stock(
    db: Session, negocio_id: UUID, item_id: UUID, usuario_id: UUID, es_admin: bool, delta: int
) -> Item:
    """Suma o resta unidades (llegó mercancía, se vendió en la tienda). Nunca baja de 0."""
    _verificar_dueno(db, negocio_id, usuario_id, es_admin)
    fila = (
        db.execute(
            text(
                "update catalogo_items set stock = greatest(0, coalesce(stock, 0) + :delta)"
                " where id = :id and negocio_id = :negocio and tipo = 'producto'"
                f" returning {_COLUMNAS_ITEM}"
            ),
            {"id": item_id, "negocio": negocio_id, "delta": delta},
        )
        .mappings()
        .one_or_none()
    )
    if fila is None:
        raise ApiError(404, "item_no_encontrado", "Ese producto ya no existe.")
    db.commit()
    return Item.model_validate(dict(fila))


def borrar_item(
    db: Session, negocio_id: UUID, item_id: UUID, usuario_id: UUID, es_admin: bool
) -> str | None:
    """Borra el ítem y devuelve su foto (para que la web la quite del almacenamiento)."""
    _verificar_dueno(db, negocio_id, usuario_id, es_admin)
    fila = db.execute(
        text(
            "delete from catalogo_items where id = :id and negocio_id = :negocio returning foto_url"
        ),
        {"id": item_id, "negocio": negocio_id},
    ).first()
    if fila is None:
        raise ApiError(404, "item_no_encontrado", "Ese producto ya no existe.")
    db.commit()
    foto: str | None = fila[0]
    return foto


# ── Apartados ──


def _cargar_apartados(
    db: Session, condicion: str, parametros: dict[str, object], con_vecino: bool
) -> list[Apartado]:
    filas = list(
        db.execute(
            text(
                "select a.id, a.codigo, a.estado, a.nota, a.total, a.hay_sin_precio,"
                " a.motivo_cancelacion, a.cancelado_por, a.created_at, a.updated_at,"
                " n.id as negocio_id, n.slug, n.nombre as negocio_nombre, n.whatsapp,"
                " u.nombre as vecino_nombre, u.celular as vecino_celular"
                " from apartados a join negocios n on n.id = a.negocio_id"
                " join usuarios u on u.id = a.vecino_id"
                f" where {condicion} order by a.created_at desc limit 100"
            ),
            parametros,
        ).mappings()
    )
    items: dict[UUID, list[ApartadoItem]] = {f["id"]: [] for f in filas}
    if items:
        for i in db.execute(
            text(
                "select apartado_id, item_id, nombre, precio, cantidad from apartado_items"
                " where apartado_id = any(:ids) order by created_at, nombre"
            ),
            {"ids": list(items)},
        ).mappings():
            items[i["apartado_id"]].append(
                ApartadoItem(
                    item_id=i["item_id"],
                    nombre=i["nombre"],
                    precio=i["precio"],
                    cantidad=i["cantidad"],
                )
            )
    return [_apartado(f, items[f["id"]], con_vecino) for f in filas]


def _apartado(f: RowMapping, items: list[ApartadoItem], con_vecino: bool) -> Apartado:
    return Apartado(
        id=f["id"],
        codigo=f["codigo"],
        estado=f["estado"],
        negocio=NegocioDelApartado(
            id=f["negocio_id"], slug=f["slug"], nombre=f["negocio_nombre"], whatsapp=f["whatsapp"]
        ),
        vecino=VecinoDelApartado(nombre=f["vecino_nombre"], celular=f["vecino_celular"])
        if con_vecino
        else None,
        items=items,
        nota=f["nota"],
        total=f["total"],
        hay_sin_precio=f["hay_sin_precio"],
        motivo_cancelacion=f["motivo_cancelacion"],
        cancelado_por=f["cancelado_por"],
        created_at=f["created_at"],
        updated_at=f["updated_at"],
    )


def _uno(db: Session, apartado_id: UUID, con_vecino: bool) -> Apartado:
    return _cargar_apartados(db, "a.id = :id", {"id": apartado_id}, con_vecino)[0]


def crear_apartado(
    db: Session, negocio_id: UUID, vecino_id: UUID, datos: ApartadoEntrada
) -> Apartado:
    activo = db.execute(
        text("select 1 from negocios where id = :id and estado = 'activo' and deleted_at is null"),
        {"id": negocio_id},
    ).first()
    if activo is None:
        raise ApiError(404, "negocio_no_encontrado", "Este negocio no está en el mapa.")

    abiertos = db.execute(
        text(
            "select count(*) from apartados where negocio_id = :negocio and vecino_id = :vecino"
            " and estado = any(:abiertos)"
        ),
        {"negocio": negocio_id, "vecino": vecino_id, "abiertos": list(ABIERTOS)},
    ).scalar_one()
    if abiertos >= MAX_APARTADOS_ABIERTOS:
        raise ApiError(
            422,
            "demasiados_apartados",
            "Ya tienes apartados abiertos en este negocio. Espera a recogerlos o cancela alguno.",
        )

    # Si el mismo producto viene dos veces, se suman las cantidades.
    cantidades: dict[UUID, int] = {}
    for linea in datos.items:
        cantidades[linea.item_id] = cantidades.get(linea.item_id, 0) + linea.cantidad
    if any(c > 99 for c in cantidades.values()):
        raise ApiError(422, "cantidad_invalida", "Puedes apartar hasta 99 unidades de cada cosa.")

    filas = {
        f["id"]: f
        for f in db.execute(
            text(
                "select id, nombre, precio, stock from catalogo_items"
                " where negocio_id = :negocio and visible and id = any(:ids)"
            ),
            {"negocio": negocio_id, "ids": list(cantidades)},
        ).mappings()
    }
    if len(filas) != len(cantidades):
        raise ApiError(
            422,
            "item_no_disponible",
            "Algo de tu carrito ya no está en el catálogo. Actualiza la página y revisa.",
        )
    for item_id, cantidad in cantidades.items():
        stock = filas[item_id]["stock"]
        if stock is not None and cantidad > stock:
            nombre = filas[item_id]["nombre"]
            raise ApiError(
                422,
                "sin_stock",
                f"De «{nombre}» quedan {stock}." if stock else f"«{nombre}» se agotó.",
            )

    total = sum((filas[i]["precio"] or 0) * c for i, c in cantidades.items())
    hay_sin_precio = any(filas[i]["precio"] is None for i in cantidades)

    apartado_id: UUID | None = None
    for _ in range(5):
        codigo = "".join(secrets.choice(_ALFABETO) for _ in range(4))
        try:
            with db.begin_nested():
                apartado_id = db.execute(
                    text(
                        "insert into apartados"
                        " (codigo, negocio_id, vecino_id, nota, total, hay_sin_precio)"
                        " values (:codigo, :negocio, :vecino, :nota, :total, :sin_precio)"
                        " returning id"
                    ),
                    {
                        "codigo": codigo,
                        "negocio": negocio_id,
                        "vecino": vecino_id,
                        "nota": datos.nota,
                        "total": total,
                        "sin_precio": hay_sin_precio,
                    },
                ).scalar_one()
            break
        except IntegrityError:
            continue  # código repetido: se intenta con otro
    if apartado_id is None:
        raise ApiError(503, "intenta_de_nuevo", "No pudimos guardar el apartado. Intenta de nuevo.")

    for item_id, cantidad in cantidades.items():
        db.execute(
            text(
                "insert into apartado_items (apartado_id, item_id, nombre, precio, cantidad)"
                " values (:apartado, :item, :nombre, :precio, :cantidad)"
            ),
            {
                "apartado": apartado_id,
                "item": item_id,
                "nombre": filas[item_id]["nombre"],
                "precio": filas[item_id]["precio"],
                "cantidad": cantidad,
            },
        )
    db.commit()
    return _uno(db, apartado_id, con_vecino=False)


def mis_apartados(db: Session, vecino_id: UUID) -> list[Apartado]:
    return _cargar_apartados(db, "a.vecino_id = :vecino", {"vecino": vecino_id}, con_vecino=False)


def apartados_del_negocio(
    db: Session, negocio_id: UUID, usuario_id: UUID, es_admin: bool, estado: str | None
) -> list[Apartado]:
    _verificar_dueno(db, negocio_id, usuario_id, es_admin)
    condicion = "a.negocio_id = :negocio"
    parametros: dict[str, object] = {"negocio": negocio_id}
    if estado == "abiertos":
        condicion += " and a.estado = any(:abiertos)"
        parametros["abiertos"] = list(ABIERTOS)
    elif estado:
        condicion += " and a.estado = :estado"
        parametros["estado"] = estado
    return _cargar_apartados(db, condicion, parametros, con_vecino=True)


def _lineas(db: Session, apartado_id: UUID) -> Sequence[RowMapping]:
    return (
        db.execute(
            text(
                "select item_id, nombre, cantidad from apartado_items"
                " where apartado_id = :id and item_id is not null"
            ),
            {"id": apartado_id},
        )
        .mappings()
        .all()
    )


def _descontar_stock(db: Session, apartado_id: UUID) -> None:
    lineas = _lineas(db, apartado_id)
    if not lineas:
        return
    # Bloqueo de filas: dos confirmaciones simultáneas no pueden vender la misma unidad.
    stock: dict[UUID, int | None] = dict(
        db.execute(
            text(
                "select id, stock from catalogo_items where id = any(:ids) order by id for update"
            ),
            {"ids": [ln["item_id"] for ln in lineas]},
        ).all()
    )
    for ln in lineas:
        disponible = stock.get(ln["item_id"])
        if disponible is not None and ln["cantidad"] > disponible:
            raise ApiError(
                409,
                "sin_stock",
                f"No alcanza «{ln['nombre']}»: quedan {disponible}. Ajusta el inventario o"
                " cancela el apartado.",
            )
    for ln in lineas:
        db.execute(
            text(
                "update catalogo_items set stock = stock - :cantidad"
                " where id = :id and stock is not null"
            ),
            {"id": ln["item_id"], "cantidad": ln["cantidad"]},
        )


def _devolver_stock(db: Session, apartado_id: UUID) -> None:
    for ln in _lineas(db, apartado_id):
        db.execute(
            text(
                "update catalogo_items set stock = stock + :cantidad"
                " where id = :id and stock is not null"
            ),
            {"id": ln["item_id"], "cantidad": ln["cantidad"]},
        )


def _transicion(
    db: Session,
    fila: RowMapping,
    nuevo: str,
    *,
    motivo: str | None,
    por: str,
) -> None:
    actual = fila["estado"]
    if nuevo not in TRANSICIONES[actual]:
        raise ApiError(
            409, "transicion_invalida", f"Un apartado {actual} no puede pasar a {nuevo}."
        )
    descontado = fila["stock_descontado"]
    if nuevo == "confirmado":
        _descontar_stock(db, fila["id"])
        descontado = True
    elif nuevo == "cancelado" and descontado:
        _devolver_stock(db, fila["id"])
        descontado = False
    db.execute(
        text(
            "update apartados set estado = :estado, stock_descontado = :descontado,"
            " motivo_cancelacion = :motivo, cancelado_por = :por where id = :id"
        ),
        {
            "id": fila["id"],
            "estado": nuevo,
            "descontado": descontado,
            "motivo": motivo if nuevo == "cancelado" else None,
            "por": por if nuevo == "cancelado" else None,
        },
    )


def _bloquear(db: Session, condicion: str, parametros: dict[str, object]) -> RowMapping:
    fila = (
        db.execute(
            text(
                f"select id, estado, stock_descontado from apartados where {condicion} for update"
            ),
            parametros,
        )
        .mappings()
        .one_or_none()
    )
    if fila is None:
        raise ApiError(404, "apartado_no_encontrado", "No encontramos ese apartado.")
    return fila


def cambiar_estado_por_negocio(
    db: Session,
    negocio_id: UUID,
    apartado_id: UUID,
    usuario_id: UUID,
    es_admin: bool,
    cambio: CambioEstadoApartado,
) -> Apartado:
    _verificar_dueno(db, negocio_id, usuario_id, es_admin)
    fila = _bloquear(
        db, "id = :id and negocio_id = :negocio", {"id": apartado_id, "negocio": negocio_id}
    )
    try:
        _transicion(db, fila, cambio.estado, motivo=cambio.motivo, por="negocio")
    except ApiError:
        db.rollback()
        raise
    db.commit()
    return _uno(db, apartado_id, con_vecino=True)


def cancelar_por_vecino(
    db: Session, apartado_id: UUID, vecino_id: UUID, motivo: str | None
) -> Apartado:
    fila = _bloquear(
        db, "id = :id and vecino_id = :vecino", {"id": apartado_id, "vecino": vecino_id}
    )
    try:
        _transicion(db, fila, "cancelado", motivo=motivo, por="vecino")
    except ApiError:
        db.rollback()
        raise
    db.commit()
    return _uno(db, apartado_id, con_vecino=False)
