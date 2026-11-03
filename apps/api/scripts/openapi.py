"""Escribe el OpenAPI del API en JSON sin levantar el servidor (para generar tipos de la web).

uv run python scripts/openapi.py ../../packages/shared/openapi.json
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import create_app

destino = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("openapi.json")
destino.write_text(json.dumps(create_app().openapi(), ensure_ascii=False, indent=2) + "\n")
print(f"✓ OpenAPI escrito en {destino}")
