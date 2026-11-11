"""Carga de negocios por el equipo (SPEC §6.5): uno a uno desde el panel o por CSV.

El CSV llega como texto y aquí se interpreta (categoría por nombre, ubicación como «lat, lng» o
enlace de Google Maps, horario como «lun-sab 7:00-19:00; dom 8:00-13:00»), para que las reglas
vivan en un solo lugar. El lote se crea completo o no se crea: con un error no entra nada.
"""

import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.schemas.admin import (
    ErrorFila,
    FilaCsv,
    FilaValida,
    LoteEntrada,
    LoteResultado,
    NegocioAdmin,
    NegocioCargaEntrada,
)
from app.schemas.cuenta import HorarioEntrada
from app.schemas.directorio import Punto
from app.services.admin import buscar_negocio
from app.services.cuenta import insertar_negocio, slugificar
from app.services.geocodificar import Encontrado, Geocodificador

# Mismo nombre a menos de esto = probablemente el mismo negocio.
RADIO_DUPLICADO_M = 150

_DIAS = {"dom": 0, "lun": 1, "mar": 2, "mie": 3, "jue": 4, "vie": 5, "sab": 6}
_ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0]  # lunes primero, como se dice en Colombia
_NUMERO = r"-?\d{1,3}\.\d+"
_HORA = re.compile(r"^(\d{1,2})(?::(\d{2}))?$")

# Mensajes por campo, en español y para quien llena la planilla.
_MENSAJES = {
    "nombre": "Falta el nombre (mínimo 2 letras, máximo 80).",
    "categoria": "Falta la categoría.",
    "direccion_texto": "Falta la dirección (mínimo 3 letras, máximo 120).",
    "barrio": "El barrio debe tener entre 2 y 60 letras.",
    "whatsapp": "El WhatsApp debe tener 10 dígitos y empezar por 3.",
    "telefono": "El teléfono es muy largo.",
    "descripcion": "La descripción puede tener máximo 280 letras.",
    "ubicacion": "La ubicación debe quedar en Pereira.",
    "horarios": "Revisa el horario.",
}


def _sin_tildes(t: str) -> str:
    """Minúsculas y sin tildes, conservando guiones y comas (separan días y franjas)."""
    sin = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    return " ".join(sin.lower().split())


def interpretar_ubicacion(texto: str) -> Punto:
    """«4.7966, -75.7301», «4.7966 -75.7301» o un enlace de Google Maps con @lat,lng o q=lat,lng."""
    m = re.search(rf"@({_NUMERO}),({_NUMERO})", texto) or re.search(
        rf"({_NUMERO})\s*[,; ]\s*({_NUMERO})", texto
    )
    if not m:
        raise ValueError(
            "No entendí la ubicación: escribe «latitud, longitud» (ej. 4.7966, -75.7301)."
        )
    return Punto(lat=float(m.group(1)), lng=float(m.group(2)))


def _hora(t: str) -> str:
    m = _HORA.match(t.strip())
    if not m or int(m.group(1)) > 23 or int(m.group(2) or 0) > 59:
        raise ValueError(f"No entendí la hora «{t.strip()}» (usa 24 horas, ej. 7:00 o 19:30).")
    return f"{int(m.group(1)):02d}:{m.group(2) or '00'}"


def _dias(t: str) -> list[int]:
    t = _sin_tildes(t)
    if t in {"todos", "todos los dias", "diario", "todos los dias de la semana"}:
        return list(_ORDEN_DIAS)
    dias: list[int] = []
    for parte in re.split(r"\s*,\s*|\s+y\s+", t):
        if "-" in parte or " a " in parte:
            ini, fin = (x.strip()[:3] for x in re.split(r"\s*-\s*|\s+a\s+", parte, maxsplit=1))
            if ini not in _DIAS or fin not in _DIAS:
                raise ValueError(
                    f"No entendí los días «{parte}» (usa lun, mar, mie, jue, vie, sab, dom)."
                )
            a, b = _ORDEN_DIAS.index(_DIAS[ini]), _ORDEN_DIAS.index(_DIAS[fin])
            dias += _ORDEN_DIAS[a : b + 1] if a <= b else _ORDEN_DIAS[a:] + _ORDEN_DIAS[: b + 1]
        else:
            clave = parte.strip()[:3]
            if clave not in _DIAS:
                raise ValueError(
                    f"No entendí el día «{parte}» (usa lun, mar, mie, jue, vie, sab, dom)."
                )
            dias.append(_DIAS[clave])
    return dias


def interpretar_horario(texto: str) -> list[HorarioEntrada]:
    """Tramos separados por «;». Cada tramo: días y una o más franjas.

    Ej.: «lun-sab 7:00-12:00 y 14:00-19:00; dom 8:00-13:00» o «todos 6-21».
    """
    horarios: list[HorarioEntrada] = []
    for tramo in filter(None, (t.strip() for t in texto.split(";"))):
        m = re.match(r"^(.*?)\s+(\d{1,2}(?::\d{2})?\s*-\s*\d{1,2}(?::\d{2})?.*)$", tramo)
        if not m:
            raise ValueError(f"No entendí «{tramo}» (ej. «lun-sab 7:00-19:00»).")
        dias = _dias(m.group(1))
        for franja in re.split(r"\s+y\s+|\s*,\s*", m.group(2)):
            abre, _, cierra = franja.partition("-")
            for d in dias:
                horarios.append(
                    HorarioEntrada(dia_semana=d, abre=_hora(abre), cierra=_hora(cierra))
                )
    return horarios


def _categorias(db: Session) -> dict[str, str]:
    """Nombre o slug sin tildes → slug."""
    mapa: dict[str, str] = {}
    for slug, nombre in db.execute(text("select slug, nombre from categorias where activa")).all():
        mapa[slug] = slug
        mapa[_sin_tildes(nombre)] = slug
        mapa[_sin_tildes(slug)] = slug
    return mapa


def _duplicado(db: Session, nombre: str, punto: Punto) -> bool:
    return (
        db.execute(
            text(
                "select 1 from negocios where deleted_at is null"
                " and normalizar(nombre) = normalizar(:nombre)"
                " and st_dwithin(ubicacion, st_point(:lng, :lat, 4326)::geography, :radio)"
            ),
            {"nombre": nombre, "lat": punto.lat, "lng": punto.lng, "radio": RADIO_DUPLICADO_M},
        ).first()
        is not None
    )


def crear_negocio(db: Session, datos: NegocioCargaEntrada) -> NegocioAdmin:
    if _duplicado(db, datos.nombre, datos.ubicacion):
        raise ApiError(409, "negocio_repetido", "Ya hay un negocio con ese nombre en esa cuadra.")
    negocio_id = insertar_negocio(
        db, datos, whatsapp=datos.whatsapp, dueno_id=None, estado=datos.estado, por_admin=True
    )
    db.commit()
    return buscar_negocio(db, negocio_id)


def _mensajes(error: ValidationError) -> list[str]:
    vistos: list[str] = []
    for e in error.errors():
        campo = str(e["loc"][0]) if e["loc"] else ""
        texto = _MENSAJES.get(campo, f"{campo}: {e['msg']}")
        if texto not in vistos:
            vistos.append(texto)
    return vistos


def cargar_lote(
    db: Session, lote: LoteEntrada, geocodificar: Geocodificador | None = None
) -> LoteResultado:
    categorias = _categorias(db)
    validas: list[tuple[FilaValida, NegocioCargaEntrada]] = []
    errores: list[ErrorFila] = []
    en_el_archivo: set[tuple[str, float, float]] = set()

    # Las filas con dirección pero sin coordenadas se buscan en Google, varias a la vez.
    por_buscar = {
        i: f for i, f in enumerate(lote.filas) if not f.ubicacion and f.direccion and geocodificar
    }
    encontrados: dict[int, Encontrado | None] = {}
    if por_buscar and geocodificar:
        with ThreadPoolExecutor(max_workers=8) as hilos:
            futuros = {
                i: hilos.submit(geocodificar, f.direccion, f.barrio or None)
                for i, f in por_buscar.items()
            }
            encontrados = {i: fut.result() for i, fut in futuros.items()}

    for n, fila in enumerate(lote.filas):
        i = n + 2  # número de fila en el archivo: la 1 es el encabezado
        mensajes: list[str] = []
        encontrado = encontrados.get(n)
        datos, completa = _fila_a_datos(
            fila, categorias, lote.estado, mensajes, encontrado, geocodificar is not None
        )
        entrada: NegocioCargaEntrada | None = None
        try:
            entrada = NegocioCargaEntrada.model_validate(datos)
        except ValidationError as e:
            mensajes += _mensajes(e)
        if not completa:
            entrada = None
        if entrada is not None and not mensajes:
            clave = (
                slugificar(entrada.nombre),
                round(entrada.ubicacion.lat, 3),
                round(entrada.ubicacion.lng, 3),
            )
            if clave in en_el_archivo:
                mensajes.append("Está repetido en el archivo.")
            elif _duplicado(db, entrada.nombre, entrada.ubicacion):
                mensajes.append("Ya está en MiCuadra (mismo nombre en esa cuadra).")
            en_el_archivo.add(clave)
        if mensajes or entrada is None:
            errores.append(
                ErrorFila(fila=i, nombre=fila.nombre or "(sin nombre)", mensajes=mensajes)
            )
            continue
        validas.append(
            (
                FilaValida(
                    fila=i,
                    nombre=entrada.nombre,
                    categoria=entrada.categoria,
                    barrio=entrada.barrio,
                    ubicacion=entrada.ubicacion,
                    whatsapp=entrada.whatsapp,
                    franjas=len(entrada.horarios),
                    ubicacion_automatica=encontrado is not None and not fila.ubicacion,
                    direccion_google=encontrado.direccion
                    if encontrado and not fila.ubicacion
                    else None,
                ),
                entrada,
            )
        )

    creados = 0
    if not lote.simular and not errores:
        ids: list[UUID] = [
            insertar_negocio(
                db, e, whatsapp=e.whatsapp, dueno_id=None, estado=e.estado, por_admin=True
            )
            for _, e in validas
        ]
        db.commit()
        creados = len(ids)
    return LoteResultado(validas=[v for v, _ in validas], errores=errores, creados=creados)


# Mientras falte la categoría o la ubicación, la fila se valida con estos valores de relleno para
# mostrar de una vez sus demás errores (dirección, WhatsApp…); nunca se crea con ellos.
_RELLENO_CATEGORIA = "tienda"
_RELLENO_UBICACION = Punto(lat=4.8133, lng=-75.6961)


def _fila_a_datos(
    fila: FilaCsv,
    categorias: dict[str, str],
    estado: str,
    mensajes: list[str],
    encontrado: Encontrado | None,
    con_google: bool,
) -> tuple[dict[str, object], bool]:
    """Convierte la fila de texto en datos para validar; anota en `mensajes` lo que no entienda.

    Devuelve los datos y si la fila está completa (categoría y ubicación reales).
    """
    categoria = categorias.get(_sin_tildes(fila.categoria)) if fila.categoria else None
    if fila.categoria and categoria is None:
        mensajes.append(f"No existe la categoría «{fila.categoria}».")
    elif not fila.categoria:
        mensajes.append(_MENSAJES["categoria"])

    ubicacion: Punto | None = None
    if fila.ubicacion:
        try:
            ubicacion = interpretar_ubicacion(fila.ubicacion)
        except ValueError as e:
            mensajes.append(str(e))
    elif encontrado is not None:
        ubicacion = encontrado.punto
    elif not fila.direccion:
        mensajes.append("Falta la ubicación (latitud, longitud).")
    elif con_google:
        mensajes.append("Google no encontró esa dirección con precisión: ubícala en el mapa.")
    else:
        mensajes.append("Falta la ubicación (latitud, longitud).")

    horarios: list[HorarioEntrada] = []
    if fila.horario:
        try:
            horarios = interpretar_horario(fila.horario)
        except ValidationError:  # va primero: también es un ValueError
            mensajes.append(
                "Revisa el horario: la hora de abrir y la de cerrar no pueden ser iguales."
            )
        except ValueError as e:
            mensajes.append(str(e))

    whatsapp = re.sub(r"\D", "", fila.whatsapp)
    if whatsapp.startswith("57") and len(whatsapp) == 12:
        whatsapp = whatsapp[2:]
    datos: dict[str, object] = {
        "nombre": fila.nombre,
        "categoria": categoria or _RELLENO_CATEGORIA,
        "barrio": fila.barrio or None,
        "direccion_texto": fila.direccion,
        "ubicacion": ubicacion or _RELLENO_UBICACION,
        "whatsapp": whatsapp or None,
        "telefono": fila.telefono or None,
        "descripcion": fila.descripcion or None,
        "horarios": horarios,
        "estado": estado,
    }
    return datos, categoria is not None and ubicacion is not None
