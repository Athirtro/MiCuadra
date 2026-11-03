"""Genera un JWT de desarrollo firmado con SUPABASE_JWT_SECRET para un usuario del seed.

    uv run python scripts/firmar_token.py admin            # admin@demo.micuadra.co
    uv run python scripts/firmar_token.py mensajero1 --horas 8

Solo para dev/test: en staging/prod los tokens los emite Supabase Auth.
"""

import argparse
import sys
import time
from pathlib import Path

import jwt

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from scripts.seed import DOMINIO, _id


def firmar(clave: str, horas: float = 1, secreto: str | None = None) -> str:
    settings = get_settings()
    ahora = int(time.time())
    claims = {
        "sub": str(_id(f"usuario:{clave}")),
        "email": f"{clave}@{DOMINIO}",
        "aud": settings.supabase_jwt_audience,
        "role": "authenticated",
        "iat": ahora,
        "exp": ahora + int(horas * 3600),
    }
    return jwt.encode(claims, secreto or settings.supabase_jwt_secret, algorithm="HS256")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("usuario", help="admin, dueno1, vecino1, mensajero1, …")
    parser.add_argument("--horas", type=float, default=1)
    args = parser.parse_args()
    settings = get_settings()
    if settings.entorno not in ("dev", "test") or not settings.supabase_jwt_secret:
        sys.exit("Solo disponible en dev/test con SUPABASE_JWT_SECRET definido.")
    print(firmar(args.usuario, args.horas))
