"""Vista previa al compartir un negocio (Open Graph, SPEC §6.3).

La web es una SPA: WhatsApp, Facebook y compañía no ejecutan JavaScript. Vercel reescribe
`/n/{slug}` hacia aquí solo cuando quien pide es un robot de vista previa (ver `vercel.json`);
las personas siguen recibiendo la app normal."""

from html import escape
from typing import Annotated

from fastapi import APIRouter, Depends, Path
from fastapi.responses import HTMLResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db

router = APIRouter(tags=["compartir"])

_PLANTILLA = """<!doctype html>
<html lang="es-CO"><head><meta charset="utf-8">
<title>{titulo}</title>
<meta name="description" content="{descripcion}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MiCuadra">
<meta property="og:locale" content="es_CO">
<meta property="og:title" content="{titulo}">
<meta property="og:description" content="{descripcion}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{imagen}">
<meta name="twitter:card" content="{tarjeta}">
<link rel="canonical" href="{url}">
</head><body><h1>{titulo}</h1><p>{descripcion}</p><a href="{url}">Ver en MiCuadra</a></body></html>
"""


@router.get("/compartir/n/{slug}", response_class=HTMLResponse, include_in_schema=False)
def compartir_negocio(
    slug: Annotated[str, Path(max_length=80, pattern=r"^[a-z0-9-]+$")],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> HTMLResponse:
    web = settings.url_web
    fila = (
        db.execute(
            text(
                "select n.nombre, n.descripcion, c.nombre as categoria, b.nombre as barrio,"
                " (select url from negocio_fotos f where f.negocio_id = n.id"
                "  order by f.orden limit 1) as foto"
                " from negocios n join categorias c on c.id = n.categoria_id"
                " left join barrios b on b.id = n.barrio_id"
                " where n.slug = :slug and n.estado = 'activo' and n.deleted_at is null"
            ),
            {"slug": slug},
        )
        .mappings()
        .one_or_none()
    )
    if fila is None:
        titulo = "MiCuadra — El mapa vivo de tu cuadra"
        descripcion = "Encuentra en segundos los negocios de tu barrio en Pereira."
        foto = None
    else:
        lugar = f" en {fila['barrio']}" if fila["barrio"] else " en Pereira"
        titulo = f"{fila['nombre']} · {fila['categoria']}{lugar}"
        descripcion = fila["descripcion"] or f"Escríbele por WhatsApp desde MiCuadra{lugar}."
        foto = fila["foto"]
    html = _PLANTILLA.format(
        titulo=escape(titulo),
        descripcion=escape(descripcion),
        url=escape(f"{web}/n/{slug}"),
        imagen=escape(foto or f"{web}/icono-512.png"),
        tarjeta="summary_large_image" if foto else "summary",
    )
    return HTMLResponse(
        html,
        status_code=200 if fila else 404,
        headers={"Cache-Control": "public, max-age=600"},
    )
