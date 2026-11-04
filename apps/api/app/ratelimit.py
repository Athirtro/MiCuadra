"""Límite de solicitudes por IP en memoria (ventana deslizante).

Suficiente para una instancia de Render free. Si algún día hay varias instancias, pasar a
Redis o a un límite en la base de datos.
"""

import time
from collections import defaultdict, deque
from collections.abc import Callable
from threading import Lock

from fastapi import Request

from app.errors import ApiError


def ip_cliente(request: Request) -> str:
    # Render y Vercel ponen la IP real del cliente de primera en X-Forwarded-For.
    reenviada = request.headers.get("x-forwarded-for", "")
    if reenviada:
        return reenviada.split(",")[0].strip()
    return request.client.host if request.client else "desconocida"


def limite(maximo: int, por_segundos: float) -> Callable[[Request], None]:
    """Dependencia: `dependencies=[Depends(limite(60, 60))]` → 60 solicitudes por minuto."""
    visitas: dict[str, deque[float]] = defaultdict(deque)
    candado = Lock()

    def _verificar(request: Request) -> None:
        ahora = time.monotonic()
        ip = ip_cliente(request)
        with candado:
            cola = visitas[ip]
            while cola and ahora - cola[0] > por_segundos:
                cola.popleft()
            if len(cola) >= maximo:
                raise ApiError(
                    429, "demasiadas_solicitudes", "Vas muy rápido. Intenta de nuevo en un momento."
                )
            cola.append(ahora)

    return _verificar
