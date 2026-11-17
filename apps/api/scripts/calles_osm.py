"""Baja de OpenStreetMap las calles y carreras de Pereira para ubicar direcciones sin Google.

    uv run python scripts/calles_osm.py

Escribe `app/data/calles_pereira.json.gz` (se commitea). Volver a correrlo de vez en cuando trae
las calles que la comunidad de OpenStreetMap haya agregado. Datos © colaboradores de
OpenStreetMap, licencia ODbL (la atribución ya va en el mapa de la web).
"""

import gzip
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

# Pereira urbana (con margen). Dosquebradas queda al norte del río Otún y fuera de este recuadro.
CAJA = (4.760, -75.770, 4.850, -75.640)
SERVIDORES = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
SALIDA = Path(__file__).resolve().parent.parent / "app" / "data" / "calles_pereira.json.gz"


def _bajar_caja(s: float, o: float, n: float, e: float) -> list[dict[str, object]]:
    consulta = (
        f'[out:json][timeout:90];way["highway"]["name"~"^(Calle|Carrera)"]({s},{o},{n},{e});'
        "out tags geom;"
    )
    datos = urllib.parse.urlencode({"data": consulta}).encode()
    for intento in range(2):
        for servidor in SERVIDORES:
            try:
                pedido = urllib.request.Request(
                    servidor,
                    data=datos,
                    headers={"User-Agent": "MiCuadra/0.1 (directorio barrial, Pereira)"},
                )
                with urllib.request.urlopen(pedido, timeout=150) as r:
                    return json.load(r)["elements"]  # type: ignore[no-any-return]
            except (OSError, ValueError, KeyError) as error:
                print(f"✗ {servidor} (intento {intento + 1}): {error}", file=sys.stderr)
                time.sleep(5)
    raise SystemExit("Ningún servidor de Overpass respondió; intenta más tarde.")


def bajar() -> list[dict[str, object]]:
    """En 2×2 partes: las consultas grandes se caen por tiempo en los servidores públicos."""
    s, o, n, e = CAJA
    mitad_lat, mitad_lng = (s + n) / 2, (o + e) / 2
    vistas: dict[object, dict[str, object]] = {}
    for caja in [
        (s, o, mitad_lat, mitad_lng),
        (s, mitad_lng, mitad_lat, e),
        (mitad_lat, o, n, mitad_lng),
        (mitad_lat, mitad_lng, n, e),
    ]:
        for w in _bajar_caja(*caja):
            vistas[w["id"]] = w  # un tramo que toca dos partes llega dos veces
        print(f"· {len(vistas)} tramos hasta ahora")
    return list(vistas.values())


def main() -> None:
    vias = []
    for w in bajar():
        nombre = str(w.get("tags", {}).get("name", "")).strip()  # type: ignore[union-attr]
        geometria = [[round(p["lat"], 6), round(p["lon"], 6)] for p in w.get("geometry", [])]  # type: ignore[union-attr]
        if nombre and len(geometria) > 1:
            vias.append({"nombre": nombre, "g": geometria})
    salida = {
        "fuente": "© colaboradores de OpenStreetMap (ODbL)",
        "fecha": datetime.now(UTC).date().isoformat(),
        "caja": CAJA,
        "vias": vias,
    }
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(SALIDA, "wt", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))
    print(f"✓ {len(vias)} tramos → {SALIDA} ({SALIDA.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
