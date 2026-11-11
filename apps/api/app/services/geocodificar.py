"""Ubicar una dirección de Pereira con la Geocoding API de Google.

Solo se usa en la carga por CSV del admin. Se aceptan resultados precisos (el número de la
placa o una interpolación sobre la cuadra) y dentro de Pereira; si Google solo encuentra la
calle o el barrio, se descarta para no poner pines a varias cuadras del negocio.
"""

import json
import logging
import re
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass

from app.config import get_settings
from app.schemas.directorio import Punto

log = logging.getLogger(__name__)

URL = "https://maps.googleapis.com/maps/api/geocode/json"
PRECISOS = {"ROOFTOP", "RANGE_INTERPOLATED"}
# Pereira urbana (igual que la validación de ubicación del registro).
LIMITES = (4.6, 5.0, -76.0, -75.5)


@dataclass(frozen=True)
class Encontrado:
    punto: Punto
    direccion: str  # como la entendió Google, para que el equipo confirme


Geocodificador = Callable[[str, str | None], Encontrado | None]


class GoogleNoDisponible(Exception):
    """Google rechazó la consulta (clave, facturación o cuota): no es que no exista la dirección."""


def limpiar_direccion(direccion: str) -> str:
    """Quita lo que confunde al buscador: notas entre paréntesis y el número de local."""
    d = re.sub(r"\([^)]*\)", " ", direccion)
    d = re.sub(r"\b(L|Local|Lc|Of|Apto|Int)\.?\s*-?\s*\d+\w*\b", " ", d, flags=re.I)
    return " ".join(d.split())


def con_google(clave: str) -> Geocodificador:
    cache: dict[tuple[str, str | None], Encontrado | None] = {}

    def buscar(direccion: str, barrio: str | None) -> Encontrado | None:
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


_por_clave: dict[str, Geocodificador] = {}


def get_geocodificador() -> Geocodificador | None:
    """Dependencia de FastAPI: el geocodificador si hay clave configurada (uno por clave, con caché)."""
    clave = get_settings().google_geocoding_key.strip()
    if not clave:
        return None
    if clave not in _por_clave:
        _por_clave[clave] = con_google(clave)
    return _por_clave[clave]
