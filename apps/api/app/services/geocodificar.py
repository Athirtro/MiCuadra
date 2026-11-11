"""Ubicar direcciones de Pereira para la carga por CSV del admin.

Dos fuentes, en orden: la Geocoding API de Google (si hay `GOOGLE_GEOCODING_KEY` y facturación)
y la nomenclatura sobre las calles de OpenStreetMap (`nomenclatura.py`, gratis y sin red).
De Google solo se aceptan resultados precisos (placa o cuadra) dentro de Pereira; si solo
encuentra la calle o el barrio, se descarta para no poner pines a varias cuadras del negocio.
"""

import json
import logging
import re
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from app.config import get_settings
from app.schemas.directorio import Punto
from app.services.nomenclatura import Nomenclatura
from app.services.nomenclatura import cargar as cargar_nomenclatura

log = logging.getLogger(__name__)

URL = "https://maps.googleapis.com/maps/api/geocode/json"
PRECISOS = {"ROOFTOP", "RANGE_INTERPOLATED"}
# Pereira urbana (igual que la validación de ubicación del registro).
LIMITES = (4.6, 5.0, -76.0, -75.5)


@dataclass(frozen=True)
class Encontrado:
    punto: Punto
    detalle: str  # cómo la entendió Google o cómo se interpoló, para que el equipo confirme
    metodo: Literal["google", "nomenclatura"] = "google"


# (dirección, nombre del barrio, centro del barrio si se conoce)
Geocodificador = Callable[[str, str | None, Punto | None], Encontrado | None]


class GoogleNoDisponible(Exception):
    """Google rechazó la consulta (clave, facturación o cuota): no es que no exista la dirección."""


def limpiar_direccion(direccion: str) -> str:
    """Quita lo que confunde al buscador: notas entre paréntesis y el número de local."""
    d = re.sub(r"\([^)]*\)", " ", direccion)
    d = re.sub(r"\b(L|Local|Lc|Of|Apto|Int)\.?\s*-?\s*\d+\w*\b", " ", d, flags=re.I)
    return " ".join(d.split())


def con_google(clave: str) -> Geocodificador:
    cache: dict[tuple[str, str | None], Encontrado | None] = {}

    def buscar(direccion: str, barrio: str | None, cerca: Punto | None = None) -> Encontrado | None:
        llave = (direccion, barrio)
        if llave in cache:
            return cache[llave]
        consulta = ", ".join(
            x for x in (limpiar_direccion(direccion), barrio, "Pereira, Risaralda") if x
        )
        params = urllib.parse.urlencode(
            {
                "address": consulta,
                "components": "country:CO|locality:Pereira",
                "region": "co",
                "language": "es",
                "key": clave,
            }
        )
        try:
            with urllib.request.urlopen(f"{URL}?{params}", timeout=8) as r:
                datos = json.load(r)
        except (OSError, ValueError):
            log.warning("Geocoding no respondió para %r", consulta)
            return None  # sin respuesta no se guarda en caché: se reintenta la próxima vez
        resultado = None
        if datos.get("status") == "OK":
            for c in datos.get("results", []):
                geo = c.get("geometry", {})
                lat, lng = geo.get("location", {}).get("lat"), geo.get("location", {}).get("lng")
                if (
                    geo.get("location_type") in PRECISOS
                    and lat is not None
                    and LIMITES[0] <= lat <= LIMITES[1]
                    and LIMITES[2] <= lng <= LIMITES[3]
                ):
                    resultado = Encontrado(Punto(lat=lat, lng=lng), c.get("formatted_address", ""))
                    break
        elif datos.get("status") not in ("ZERO_RESULTS",):
            # REQUEST_DENIED, OVER_QUERY_LIMIT…: casi siempre la clave, la facturación o la cuota.
            log.error("Geocoding respondió %s: %s", datos.get("status"), datos.get("error_message"))
            raise GoogleNoDisponible(str(datos.get("status")))
        cache[llave] = resultado
        return resultado

    return buscar


def con_nomenclatura(n: Nomenclatura) -> Geocodificador:
    def buscar(direccion: str, barrio: str | None, cerca: Punto | None = None) -> Encontrado | None:
        r = n.ubicar(limpiar_direccion(direccion), cerca)
        return Encontrado(r[0], r[1], "nomenclatura") if r else None

    return buscar


def encadenar(google: Geocodificador | None, nomenclatura: Geocodificador | None) -> Geocodificador:
    """Google primero (más preciso); si no encuentra o lo rechaza, la nomenclatura.

    Solo si ninguno ubica y Google rechazó, se propaga el rechazo para avisarlo en la revisión.
    """

    def buscar(direccion: str, barrio: str | None, cerca: Punto | None = None) -> Encontrado | None:
        rechazo: GoogleNoDisponible | None = None
        if google:
            try:
                if r := google(direccion, barrio, cerca):
                    return r
            except GoogleNoDisponible as e:
                rechazo = e
        if nomenclatura and (r := nomenclatura(direccion, barrio, cerca)):
            return r
        if rechazo:
            raise rechazo
        return None

    return buscar


_por_clave: dict[str, Geocodificador | None] = {}


def get_geocodificador() -> Geocodificador | None:
    """Dependencia de FastAPI: Google (si hay clave) seguido de la nomenclatura (si están las calles)."""
    clave = get_settings().google_geocoding_key.strip()
    if clave not in _por_clave:
        n = cargar_nomenclatura()
        google = con_google(clave) if clave else None
        local = con_nomenclatura(n) if n else None
        _por_clave[clave] = encadenar(google, local) if (google or local) else None
    return _por_clave[clave]
