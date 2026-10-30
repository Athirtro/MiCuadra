"""Datos de prueba [DEMO] (SPEC.md §8): 45 negocios en los 4 barrios piloto y usuarios de
prueba (1 admin, 3 dueños, 5 vecinos, 5 mensajeros — 2 de nivel AB).

Todo es determinista (mismos ids en cada corrida) e idempotente. Los negocios llevan el
prefijo "[DEMO]" y los usuarios el dominio @demo.micuadra.co para borrarlos con `seed-clean`.
"""

import math
import random
import unicodedata
from uuid import NAMESPACE_URL, UUID, uuid5

import psycopg

PREFIJO = "[DEMO] "
DOMINIO = "demo.micuadra.co"

# Nombres típicos por categoría (sin marcas reales).
NOMBRES: dict[str, list[str]] = {
    "tienda": [
        "Tienda Doña Rosa",
        "Granero El Progreso",
        "Tienda La Esquina",
        "Autoservicio Mi Barrio",
        "Tienda Don Chepe",
        "Minimercado La 30",
    ],
    "panaderia": [
        "Panadería El Trigal",
        "Pan de Yuca La Abuela",
        "Panadería Pandebono Caliente",
        "Panificadora San Jorge",
        "Panadería La Espiga",
    ],
    "barberia": [
        "Barbería El Parche",
        "Barber Shop Los Primos",
        "Peluquería y Barbería Estilo",
        "Barbería Don Fredy",
    ],
    "drogueria": [
        "Droguería Salud Total Barrio",
        "Droguería La Economía",
        "Droguería Mi Familia",
        "Farmacia La 14",
    ],
    "fruver": [
        "Fruver La Cosecha",
        "Frutas y Verduras El Campesino",
        "Fruver Don Arcesio",
        "Surtifruver La Huerta",
        "Fruver El Edén",
    ],
    "papeleria": [
        "Papelería El Lápiz",
        "Papelería y Fotocopias UTP",
        "Miscelánea La Pluma",
        "Papelería Sur",
    ],
    "taller": [
        "Taller de Motos El Rayo",
        "Montallantas La 30",
        "Taller de Bicis Pedalea",
        "Cerrajería y Taller Don Lucho",
    ],
    "gimnasio": ["Gimnasio Fuerza Cuba", "Gym El Barrio Fit", "Centro de Acondicionamiento Álamos"],
    "lavanderia": ["Lavandería Burbujas", "Lavaseco La Mancha", "Lavandería Express"],
    "comida-casera": [
        "Almuerzos Doña Marta",
        "Empanadas La Gorda",
        "Arepas de Choclo El Fogón",
        "Fritanga Donde Lucho",
        "Corrientazo La Sazón",
        "Comidas Rápidas La Noche",
        "Tamales Doña Gloria",
    ],
}

DESCRIPCIONES: dict[str, str] = {
    "tienda": "Abarrotes, gaseosas, huevos y lo del diario. Fiamos a los vecinos de siempre.",
    "panaderia": "Pan recién horneado desde la madrugada, pandebono, buñuelos y tinto.",
    "barberia": "Cortes clásicos y modernos, barba y cejas. Atendemos por orden de llegada.",
    "drogueria": "Medicamentos, aseo personal y productos para bebé. Inyectología.",
    "fruver": "Frutas y verduras frescas traídas del campo risaraldense cada mañana.",
    "papeleria": "Fotocopias, impresiones, útiles escolares y trabajos para la universidad.",
    "taller": "Arreglos rápidos, despinchada y mantenimiento. Precios justos.",
    "gimnasio": "Máquinas, pesas y clases grupales. Mensualidad y tiquetera.",
    "lavanderia": "Lavado por kilo, planchado y lavado de cobijas y tenis.",
    "comida-casera": "Comida hecha en casa como la de la abuela. Pide por WhatsApp.",
}

# (días, franjas). Días: 0 = domingo … 6 = sábado. Una franja con cierre < apertura cruza la medianoche.
LUN_SAB = [1, 2, 3, 4, 5, 6]
LUN_VIE = [1, 2, 3, 4, 5]
TODOS = [0, 1, 2, 3, 4, 5, 6]
HORARIOS: dict[str, list[tuple[list[int], list[tuple[str, str]]]]] = {
    "tienda": [(TODOS, [("06:00", "21:30")])],
    "panaderia": [(TODOS, [("05:30", "20:00")])],
    "barberia": [(LUN_SAB, [("09:00", "12:30"), ("14:00", "19:30")])],
    "drogueria": [(LUN_SAB, [("07:00", "22:00")]), ([0], [("08:00", "14:00")])],
    "fruver": [(LUN_SAB, [("06:00", "19:00")]), ([0], [("07:00", "13:00")])],
    "papeleria": [(LUN_VIE, [("08:00", "12:00"), ("14:00", "18:30")]), ([6], [("08:00", "13:00")])],
    "taller": [(LUN_VIE, [("08:00", "12:00"), ("13:30", "17:30")]), ([6], [("08:00", "12:00")])],
    "gimnasio": [(LUN_VIE, [("05:00", "10:00"), ("16:00", "21:00")]), ([6], [("07:00", "12:00")])],
    "lavanderia": [(LUN_SAB, [("08:00", "18:00")])],
    "comida-casera": [(LUN_SAB, [("11:30", "15:00")]), ([5, 6], [("18:00", "01:00")])],
}

BARRIOS = ["cuba", "alamos", "boston", "el-jardin"]


def _id(clave: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"micuadra-demo:{clave}")


def _slug(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return "-".join("".join(c if c.isalnum() else " " for c in sin_tildes.lower()).split())


def _cerca(rng: random.Random, lng: float, lat: float, max_m: float) -> tuple[float, float]:
    """Punto aleatorio a ≤ max_m metros del centro."""
    r = max_m * math.sqrt(rng.random())
    angulo = rng.random() * 2 * math.pi
    dlat = (r * math.cos(angulo)) / 110_574
    dlng = (r * math.sin(angulo)) / (111_320 * math.cos(math.radians(lat)))
    return round(lng + dlng, 6), round(lat + dlat, 6)


def _celular(rng: random.Random) -> str:
    return (
        "3"
        + rng.choice(["00", "01", "10", "11", "12", "13", "14", "15", "16", "17", "20"])
        + "".join(str(rng.randint(0, 9)) for _ in range(7))
    )


def _usuario(
    conn: psycopg.Connection, clave: str, nombre: str, celular: str, roles: list[str]
) -> UUID:
    uid = _id(f"usuario:{clave}")
    email = f"{clave}@{DOMINIO}"
    conn.execute(
        "insert into auth.users (id, email, aud, role) values (%s, %s, 'authenticated', 'authenticated')"
        " on conflict (id) do nothing",
        (uid, email),
    )
    # El trigger de auth crea la fila en `usuarios`; aquí se completa.
    conn.execute(
        "insert into usuarios (id, email) values (%s, %s) on conflict (id) do nothing", (uid, email)
    )
    conn.execute(
        "update usuarios set nombre = %s, celular = %s, acepta_datos_at = coalesce(acepta_datos_at, now())"
        " where id = %s",
        (nombre, celular, uid),
    )
    for rol in roles:
        conn.execute(
            "insert into usuario_roles (usuario_id, rol) values (%s, %s) on conflict do nothing",
            (uid, rol),
        )
    return uid


def sembrar(conn: psycopg.Connection) -> None:
    rng = random.Random(20261030)
    barrios = {
        slug: (bid, lng, lat)
        for slug, bid, lng, lat in conn.execute(
            "select slug, id, st_x(centroide::geometry), st_y(centroide::geometry) from barrios"
        )
    }
    categorias = dict(conn.execute("select slug, id from categorias").fetchall())
    faltan = [b for b in BARRIOS if b not in barrios]
    if faltan:
        raise SystemExit(f"Faltan barrios {faltan}: corre primero `db.py migrar`.")

    # ── Usuarios ──
    admin = _usuario(conn, "admin", "Admin MiCuadra", _celular(rng), ["admin"])
    duenos = [
        _usuario(conn, f"dueno{i}", n, _celular(rng), ["dueno"])
        for i, n in enumerate(["Rosa Gómez", "Fredy Ospina", "Marta Cardona"], start=1)
    ]
    vecinos = [
        _usuario(conn, f"vecino{i}", n, _celular(rng), ["vecino"])
        for i, n in enumerate(
            [
                "Laura Restrepo",
                "Camilo Arias",
                "Valentina Henao",
                "Santiago Marín",
                "Daniela López",
            ],
            start=1,
        )
    ]
    mensajeros = [
        _usuario(conn, f"mensajero{i}", n, _celular(rng), ["vecino", "mensajero"])
        for i, n in enumerate(
            ["Juan Pablo Ríos", "Sara Osorio", "Mateo Valencia", "Isabela Duque", "Andrés Giraldo"],
            start=1,
        )
    ]

    for i, vid in enumerate(vecinos):
        bslug = BARRIOS[i % len(BARRIOS)]
        bid, lng, lat = barrios[bslug]
        plng, plat = _cerca(rng, lng, lat, 300)
        conn.execute(
            "insert into direcciones (id, usuario_id, alias, texto, indicaciones, ubicacion, barrio_id)"
            " values (%s, %s, 'Casa', %s, %s, st_point(%s, %s, 4326)::geography, %s)"
            " on conflict (id) do nothing",
            (
                _id(f"direccion:{vid}"),
                vid,
                f"Calle {rng.randint(10, 90)} # {rng.randint(1, 40)}-{rng.randint(1, 99)}",
                "Casa esquinera, reja verde",
                plng,
                plat,
                bid,
            ),
        )

    for i, mid in enumerate(mensajeros):
        bslug = BARRIOS[i % len(BARRIOS)]
        bid, lng, lat = barrios[bslug]
        plng, plat = _cerca(rng, lng, lat, 300)
        conn.execute(
            "insert into mensajeros (usuario_id, estado, nivel, medio, disponible, ultima_ubicacion,"
            " ultima_ubicacion_at, documento_verificado_at, verificado_por, calificacion_promedio,"
            " mandados_completados)"
            " values (%s, 'aprobado', %s, %s, %s, st_point(%s, %s, 4326)::geography, now(), now(), %s, %s, %s)"
            " on conflict (usuario_id) do nothing",
            (
                mid,
                "AB" if i < 2 else "B",
                ["pie", "bici", "moto"][i % 3],
                i % 2 == 0,
                plng,
                plat,
                admin,
                4.8 if i < 2 else None,
                14 if i < 2 else 0,
            ),
        )
        conn.execute(
            "insert into mensajero_barrios (mensajero_id, barrio_id) values (%s, %s) on conflict do nothing",
            (mid, bid),
        )

    # ── Negocios: 45 repartidos en los 4 barrios y las 10 categorías ──
    pares = [(cat, nombre) for cat, nombres in NOMBRES.items() for nombre in nombres]
    rng.shuffle(pares)
    for i, (cat, nombre) in enumerate(pares[:45]):
        bslug = BARRIOS[i % len(BARRIOS)]
        bid, lng, lat = barrios[bslug]
        plng, plat = _cerca(rng, lng, lat, 450)
        nid = _id(f"negocio:{nombre}")
        estado = "pendiente" if i >= 42 else "activo"  # 42 activos (gate ≥ 40) + 3 en la cola
        dueno = duenos[i] if i < len(duenos) else None
        conn.execute(
            "insert into negocios (id, slug, nombre, categoria_id, descripcion, whatsapp, direccion_texto,"
            " barrio_id, ubicacion, estado, dueno_id, creado_por_admin)"
            " values (%s, %s, %s, %s, %s, %s, %s, %s, st_point(%s, %s, 4326)::geography, %s, %s, %s)"
            " on conflict (id) do nothing",
            (
                nid,
                "demo-" + _slug(f"{nombre} {bslug}"),
                PREFIJO + nombre,
                categorias[cat],
                DESCRIPCIONES[cat],
                _celular(rng),
                f"Carrera {rng.randint(5, 30)} # {rng.randint(10, 80)}-{rng.randint(1, 99)}",
                bid,
                plng,
                plat,
                estado,
                dueno,
                dueno is None,
            ),
        )
        if (
            conn.execute(
                "select count(*) from negocio_horarios where negocio_id = %s", (nid,)
            ).fetchone()[0]
            == 0
        ):
            for dias, franjas in HORARIOS[cat]:
                for dia in dias:
                    for abre, cierra in franjas:
                        conn.execute(
                            "insert into negocio_horarios (negocio_id, dia_semana, abre, cierra)"
                            " values (%s, %s, %s, %s)",
                            (nid, dia, abre, cierra),
                        )
        texto = _slug(nombre).replace("-", "+")
        for orden in range(rng.randint(1, 3)):
            conn.execute(
                "insert into negocio_fotos (negocio_id, url, orden) values (%s, %s, %s)"
                " on conflict (negocio_id, orden) do nothing",
                (nid, f"https://placehold.co/800x600/E2E8DC/16261F/webp?text={texto}", orden),
            )

    conn.commit()
    total = conn.execute(
        "select count(*) filter (where estado = 'activo'), count(*) from negocios where nombre like %s",
        (PREFIJO + "%",),
    ).fetchone()
    print(f"✓ Seed listo: {total[1]} negocios demo ({total[0]} activos), 14 usuarios demo")


def limpiar(conn: psycopg.Connection) -> None:
    n = conn.execute("delete from negocios where nombre like %s", (PREFIJO + "%",)).rowcount
    u = conn.execute("delete from auth.users where email like %s", (f"%@{DOMINIO}",)).rowcount
    conn.commit()
    print(f"✓ Borrados {n} negocios y {u} usuarios demo")
