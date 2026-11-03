"""Formato único de errores del API: `{ "error": { "codigo", "mensaje" } }` en español."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status_code: int, codigo: str, mensaje: str) -> None:
        super().__init__(mensaje)
        self.status_code = status_code
        self.codigo = codigo
        self.mensaje = mensaje


def cuerpo_error(codigo: str, mensaje: str) -> dict[str, dict[str, str]]:
    return {"error": {"codigo": codigo, "mensaje": mensaje}}


_CODIGOS_HTTP = {
    400: ("solicitud_invalida", "La solicitud no es válida."),
    401: ("no_autenticado", "Necesitas iniciar sesión."),
    403: ("sin_permiso", "No tienes permiso para hacer esto."),
    404: ("no_encontrado", "No encontramos lo que buscas."),
    405: ("metodo_no_permitido", "Método no permitido."),
    429: ("demasiadas_solicitudes", "Vas muy rápido. Intenta de nuevo en un momento."),
}


def registrar_manejadores(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content=cuerpo_error(exc.codigo, exc.mensaje)
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        codigo, mensaje = _CODIGOS_HTTP.get(exc.status_code, ("error", "Ocurrió un error."))
        return JSONResponse(
            status_code=exc.status_code,
            content=cuerpo_error(codigo, mensaje),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validacion(_: Request, exc: RequestValidationError) -> JSONResponse:
        campos = ", ".join(".".join(str(p) for p in e["loc"][1:]) for e in exc.errors())
        return JSONResponse(
            status_code=422,
            content=cuerpo_error("datos_invalidos", f"Revisa estos campos: {campos}."),
        )

    @app.exception_handler(Exception)
    async def _inesperado(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content=cuerpo_error("error_interno", "Algo salió mal. Intenta de nuevo."),
        )
