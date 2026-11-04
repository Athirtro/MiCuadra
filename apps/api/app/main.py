import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from app.config import get_settings
from app.errors import registrar_manejadores
from app.routers import (
    admin,
    compartir,
    comunidad,
    cuenta,
    directorio,
    eventos,
    mandados,
    sistema,
)

API_PREFIX = "/api/v1"


def validar_database_url(url: str) -> None:
    """Falla al arrancar si DATABASE_URL está mal escrita (sin mostrarla: lleva la contraseña)."""
    try:
        make_url(url)
    except ArgumentError:
        raise RuntimeError(
            "DATABASE_URL no es válida. Debe verse así, en una sola línea y sin comillas: "
            "postgresql://usuario:contraseña@host:5432/postgres"
        ) from None


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    validar_database_url(settings.database_url)

    app = FastAPI(
        title="MiCuadra API",
        version=settings.version,
        description="El mapa vivo de tu cuadra — directorio hiperlocal y red de mandados.",
        docs_url=f"{API_PREFIX}/docs",
        openapi_url=f"{API_PREFIX}/openapi.json",
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    registrar_manejadores(app)

    for router in (
        sistema.router,
        cuenta.router,
        directorio.router,
        eventos.router,
        comunidad.router,
        compartir.router,
        admin.router,
        mandados.router,
    ):
        app.include_router(router, prefix=API_PREFIX)
    return app


app = create_app()
