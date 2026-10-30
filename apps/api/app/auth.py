"""Validación del JWT que emite Supabase Auth y carga de roles desde `usuario_roles`."""

from collections.abc import Callable
from functools import lru_cache
from typing import Annotated, Literal
from uuid import UUID

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.errors import ApiError

Rol = Literal["vecino", "mensajero", "dueno", "admin"]

_bearer = HTTPBearer(auto_error=False)


class UsuarioActual(BaseModel):
    id: UUID
    email: str | None
    roles: list[Rol]


@lru_cache
def _jwks_client(supabase_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json")


def decodificar_token(token: str, settings: Settings) -> dict[str, object]:
    try:
        if settings.supabase_jwt_secret:
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience=settings.supabase_jwt_audience,
            )
        if not settings.supabase_url:
            raise ApiError(500, "auth_no_configurada", "La autenticación no está configurada.")
        llave = _jwks_client(settings.supabase_url).get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            llave.key,
            algorithms=["ES256", "RS256"],
            audience=settings.supabase_jwt_audience,
        )
    except jwt.ExpiredSignatureError as e:
        raise ApiError(401, "sesion_expirada", "Tu sesión expiró. Vuelve a entrar.") from e
    except jwt.PyJWTError as e:
        raise ApiError(401, "token_invalido", "No pudimos validar tu sesión.") from e


def get_usuario_actual(
    credenciales: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
    db: Annotated[Session, Depends(get_db)],
) -> UsuarioActual:
    if credenciales is None:
        raise ApiError(401, "no_autenticado", "Necesitas iniciar sesión.")
    claims = decodificar_token(credenciales.credentials, settings)
    usuario_id = UUID(str(claims["sub"]))

    estado = db.execute(
        text("select estado from usuarios where id = :id"), {"id": usuario_id}
    ).scalar_one_or_none()
    if estado == "suspendido":
        raise ApiError(403, "cuenta_suspendida", "Tu cuenta está suspendida.")

    roles = (
        db.execute(
            text("select rol from usuario_roles where usuario_id = :id order by rol"),
            {"id": usuario_id},
        )
        .scalars()
        .all()
    )
    email = claims.get("email")
    return UsuarioActual(id=usuario_id, email=str(email) if email else None, roles=list(roles))


def requiere_rol(*roles: Rol) -> Callable[[UsuarioActual], UsuarioActual]:
    """Dependencia: `Depends(requiere_rol("admin"))`."""

    def _verificar(
        usuario: Annotated[UsuarioActual, Depends(get_usuario_actual)],
    ) -> UsuarioActual:
        if not set(roles) & set(usuario.roles):
            raise ApiError(403, "sin_permiso", "No tienes permiso para hacer esto.")
        return usuario

    return _verificar
