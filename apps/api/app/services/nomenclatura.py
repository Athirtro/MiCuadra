"""Ubicar direcciones de Pereira con la nomenclatura, sin servicios externos ni costo.

En Colombia «Cl 71 # 26B-08» quiere decir: sobre la Calle 71, a 8 m de la esquina con la
Carrera 26B. Con las calles de OpenStreetMap (`app/data/calles_pereira.json.gz`, se actualiza
con `scripts/calles_osm.py`) se busca esa esquina; si la carrera 26B no aparece cruzando la
Calle 71, se interpola entre las vecinas que sí la cruzan (26 Bis y 27). Después se avanzan los
metros de la placa hacia la siguiente vía. El resultado es aproximado (una cuadra, más o menos):
la carga lo marca para que el equipo revise el pin.
"""

import gzip
import json
import math
import re
from collections.abc import Iterable
from functools import lru_cache
from itertools import pairwise
from pathlib import Path

from app.schemas.directorio import Punto

DATOS = Path(__file__).resolve().parent.parent / "data" / "calles_pereira.json.gz"
RADIO_BARRIO_M = 1500  # los cruces se buscan cerca del barrio de la fila
HUECO_MAXIMO = 3.0  # no se interpola entre vías a más de 3 números de distancia
TOLERANCIA = 0.15  # en OSM las vías a veces no alcanzan a tocarse en la esquina

Via = tuple[str, float]  # ("calle" | "carrera", número continuo: 26B → 26.4)
Segmento = tuple[tuple[float, float], tuple[float, float]]

_TIPOS = {
    "cl": "calle",
    "calle": "calle",
    "cra": "carrera",
    "cr": "carrera",
    "kr": "carrera",
    "carrera": "carrera",
}
_NUMERO = r"\d+(?:\s*[A-Za-z](?![a-z]))?(?:\s*Bis)?"
_DIRECCION = re.compile(
    rf"^(Cra|Cr|Kr|Cl|Calle|Carrera)\.?\s+({_NUMERO})\s*(?:#|No\.?|N°|con)\s*"
    rf"(?:(?:Cl|Calle|Cra|Cr|Kr|Carrera)\.?\s+)?({_NUMERO})(?:\s*-\s*(\d+))?",
    re.I,
)


def numero(texto: str) -> float | None:
    """«26» → 26, «26 Bis» → 26.1, «26A» → 26.2, «26B» → 26.4 (el orden de la nomenclatura)."""
    m = re.match(r"^(\d+)\s*(bis)?\s*([a-z])?\s*(bis)?$", texto.strip().lower())
    if not m:
        return None
    extra = 0.1 if (m.group(2) or m.group(4)) else 0.0
    if m.group(3):
        extra += 0.2 * (ord(m.group(3)) - ord("a") + 1)
    return int(m.group(1)) + min(extra, 0.9)


def texto_numero(n: float) -> str:
    """Inverso de `numero`: 26.1 → «26 Bis», 26.4 → «26B»."""
    entero, resto = int(n), round(n - int(n), 1)
    bis = " Bis" if round(resto * 10) % 2 == 1 else ""
    letra = round((resto - (0.1 if bis else 0)) / 0.2)
    return f"{entero}{chr(ord('A') + letra - 1) if letra else ''}{bis}"


def via_de_nombre(nombre: str) -> Via | None:
    m = re.match(r"^(Calle|Carrera)\s+(.+)$", nombre.strip(), re.I)
    if not m:
        return None
    n = numero(m.group(2))
    return (m.group(1).lower(), n) if n is not None else None


def _metros(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(
        (a[0] - b[0]) * 110_574, (a[1] - b[1]) * 111_320 * math.cos(math.radians(a[0]))
    )


def _cruce(s1: Segmento, s2: Segmento) -> tuple[float, float] | None:
    (p1, p2), (p3, p4) = s1, s2
    det = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0])
    if abs(det) < 1e-14:
        return None
    t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / det
    u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / det
    if -TOLERANCIA <= t <= 1 + TOLERANCIA and -TOLERANCIA <= u <= 1 + TOLERANCIA:
        return (p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1]))
    return None


class Nomenclatura:
    def __init__(self, vias: Iterable[tuple[str, list[list[float]]]]) -> None:
        self.tramos: dict[Via, list[Segmento]] = {}
        for nombre, geometria in vias:
            via = via_de_nombre(nombre)
            puntos = [(p[0], p[1]) for p in geometria]
            if via and len(puntos) > 1:
                self.tramos.setdefault(via, []).extend(pairwise(puntos))

    def _cruces(
        self, via: Via, otro_tipo: str, cerca: tuple[float, float] | None
    ) -> list[tuple[float, tuple[float, float]]]:
        """Dónde cruza `via` a cada vía del otro tipo: [(número, punto)], la más cercana al barrio."""
        propios = [
            s
            for s in self.tramos.get(via, [])
            if cerca is None or _metros(s[0], cerca) <= RADIO_BARRIO_M
        ]
        mejor: dict[float, tuple[float, float]] = {}
        for (tipo, n), segmentos in self.tramos.items():
            if tipo != otro_tipo:
                continue
            for s1 in propios:
                for s2 in segmentos:
                    p = _cruce(s1, s2)
                    if p and (
                        n not in mejor or (cerca and _metros(p, cerca) < _metros(mejor[n], cerca))
                    ):
                        mejor[n] = p
        return sorted(mejor.items())

    def ubicar(self, direccion: str, cerca: Punto | None = None) -> tuple[Punto, str] | None:
        """Devuelve el punto aproximado y cómo se obtuvo, o None si no alcanza la información."""
        m = _DIRECCION.match(direccion.strip())
        if not m:
            return None
        tipo_a = _TIPOS[m.group(1).lower()]
        tipo_b = "calle" if tipo_a == "carrera" else "carrera"
        n_a, n_b = numero(m.group(2)), numero(m.group(3))
        if n_a is None or n_b is None or (tipo_a, n_a) not in self.tramos:
            return None
        centro = (cerca.lat, cerca.lng) if cerca else None
        cruces = self._cruces((tipo_a, n_a), tipo_b, centro)
        if not cruces:
            return None

        exacto = [p for n, p in cruces if abs(n - n_b) < 1e-6]
        nombre_a = f"{tipo_a} {m.group(2).strip()}"
        if exacto:
            base, como = exacto[0], f"esquina de la {nombre_a} con {tipo_b} {m.group(3).strip()}"
        else:
            antes = [(n, p) for n, p in cruces if n < n_b]
            despues = [(n, p) for n, p in cruces if n > n_b]
            if not antes or not despues or despues[0][0] - antes[-1][0] > HUECO_MAXIMO:
                return None
            (n1, p1), (n2, p2) = antes[-1], despues[0]
            t = (n_b - n1) / (n2 - n1)
            base = (p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1]))
            como = (
                f"sobre la {nombre_a}, entre la {tipo_b} {texto_numero(n1)} y la {texto_numero(n2)}"
            )

        # Los metros de la placa se cuentan desde la esquina hacia la siguiente vía.
        placa = int(m.group(4) or 0)
        siguientes = [p for n, p in cruces if n > n_b]
        if placa and siguientes and _metros(base, siguientes[0]) > 5:
            t = min(placa / _metros(base, siguientes[0]), 0.9)
            base = (
                base[0] + t * (siguientes[0][0] - base[0]),
                base[1] + t * (siguientes[0][1] - base[1]),
            )
            como += f", {placa} m adelante"
        if centro and _metros(base, centro) > RADIO_BARRIO_M + 500:
            return None
        return Punto(lat=round(base[0], 6), lng=round(base[1], 6)), como


@lru_cache(maxsize=1)
def cargar() -> Nomenclatura | None:
    """Las calles de Pereira (≈1 MB); None si el archivo no está."""
    if not DATOS.exists():
        return None
    with gzip.open(DATOS, "rt", encoding="utf-8") as f:
        datos = json.load(f)
    return Nomenclatura((v["nombre"], v["g"]) for v in datos["vias"])
