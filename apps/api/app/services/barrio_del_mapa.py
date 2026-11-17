"""Barrio de un punto del mapa según OpenStreetMap (Nominatim), para no depender de una lista fija.

Se usa cuando el negocio llega sin barrio escrito y desde el panel («Tomar del mapa»). Si
Nominatim no responde, el negocio se guarda igual (sin barrio o con el más cercano conocido).
Política de uso de Nominatim: máximo 1 consulta por segundo e identificarse con User-Agent.
"""

import json
import logging
import threading
import time
import urllib.parse
import urllib.request
from collections.abc import Callable

from app.config import get_settings

log = logging.getLogger(__name__)

URL = "https://nominatim.openstreetmap.org/reverse"
AGENTE = "micuadra-directorio/0.1 (+https://micuadra-lyart.vercel.app)"
# Del más específico al más general: en Pereira «neighbourhood»/«residential» es el barrio y
# «suburb» a veces es el barrio y a veces la comuna.
CAMPOS = ("neighbourhood", "residential", "suburb", "quarter")
# OSM escribe algunos barrios sin tildes o con otro nombre del que usa la gente.
CORRECCIONES = {
    "central": "Centro",
    "jardin i": "Jardín I",
    "jardin ii": "Jardín II",
    "montelibano": "Montelíbano",
    "berlin": "Berlín",
    "boston": "Boston",
    "bostón": "Boston",
    "villa del bosque": "Villa del Bosque",
    "alamos": "Álamos",
    "los alamos": "Álamos",
}

BarrioDelMapa = Callable[[float, float], str | None]


def nombre_de_barrio(direccion: dict[str, str]) -> str | None:
    """Del bloque `address` de Nominatim, el nombre de barrio más específico y bien escrito."""
    for campo in CAMPOS:
        valor = " ".join((direccion.get(campo) or "").split())
        if not valor or valor.lower().startswith("comuna"):
            continue
        return CORRECCIONES.get(valor.lower(), valor[:60])
    return None


def con_nominatim() -> BarrioDelMapa:
    cache: dict[tuple[float, float], str | None] = {}
    candado = threading.Lock()
    ultima = [0.0]

    def buscar(lat: float, lng: float) -> str | None:
        llave = (round(lat, 4), round(lng, 4))
        if llave in cache:
            return cache[llave]
        params = urllib.parse.urlencode(
            {
                "format": "jsonv2",
                "lat": lat,
                "lon": lng,
                "zoom": 17,
                "addressdetails": 1,
                "accept-language": "es",
            }
        )
        pedido = urllib.request.Request(f"{URL}?{params}", headers={"User-Agent": AGENTE})
        with candado:
            espera = ultima[0] + 1.0 - time.monotonic()
            if espera > 0:
                time.sleep(espera)
            ultima[0] = time.monotonic()
            try:
                with urllib.request.urlopen(pedido, timeout=4) as r:
                    datos = json.load(r)
            except (OSError, ValueError):
                log.warning("Nominatim no respondió para %s", llave)
                return None  # sin caché: se reintenta la próxima vez
        nombre = nombre_de_barrio(datos.get("address") or {})
        cache[llave] = nombre
        return nombre

    return buscar


_nominatim: list[BarrioDelMapa] = []


def get_barrio_del_mapa() -> BarrioDelMapa | None:
    """Dependencia de FastAPI. `BARRIOS_OSM=false` la apaga (pruebas o sin salida a internet)."""
    if not get_settings().barrios_osm:
        return None
    if not _nominatim:
        _nominatim.append(con_nominatim())
    return _nominatim[0]
