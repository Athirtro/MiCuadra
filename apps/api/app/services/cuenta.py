"""Perfil del usuario y registro de negocios por parte de su dueño."""

import secrets
import unicodedata
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.schemas.cuenta import Foto, MiNegocio, NegocioEntrada, Perfil, PerfilEntrada
from app.schemas.directorio import BarrioCorto

# Un negocio nuevo queda en el barrio piloto más cercano si está a menos de esta distancia.
RADIO_BARRIO_M = 2000
MAX_NEGOCIOS_POR_DUENO = 5
MAX_FOTOS = 5
BUCKET_FOTOS = "negocio-fotos"


def slugificar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return "-".join("".join(c if c.isalnum() else " " for c in sin_tildes.lower()).split())[:60]


def obtener_perfil(db: Session, usuario_id: UUID, email: str | None) -> Perfil:
    fila = (
        db.execute(
            text(
                "select u.nombre, u.celular, u.foto_url, u.email, u.perfil_completo_at,"
                " b.slug as barrio_slug, b.nombre as barrio_nombre"
                " from usuarios u left join barrios b on b.id = u.barrio_id where u.id = :id"
            ),
            {"id": usuario_id},
        )
        .mappings()
        .one_or_none()
    )
    if fila is None:
        # El trigger de auth crea la fila; si aún no existe (carrera al registrarse), se crea aquí.
        db.execute(
            text("insert into usuarios (id, email) values (:id, :email) on conflict do nothing"),
            {"id": usuario_id, "email": email},
        )
        db.execute(
            text(
                "insert into usuario_roles (usuario_id, rol) values (:id, 'vecino')"
                " on conflict do nothing"
            ),
            {"id": usuario_id},
        )
        db.commit()
        return obtener_perfil(db, usuario_id, email)

    roles = (
        db.execute(
            text("select rol from usuario_roles where usuario_id = :id order by rol"),
            {"id": usuario_id},
        )
        .scalars()
        .all()
    )
    return Perfil(
        id=usuario_id,
        email=fila["email"] or email,
        nombre=fila["nombre"],
        celular=fila["celular"],
        foto_url=fila["foto_url"],
        barrio=BarrioCorto(slug=fila["barrio_slug"], nombre=fila["barrio_nombre"])
        if fila["barrio_slug"]
        else None,
        roles=list(roles),
        perfil_completo=fila["perfil_completo_at"] is not None,
    )


def guardar_perfil(
    db: Session, usuario_id: UUID, email: str | None, datos: PerfilEntrada
) -> Perfil:
    barrio_id = None
    if datos.barrio:
        barrio_id = db.execute(
            text("select id from barrios where slug = :slug"), {"slug": datos.barrio}
        ).scalar_one_or_none()
        if barrio_id is None:
            raise ApiError(422, "barrio_invalido", "Ese barrio no existe.")

    obtener_perfil(db, usuario_id, email)  # asegura que la fila exista
    db.execute(
        text(
            "update usuarios set nombre = :nombre, celular = :celular, barrio_id = :barrio,"
            " acepta_datos_at = coalesce(acepta_datos_at, now()),"
            " perfil_completo_at = coalesce(perfil_completo_at, now())"
            " where id = :id"
        ),
        {"id": usuario_id, "nombre": datos.nombre, "celular": datos.celular, "barrio": barrio_id},
    )
    if datos.tipo == "dueno":
        db.execute(
            text(
                "insert into usuario_roles (usuario_id, rol) values (:id, 'dueno') on conflict do nothing"
            ),
            {"id": usuario_id},
        )
    db.commit()
    return obtener_perfil(db, usuario_id, email)


def _slug_libre(db: Session, base: str) -> str:
    slug = base or "negocio"
    while db.execute(text("select 1 from negocios where slug = :s"), {"s": slug}).first():
        slug = f"{base}-{secrets.token_hex(2)}"
    return slug


def crear_negocio(db: Session, dueno_id: UUID, datos: NegocioEntrada) -> MiNegocio:
    total = db.execute(
        text("select count(*) from negocios where dueno_id = :id and deleted_at is null"),
        {"id": dueno_id},
    ).scalar_one()
    if total >= MAX_NEGOCIOS_POR_DUENO:
        raise ApiError(
            422,
            "limite_negocios",
            "Ya tienes muchos negocios registrados. Escríbenos si necesitas más.",
        )

    categoria_id = db.execute(
        text("select id from categorias where slug = :slug and activa"), {"slug": datos.categoria}
    ).scalar_one_or_none()
    if categoria_id is None:
        raise ApiError(422, "categoria_invalida", "Elige una categoría de la lista.")

    punto = {"lat": datos.ubicacion.lat, "lng": datos.ubicacion.lng}
    barrio = (
        db.execute(
            text(
                "select id, slug from barrios"
                " where st_dwithin(centroide, st_point(:lng, :lat, 4326)::geography, :radio)"
                " order by st_distance(centroide, st_point(:lng, :lat, 4326)::geography) limit 1"
            ),
            {**punto, "radio": RADIO_BARRIO_M},
        )
        .mappings()
        .one_or_none()
    )
    slug = _slug_libre(db, slugificar(f"{datos.nombre} {barrio['slug'] if barrio else 'pereira'}"))

    negocio_id = db.execute(
        text(
            "insert into negocios (slug, nombre, categoria_id, descripcion, whatsapp, telefono,"
            " direccion_texto, barrio_id, ubicacion, estado, dueno_id, creado_por_admin)"
            " values (:slug, :nombre, :categoria, :descripcion, :whatsapp, :telefono, :direccion,"
            " :barrio, st_point(:lng, :lat, 4326)::geography, 'pendiente', :dueno, false)"
            " returning id"
        ),
        {
            **punto,
            "slug": slug,
            "nombre": datos.nombre,
            "categoria": categoria_id,
            "descripcion": datos.descripcion or None,
            "whatsapp": datos.whatsapp,
            "telefono": datos.telefono or None,
            "direccion": datos.direccion_texto,
            "barrio": barrio["id"] if barrio else None,
            "dueno": dueno_id,
        },
    ).scalar_one()
    for h in datos.horarios:
        db.execute(
            text(
                "insert into negocio_horarios (negocio_id, dia_semana, abre, cierra)"
                " values (:id, :dia, cast(:abre as time), cast(:cierra as time))"
            ),
            {"id": negocio_id, "dia": h.dia_semana, "abre": h.abre, "cierra": h.cierra},
        )
    db.commit()
    return next(n for n in listar_mis_negocios(db, dueno_id) if n.id == negocio_id)


def listar_mis_negocios(db: Session, dueno_id: UUID) -> list[MiNegocio]:
    filas = (
        db.execute(
            text(
                "select n.id, n.slug, n.nombre, n.estado, n.motivo_rechazo, c.slug as categoria,"
                " b.slug as barrio_slug, b.nombre as barrio_nombre"
                " from negocios n join categorias c on c.id = n.categoria_id"
                " left join barrios b on b.id = n.barrio_id"
                " where n.dueno_id = :id and n.deleted_at is null order by n.created_at desc"
            ),
            {"id": dueno_id},
        )
        .mappings()
        .all()
    )
    return [
        MiNegocio(
            id=f["id"],
            slug=f["slug"],
            nombre=f["nombre"],
            estado=f["estado"],
            motivo_rechazo=f["motivo_rechazo"],
            categoria=f["categoria"],
            barrio=BarrioCorto(slug=f["barrio_slug"], nombre=f["barrio_nombre"])
            if f["barrio_slug"]
            else None,
        )
        for f in filas
    ]


def _verificar_dueno(db: Session, negocio_id: UUID, usuario_id: UUID, es_admin: bool) -> None:
    dueno = db.execute(
        text("select dueno_id from negocios where id = :id and deleted_at is null"),
        {"id": negocio_id},
    ).first()
    if dueno is None or (dueno[0] != usuario_id and not es_admin):
        raise ApiError(404, "negocio_no_encontrado", "No encontramos ese negocio entre los tuyos.")


def prefijo_fotos(supabase_url: str, negocio_id: UUID) -> str:
    return f"{supabase_url.rstrip('/')}/storage/v1/object/public/{BUCKET_FOTOS}/{negocio_id}/"


def listar_fotos(db: Session, negocio_id: UUID, usuario_id: UUID, es_admin: bool) -> list[Foto]:
    _verificar_dueno(db, negocio_id, usuario_id, es_admin)
    filas = db.execute(
        text("select orden, url from negocio_fotos where negocio_id = :id order by orden"),
        {"id": negocio_id},
    ).mappings()
    return [Foto.model_validate(dict(f)) for f in filas]


def agregar_foto(
    db: Session, negocio_id: UUID, usuario_id: UUID, es_admin: bool, url: str, prefijo: str
) -> Foto:
    _verificar_dueno(db, negocio_id, usuario_id, es_admin)
    # Solo URLs del bucket de MiCuadra y de la carpeta de este negocio.
    if not url.startswith(prefijo) or "/" in url[len(prefijo) :] or ".." in url:
        raise ApiError(422, "foto_invalida", "Sube la foto desde MiCuadra.")
    ocupados = set(
        db.execute(
            text("select orden from negocio_fotos where negocio_id = :id"), {"id": negocio_id}
        ).scalars()
    )
    libres = [o for o in range(MAX_FOTOS) if o not in ocupados]
    if not libres:
        raise ApiError(422, "limite_fotos", f"Puedes tener hasta {MAX_FOTOS} fotos.")
    db.execute(
        text("insert into negocio_fotos (negocio_id, url, orden) values (:id, :url, :orden)"),
        {"id": negocio_id, "url": url, "orden": libres[0]},
    )
    db.commit()
    return Foto(orden=libres[0], url=url)


def borrar_foto(
    db: Session, negocio_id: UUID, usuario_id: UUID, es_admin: bool, orden: int
) -> None:
    _verificar_dueno(db, negocio_id, usuario_id, es_admin)
    borrada = db.execute(
        text("delete from negocio_fotos where negocio_id = :id and orden = :orden returning id"),
        {"id": negocio_id, "orden": orden},
    ).first()
    if borrada is None:
        raise ApiError(404, "no_encontrado", "Esa foto ya no existe.")
    db.commit()
