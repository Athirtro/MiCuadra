"""Configuración del API leída de variables de entorno (ver .env.example en la raíz)."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    entorno: Literal["dev", "test", "staging", "prod"] = "dev"
    version: str = "0.1.0"

    database_url: str = "postgresql+psycopg://localhost:5432/micuadra"

    # Auth de Supabase. Con SUPABASE_JWT_SECRET se validan tokens HS256 (secreto legado
    # y entorno local); si está vacío se usan las llaves públicas (JWKS) del proyecto.
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_jwt_audience: str = "authenticated"

    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    # URL pública de la web (enlaces al compartir). Vacía → el primer origen https de CORS.
    sitio_url: str = ""

    # Feature flags (sección 4 de SPEC.md). En Fase 2+ también podrán leerse de la tabla `config`.
    mandados_activos: bool = False
    modalidad_a_activa: bool = False
    pagos_proveedor: Literal["manual", "wompi"] = "manual"

    @field_validator("database_url")
    @classmethod
    def usar_driver_psycopg(cls, v: str) -> str:
        # Tolera espacios y comillas que se cuelan al pegar la URL en un panel.
        v = v.strip().strip("'\"").strip()
        # Supabase y Render entregan `postgres://` o `postgresql://`; SQLAlchemy necesita el driver.
        for prefijo in ("postgres://", "postgresql://"):
            if v.startswith(prefijo):
                return "postgresql+psycopg://" + v.removeprefix(prefijo)
        return v

    @field_validator("cors_origins", mode="before")
    @classmethod
    def separar_origenes(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def url_web(self) -> str:
        if self.sitio_url:
            return self.sitio_url.rstrip("/")
        https = [o for o in self.cors_origins if o.startswith("https://")]
        return (https or self.cors_origins or ["http://localhost:5173"])[0].rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
