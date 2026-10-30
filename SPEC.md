# Instrucción maestra para Claude Code — MiCuadra

> Pega todo este documento en Claude Code (o guárdalo en la raíz del repo como `SPEC.md` y dile: "Lee SPEC.md y arranca por la Fase 0"). Los valores marcados con **[DEFAULT]** son decisiones propuestas que el equipo puede cambiar; están resumidas en la sección 14.

---

## 0. Tu rol y cómo debes trabajar

Eres el ingeniero principal de **MiCuadra**, una plataforma web (PWA, mobile‑first) para Pereira, Colombia. Vas a construir el producto completo, **por fases**, en un monorepo. Reglas de trabajo:

1. **Antes de escribir código**, lee esta especificación completa y, si existe, la carpeta de documentación del repo (`readme.md`, `micuadrav2.md`, `ideacion/`). Luego crea `CLAUDE.md` con: resumen del proyecto, stack, comandos (dev, test, lint, migraciones, seed), convenciones y estructura de carpetas. Mantén `CLAUDE.md` actualizado.
2. **Trabaja una fase a la vez** (sección 12). Al terminar cada fase: corre lint + tests, verifica los criterios de aceptación de esa fase uno por uno, haz commit y **detente** para que el equipo revise antes de seguir. No adelantes funcionalidades de fases posteriores salvo los *stubs* que esta especificación pide explícitamente.
3. **Commits pequeños y descriptivos** en español, un branch por fase (`fase-0-setup`, `fase-1-directorio`, …) y Pull Request por fase.
4. **Nunca subas secretos.** Usa `.env.example` documentado; los valores reales van en variables de entorno de Vercel / Supabase / el host del API.
5. Si algo de esta especificación es ambiguo o contradictorio, **elige la opción más simple que cumpla los criterios de aceptación**, déjala anotada en `docs/decisiones.md` (formato ADR corto) y sigue.
6. Toda la interfaz va **en español de Colombia, tuteando** ("Encuentra", "Pide", "Tu barrio"). Moneda COP con separador de miles con punto: `$2.000`.
7. Escribe código legible para un equipo de 3 estudiantes: tipado estricto, nombres en español para el dominio (`negocio`, `mandado`, `mensajero`) y en inglés para lo técnico (`service`, `router`, `hook`).

---

## 1. Visión del producto

**MiCuadra — "El mapa vivo de tu cuadra".**
*"Encuentra en segundos los negocios de tu barrio — y si no puedes salir, un vecino va por ti."*

MiCuadra combina dos capas **desacopladas**:

1. **Directorio hiperlocal (núcleo, gratis):** mapa interactivo de micronegocios de barrio (tiendas, panaderías, barberías, droguerías, fruver, papelerías, talleres, gimnasios, lavanderías, comida casera) con perfil, fotos, horarios y botón de WhatsApp. **Gratis para el negocio y para el usuario, siempre.**
2. **Red de mandados entre vecinos (capa enchufable):** un vecino o estudiante ("mensajero") recoge o compra el encargo en un negocio del directorio y lo lleva a otro vecino, dentro de un radio de **5–10 cuadras**. La plataforma cobra una **micro‑comisión por mandado completado**, pagada por quien pide. El negocio **nunca paga** por recibir mandados.

No es una app de domicilios industrial: no hay flotas, no hay optimización de rutas, no se cobra comisión al negocio. Es infraestructura comunitaria.

**Mercado inicial:** Pereira, Risaralda. Barrios piloto: **Cuba, Álamos, Boston, El Jardín** (alta densidad de micronegocios y cercanía a la Universidad Tecnológica de Pereira). Estratos 2–4. +80 % del tráfico llegará desde celulares Android de gama media con datos móviles: la app debe ser liviana.

**Equipo:** Kevin Esguerra (producto), Andrés Felipe Morales (mercado), Juan Sebastián Sánchez (crecimiento). Estudiantes de la UTP, presupuesto operativo **$0** al inicio: usa solo capas gratuitas.

---

## 2. Alcance

### 2.1 Dentro del alcance (todas las fases)
- Landing + lista de espera (migrada desde la landing actual).
- Directorio geoespacial con mapa, filtros, búsqueda, perfiles y WhatsApp.
- Registro *self‑service* de negocios con aprobación manual.
- Panel de administración interno.
- Medición de demanda (botón "Pedir mandado" deshabilitado que registra clics) y tablero de métricas del *gate*.
- Autenticación de vecinos, mensajeros, dueños de negocio y admins.
- Mandados Modalidad B (recoger y traer) y luego Modalidad A (cómpralo por mí).
- Calificaciones mutuas, incidencias, reputación del mensajero.
- Liquidación de comisiones (manual primero, pasarela de pagos después).
- Notificaciones de cambio de estado.
- Destacado pagado opcional para negocios (Fase 4).

### 2.2 Fuera del alcance del MVP
- App nativa (se evalúa en Fase 4; la PWA es suficiente).
- Optimización de rutas, rastreo GPS continuo del mensajero.
- Catálogo con inventario y carrito de compras por negocio.
- Reservas de turno (barberías/talleres): solo dejar el modelo preparado, se construye después de Fase 4.
- Expansión fuera de Pereira.

---

## 3. Roles de usuario

| Rol | Quién es | Qué puede hacer |
|---|---|---|
| `visitante` | Cualquiera, sin cuenta | Ver mapa, buscar, ver perfiles, contactar por WhatsApp, inscribirse en lista de espera, hacer clic en "Pedir mandado" (se registra) |
| `vecino` | Usuario registrado que pide mandados | Todo lo del visitante + crear/cancelar mandados, pagar, calificar al mensajero, ver historial, guardar direcciones y favoritos |
| `mensajero` | Vecino ≥ 18 años verificado por el equipo | Activar disponibilidad, ver mandados cercanos, aceptar, actualizar estado, subir foto de recibo, ver ingresos y su deuda de comisiones, calificar/reportar |
| `dueno` | Dueño o encargado de un negocio | Registrar su negocio, editar perfil, horarios, fotos, marcar "abierto ahora/cerrado hoy", ver estadísticas básicas, comprar destacado (Fase 4) |
| `admin` | Equipo MiCuadra | Aprobar/rechazar negocios y mensajeros, CRUD total, moderar reportes, ver métricas, configurar tarifas y barrios, registrar pagos de comisión, suspender cuentas |

Un mismo usuario puede tener varios roles (ej. vecino + mensajero). Implementa roles como un arreglo/tabla de roles, no como un único campo.

---

## 4. Stack técnico **[DEFAULT]**

Se respeta lo que ya definió el equipo en `micuadrav2.md`, priorizando costo $0 y pocas piezas:

| Capa | Elección | Notas |
|---|---|---|
| Frontend | **React 18 + Vite + TypeScript**, Tailwind CSS, React Router, TanStack Query | PWA con `vite-plugin-pwa` (instalable, caché del shell). Deploy en **Vercel Hobby** |
| Mapas | **Leaflet + react-leaflet + Leaflet.markercluster**, tiles OpenStreetMap | Sin API key. Respeta la política de uso de tiles OSM y muestra la atribución |
| Backend API | **FastAPI (Python 3.12)** + SQLAlchemy 2 + Alembic + Pydantic v2 | Deploy en Railway o Render (verificar la capa gratuita vigente; ver sección 14) |
| Base de datos | **Supabase Postgres + PostGIS** | Columnas `geography(Point,4326)` con índice GIST; consultas con `ST_DWithin` / `ST_Distance` |
| Auth | **Supabase Auth** | Fase 1: *magic link* por email para dueños. Fase 2: OTP por SMS/WhatsApp para vecinos y mensajeros (requiere proveedor pago, ver sección 14). El API valida el JWT de Supabase |
| Archivos | **Supabase Storage** | Fotos de negocios (máx. 5), fotos de recibos y de paquetes. Redimensionar en el cliente a ≤ 1280 px y WebP antes de subir |
| Tiempo real | Supabase Realtime (canales por mandado) | Para estados del mandado y lista de mandados disponibles |
| Pagos | Fase 2: liquidación manual (efectivo/Nequi) registrada en la app. Fase 3: **Wompi** (o Bold) | Todo detrás de la interfaz `PaymentService` |
| Notificaciones | Web Push (VAPID) + enlaces `wa.me` prellenados | SMS solo si hay presupuesto |
| Analítica | **Plausible o Umami** (gratis/self‑host) + tabla propia `eventos` | La tabla propia es la fuente de verdad para el *gate* |
| CI | GitHub Actions: lint, typecheck, tests en cada PR | `ruff` + `pytest` en API; `eslint` + `tsc` + `vitest` en web; Playwright para 3–5 flujos e2e críticos |

### Estructura del monorepo
```
/apps/web        → React + Vite (PWA)
/apps/api        → FastAPI
/packages/shared → tipos y constantes compartidas (categorías, estados, tarifas) generados desde el OpenAPI del API
/supabase        → migraciones SQL, políticas RLS, seed
/docs            → documentación existente del proyecto + decisiones.md
```

### Principio arquitectónico rector (obligatorio)
El directorio y los mandados son **dos capas desacopladas**. El directorio solo conoce interfaces:

```
DirectoryService
  └─ getNegocioDetail(id)
       └─ [hook] MandadoService.getDisponibilidad(negocioId)
                  Fase 1: MandadoStub → { disponible: false, razon: "proximamente" }
                  Fase 2: MandadoReal → { disponible: true, mensajerosActivos: N }

PaymentService.charge(mandadoId, monto)   Fase 1–2: ManualPayment   Fase 3: WompiPayment
NotificationService.send(usuarioId, evento) Push / WhatsApp link
```

Selecciona la implementación con *feature flags* en la tabla `config` o variables de entorno (`MANDADOS_ACTIVOS`, `MODALIDAD_A_ACTIVA`, `PAGOS_PROVEEDOR`). Cambiar de stub a real **no debe tocar** el código del directorio ni los contratos del API.

---

## 5. Identidad visual

Reutiliza la identidad de la landing actual (archivo `landing/micuadra-landing.html` / `index.html` del repo). Concepto: **plano de barrio** — manzanas como bloques de color, rutas punteadas de mandado, rótulos tipo letrero de tienda.

```css
/* claro */
--bg:#F2F4EE; --surface:#FFFFFF; --ink:#16261F; --muted:#53625A;
--line:#D5DCD2; --block:#E2E8DC; --green:#1E6B4E; --green-ink:#FFFFFF;
--sun:#F4B635; --sun-ink:#1B1A10; --red:#C8462F; --r:14px;
/* oscuro */
--bg:#0F1A15; --surface:#16241D; --ink:#E7EFE9; --muted:#9DB0A5;
--line:#2A3B33; --block:#1C2D25;
/* tipografía */
--display:"Archivo"; --body:"Atkinson Hyperlegible"; --mono:"JetBrains Mono";
```
Verde = hoja de café (acción principal), amarillo = letrero/mototaxi (destacados, mandados), rojo = pin. Soporta modo oscuro. Accesibilidad AA: contraste, foco visible, botones ≥ 44 px, todo usable con una mano.

---

## 6. Funcionalidades por módulo

### 6.1 Landing y lista de espera
- Portar la landing existente a una ruta `/` (o `/bienvenida` si el mapa queda en `/`) **[DEFAULT: mapa en `/`, landing en `/conoce`]**.
- Formulario: rol (vecino / negocio / mensajero), nombre, WhatsApp (celular colombiano 3XX, 10 dígitos), barrio (Cuba, Álamos, Boston, El Jardín, Otro), y si es negocio: nombre y tipo. Casilla obligatoria de autorización de tratamiento de datos (Ley 1581 de 2012).
- Guarda en `lista_espera`. Evita duplicados por WhatsApp + rol.
- Barra de metas visibles: negocios activos /40, vecinos semanales /200, mensajeros listos /15.

### 6.2 Directorio (mapa y búsqueda)
- Mapa centrado en la ubicación del usuario (geolocalización HTML5); si la niega o falla, selector de barrio piloto con su centroide.
- Marcadores por categoría (ícono + color) con *clustering*.
- Chips horizontales de categorías encima del mapa; búsqueda por texto (nombre, categoría, descripción) con `pg_trgm` o `tsvector` en español.
- Lista de resultados (panel inferior deslizable en móvil, lateral en escritorio): foto, nombre, categoría, distancia en cuadras y metros (1 cuadra ≈ 100 m **[DEFAULT]**), estado "Abierto ahora / Cerrado" calculado con los horarios y la zona `America/Bogota`.
- Filtro "Abierto ahora" y radio (5 / 10 cuadras).
- Negocios destacados (Fase 4) aparecen primero con distintivo amarillo, sin ocultar a los demás.

### 6.3 Perfil del negocio
- Carrusel de hasta 5 fotos, nombre, categoría, descripción (≤ 280 caracteres), dirección en texto + mini mapa, horarios por día (permitir 2 franjas por día y "cerrado"), teléfono.
- **Botón "Escribir por WhatsApp"**: `https://wa.me/57XXXXXXXXXX?text=Hola,%20te%20encontré%20en%20MiCuadra…` (registra evento `click_whatsapp`).
- **Botón "Cómo llegar"**: enlace a OSM / Google Maps con las coordenadas.
- **Botón "Pedir mandado"**: en Fase 1 visible pero en modo "Próximamente": al tocarlo registra evento `click_pedir_mandado` y abre un modal que invita a inscribirse en la lista de espera (y pregunta en una línea "¿Qué le habrías pedido?" para las entrevistas). En Fase 2 abre el flujo de mandado con el negocio preseleccionado. El estado sale de `GET /negocios/{id}/mandados-disponibles`.
- Botón "Reportar información incorrecta".
- Compartir perfil (Web Share API) con URL amigable `/n/{slug}` y metadatos Open Graph.

### 6.4 Registro y gestión de negocios (dueño)
- Formulario guiado en **4 pasos**: (1) datos básicos: nombre, categoría, WhatsApp, descripción; (2) ubicación: pin arrastrable en el mapa + dirección en texto; (3) fotos; (4) horarios. Barra de progreso, guardar borrador entre pasos, lenguaje sencillo, sin tecnicismos.
- El negocio queda en estado `pendiente` hasta que un admin lo aprueba. El dueño recibe aviso al aprobarse.
- El dueño entra con *magic link* y puede editar su perfil, marcar "Cerrado hoy", y ver estadísticas: vistas del perfil, clics en WhatsApp, clics en "Pedir mandado", mandados originados (Fase 2+), por semana.
- Un admin también puede crear negocios directamente (carga inicial asistida por el equipo, que visita los negocios en persona) y luego "invitar" al dueño a reclamarlo.

### 6.5 Panel de administración
- Acceso solo rol `admin`. Rutas bajo `/admin`.
- Negocios: lista con filtros por estado/barrio/categoría, edición rápida, aprobar/rechazar con motivo, activar/desactivar, carga masiva por CSV.
- Lista de espera: tabla, filtros, exportar CSV, marcar "contactado".
- Mensajeros: solicitudes, verificación (documento revisado en persona, mayor de edad), aprobar/suspender, nivel (B o A+B).
- Mandados (Fase 2+): lista en vivo, detalle, intervenir (cancelar, reasignar), incidencias.
- Liquidaciones: deuda de comisiones por mensajero, registrar pago recibido.
- Reportes de usuarios: cola de moderación.
- Configuración: tarifas, porcentaje de comisión, radio máximo, barrios (nombre + polígono o centroide), categorías, *feature flags*.
- **Tablero del gate** (sección 9) con semáforo por criterio.

### 6.6 Autenticación y perfiles
- Fase 1: *magic link* por email (dueños y admins).
- Fase 2: OTP por celular para vecinos y mensajeros (Supabase Auth con proveedor SMS) **o**, si no hay presupuesto, email + verificación del WhatsApp por el equipo. Ver sección 14.
- Perfil de vecino: nombre, celular, direcciones guardadas (alias, texto, punto en el mapa, barrio, indicaciones como "casa esquinera reja verde").
- Perfil de mensajero: foto, nombre, barrios de cobertura, medio (a pie / bici / moto), calificación promedio, mandados completados, nivel.
- Términos y condiciones y política de privacidad (Ley 1581): el mensajero es independiente, no empleado; la plataforma conecta, no transporta.

### 6.7 Mandados — Modalidad B "Recoger y traer" (primero)
El vecino ya pagó en el negocio (presencial, teléfono o WhatsApp) y necesita que alguien lo recoja.
1. Vecino crea mandado: negocio origen (del directorio, autocompletado, o "otro lugar" con pin), dirección de entrega (guardada o nueva), descripción del paquete, a nombre de quién está, foto opcional, nota.
2. El sistema calcula distancia (origen → destino) y muestra la **tarifa exacta antes de confirmar**. Rechaza si supera el radio máximo.
3. Se publica a mensajeros activos dentro del radio del negocio origen (notificación push).
4. El primer mensajero que acepta lo toma (bloqueo optimista; los demás ven "ya fue tomado").
5. Estados: `creado → aceptado → recogido → en_camino → entregado` + `cancelado` / `expirado` / `con_incidencia`.
6. El mensajero puede abrir chat por WhatsApp con el vecino (enlace `wa.me`; no construir chat propio en MVP).
7. Al entregar: el vecino confirma recepción (o se autoconfirma a los 30 min si no reporta problema **[DEFAULT]**), paga la tarifa y ambos se califican.

### 6.8 Mandados — Modalidad A "Cómpralo por mí" (después)
Se activa con el flag `MODALIDAD_A_ACTIVA` y solo para mensajeros de nivel A.
1. Vecino indica negocio, lista de productos (texto libre, ítems) y **presupuesto máximo** (tope inicial $50.000 **[DEFAULT]**).
2. Mensajero acepta y puede confirmar disponibilidad (o proponer sustitutos por WhatsApp).
3. Mensajero compra con su dinero (adelanto) y **sube foto del recibo obligatoria** con el valor real antes de poder marcar `en_camino`. El valor real no puede superar el presupuesto máximo.
4. Al entregar, el vecino paga: **valor real de los productos + tarifa del mandado**. El mensajero recupera su adelanto.
5. Estados: igual que B, con `comprado` en lugar de `recogido`.

### 6.9 Calificaciones, confianza e incidencias
- Calificación 1–5 estrellas + comentario opcional, mutua (vecino → mensajero, mensajero → vecino).
- Incidencias: "no lo encontré", "producto equivocado", "no me pagaron", "nunca llegó", "comportamiento inadecuado". Pasan a la cola del admin.
- Reputación: promedio móvil de las últimas 20 calificaciones.

### 6.10 Pagos y liquidación
- **Fase 2 (manual):** el vecino paga al mensajero en efectivo o Nequi/Daviplata al entregar. La app registra la tarifa y genera un movimiento en el **libro de comisiones**: el mensajero le debe a MiCuadra la comisión de plataforma. El admin registra los pagos semanales del mensajero. Si la deuda supera $20.000 **[DEFAULT]**, el mensajero no puede aceptar nuevos mandados hasta ponerse al día.
- **Fase 3 (Wompi):** el vecino paga en la app (Nequi, PSE, tarjeta) al confirmar entrega; webhook firmado actualiza el pago; la plataforma retiene su comisión y acumula el neto en la billetera del mensajero para retiro semanal. Ambiente sandbox primero.
- Todos los montos en **enteros de pesos** (sin decimales). Nunca `float` para dinero.

### 6.11 Notificaciones
- Web Push para: mandado nuevo cerca (mensajero), aceptado / recogido / en camino / entregado (vecino), negocio aprobado (dueño).
- En cada pantalla de estado, botón de respaldo "Avisar por WhatsApp" con texto prellenado.

### 6.12 Destacado para negocios (Fase 4)
- Plan opcional **$15.000–$25.000/mes** **[DEFAULT: $20.000]**: aparece primero en su categoría y radio, distintivo amarillo, estadísticas ampliadas. Pago con Wompi; vencimiento automático.
- Nunca condiciona la aparición en el directorio ni la recepción de mandados.

---

## 7. Reglas de negocio (comisiones y operación)

Todas las cifras viven en la tabla `config` y se editan desde el admin. Las marcadas **[DEFAULT]** son propuestas.

### 7.1 Radio y distancias
- Radio máximo de un mandado (origen → destino): **1.000 m ≈ 10 cuadras** **[DEFAULT]**.
- Un mensajero ve mandados cuyo negocio origen está a ≤ 1.000 m de su última ubicación reportada o dentro de sus barrios de cobertura.
- Distancia: línea recta con PostGIS × factor 1,3 para aproximar recorrido urbano **[DEFAULT]**.

### 7.2 Tarifa Modalidad B (transporte puro) — la paga el vecino
| Distancia estimada | Tarifa al vecino |
|---|---|
| ≤ 400 m (≈ 4 cuadras) | $1.500 |
| 401–700 m (≈ 5–7 cuadras) | $2.000 |
| 701–1.000 m (≈ 8–10 cuadras) | $3.000 |

### 7.3 Tarifa Modalidad A (compra delegada) — la paga el vecino
- `tarifa = max($2.000, redondear_a_100(porcentaje × valor_real_productos))`, con porcentaje **10 %** **[DEFAULT, rango permitido 8–12 %]**.
- Antes de confirmar se muestra la tarifa estimada sobre el presupuesto máximo; al cerrar se recalcula sobre el valor real del recibo.
- Total que paga el vecino = valor real de productos + tarifa.

### 7.4 Reparto de la tarifa
- **Comisión de plataforma = 20 % de la tarifa, redondeada a $100** **[DEFAULT]**; el resto es para el mensajero. Ejemplos: tarifa $1.500 → plataforma $300, mensajero $1.200; tarifa $3.000 → plataforma $600, mensajero $2.400. (Coincide con el ingreso neto de $1.200–$2.500 por trayecto que plantea la documentación.)
- El valor de los productos (Modalidad A) va 100 % al mensajero que los adelantó; la plataforma nunca toma comisión sobre la venta del negocio.
- **El negocio nunca paga** comisión por mandados ni por aparecer en el directorio.

### 7.5 Ciclo de vida y tiempos
- Mandado sin aceptar en **15 min** → `expirado`; se avisa al vecino con opción de republicar.
- Cancelación por el vecino: gratis antes de `recogido`/`comprado`. Después, en Modalidad A, el vecino debe pagar el producto ya comprado + tarifa completa; en Modalidad B, paga 50 % de la tarifa **[DEFAULT]**.
- Cancelación por el mensajero después de aceptar: vuelve a publicarse; tres cancelaciones en 7 días → suspensión temporal de 48 h **[DEFAULT]**.
- Un mensajero puede tener **máximo 2 mandados activos** a la vez **[DEFAULT]**.
- Autoconfirmación de entrega a los 30 min si el vecino no reporta incidencia.

### 7.6 Confianza y niveles de mensajero
- Requisitos para ser mensajero: ≥ 18 años, celular verificado, documento revisado por el equipo, aceptar términos.
- Nivel inicial: solo Modalidad B.
- Sube a nivel A (puede hacer compras delegadas) con **≥ 10 mandados B completados y calificación ≥ 4,5** **[DEFAULT]** + aprobación del admin.
- Calificación < 3,5 con ≥ 10 mandados → revisión y posible suspensión.

### 7.7 Directorio
- Gratis, sin límite de tiempo, para cualquier negocio con local fijo en Pereira.
- Negocio nuevo → `pendiente` hasta aprobación manual (Fases 1–3). En Fase 4 se abre la autovalidación (geolocalización + moderación por reportes).
- Máximo 5 fotos; descripción ≤ 280 caracteres.

---

## 8. Modelo de datos

Usa PostgreSQL con PostGIS. Claves `uuid`, `created_at`/`updated_at` en todas las tablas, borrado lógico donde aplique, montos en `integer` (COP). Activa Row Level Security en Supabase aunque el acceso principal sea vía API.

```
usuarios(id ↔ auth.users.id, nombre, celular, email, foto_url, acepta_datos_at, estado[activo|suspendido], created_at)
usuario_roles(usuario_id, rol[vecino|mensajero|dueno|admin])

barrios(id, nombre, ciudad='Pereira', centroide geography(Point), poligono geography(Polygon) null, es_piloto bool)
categorias(id, slug, nombre, icono, color, orden, activa)

negocios(id, slug único, nombre, categoria_id, descripcion, whatsapp, telefono,
         direccion_texto, barrio_id, ubicacion geography(Point,4326) [índice GIST],
         estado[borrador|pendiente|activo|rechazado|inactivo], motivo_rechazo,
         dueno_id null, creado_por_admin bool, cerrado_hoy_fecha date null,
         destacado_hasta timestamptz null, created_at, updated_at)
negocio_fotos(id, negocio_id, url, orden)
negocio_horarios(id, negocio_id, dia_semana 0-6, abre time, cierra time)   -- varias franjas por día

lista_espera(id, rol[vecino|negocio|mensajero], nombre, whatsapp, barrio_texto, barrio_id null,
             negocio_nombre null, negocio_tipo null, que_pediria null, contactado bool, created_at)
             -- único (whatsapp, rol)

eventos(id, tipo[vista_perfil|click_whatsapp|click_pedir_mandado|click_como_llegar|busqueda|sesion],
        negocio_id null, usuario_id null, anon_id, metadata jsonb, created_at)  -- índice (tipo, created_at)

mensajeros(usuario_id PK, estado[solicitud|aprobado|suspendido], nivel[B|AB], medio[pie|bici|moto],
           disponible bool, ultima_ubicacion geography(Point) null, ultima_ubicacion_at,
           documento_verificado_at, verificado_por, calificacion_promedio numeric(2,1), mandados_completados int)
mensajero_barrios(mensajero_id, barrio_id)

direcciones(id, usuario_id, alias, texto, indicaciones, ubicacion geography(Point), barrio_id)

mandados(id, codigo corto legible, modalidad[A|B], vecino_id, mensajero_id null,
         negocio_id null, origen_texto, origen geography(Point),
         destino_direccion_id, destino geography(Point), distancia_m int,
         descripcion, items jsonb null, presupuesto_max int null, valor_productos int null,
         recibo_foto_url null, paquete_foto_url null,
         tarifa int, comision_plataforma int, neto_mensajero int,
         estado[creado|aceptado|recogido|comprado|en_camino|entregado|cancelado|expirado|con_incidencia],
         cancelado_por null, motivo_cancelacion null, metodo_pago[efectivo|nequi|wompi],
         expira_at, aceptado_at, entregado_at, confirmado_at, created_at)
mandado_eventos(id, mandado_id, estado_anterior, estado_nuevo, actor_id, nota, created_at)  -- historial auditable

calificaciones(id, mandado_id, de_usuario_id, a_usuario_id, estrellas 1-5, comentario, created_at)  -- único (mandado_id, de_usuario_id)
incidencias(id, mandado_id null, negocio_id null, reportado_por, tipo, descripcion, estado[abierta|resuelta|descartada], resuelta_por, created_at)

movimientos(id, mensajero_id, mandado_id null, tipo[comision_debida|pago_comision|neto_ganado|retiro], monto int, nota, registrado_por, created_at)
pagos(id, mandado_id null, negocio_id null, proveedor[manual|wompi], referencia_externa, monto, estado[pendiente|aprobado|rechazado], payload jsonb, created_at)
destacados(id, negocio_id, desde, hasta, monto, pago_id)

config(clave PK, valor jsonb, actualizado_por, updated_at)   -- tarifas, porcentajes, radio, flags
```

Las transiciones de estado del mandado se validan en **un solo lugar** (máquina de estados en el servicio) y cada transición escribe en `mandado_eventos`. Calcula `tarifa`, `comision_plataforma` y `neto_mensajero` en el servidor, nunca en el cliente.

### Datos de prueba (seed)
- 4 barrios piloto (Cuba, Álamos, Boston, El Jardín) con centroides **aproximados, marcados para verificar** por el equipo.
- 10 categorías: tienda, panadería, barbería, droguería, fruver, papelería, taller, gimnasio, lavandería, comida casera.
- 45 negocios ficticios repartidos en los 4 barrios y ≥ 5 categorías, con fotos de marcador de posición y horarios realistas. Prefijo "[DEMO]" en el nombre para poder borrarlos con un comando (`make seed-clean`).
- 1 admin, 3 dueños, 5 vecinos, 5 mensajeros (2 de nivel AB) para probar mandados.

---

## 9. Métricas y gate antes de activar mandados

Implementa el tablero en `/admin/metricas`. Los mandados (Fase 2) **solo se activan** cuando el equipo confirme que se cumplen simultáneamente:

| # | Criterio | Meta | Fuente |
|---|---|---|---|
| 1 | Adopción | ≥ 200 sesiones únicas/semana, 3 semanas seguidas | `eventos.tipo=sesion` por `anon_id` |
| 2 | Retención | ≥ 25 % vuelve la semana siguiente a su primera visita | cohortes semanales sobre `eventos` |
| 3 | Demanda de mandados | ≥ 40 clics en "Pedir mandado" en 2 semanas | `eventos.tipo=click_pedir_mandado` |
| 4 | Validación cualitativa | ≥ 10 entrevistas confirmando intención | registro manual en admin (contador + notas) |
| 5 | Oferta | ≥ 15 mensajeros en lista de espera | `lista_espera.rol=mensajero` |
| 6 | Cobertura | ≥ 40 negocios activos, ≥ 3 categorías | `negocios.estado=activo` |

Muestra cada criterio con valor actual, meta y semáforo. El `anon_id` es un identificador aleatorio en `localStorage` (sin datos personales); respeta "No rastrear" si el navegador lo indica.

---

## 10. API REST (contratos)

Prefijo `/api/v1`. OpenAPI generado por FastAPI; los tipos del frontend se generan desde ahí. Errores con formato `{ "error": { "codigo", "mensaje" } }` en español.

**Públicos**
- `GET /categorias`
- `GET /barrios`
- `GET /negocios?lat&lng&radio_m=1000&categoria&q&abierto_ahora&limit&cursor` → ordenados por destacado y distancia, con `distancia_m` y `abierto_ahora`.
- `GET /negocios/{id_o_slug}`
- `GET /negocios/{id}/mandados-disponibles` → Fase 1: `{ "disponible": false, "razon": "proximamente" }`; Fase 2: `{ "disponible": true, "mensajeros_activos": N, "tarifa_desde": 1500 }`. **El contrato no cambia entre fases.**
- `POST /eventos` (con *rate limit*)
- `POST /lista-espera`
- `POST /negocios/{id}/reportes`

**Dueño**
- `POST /mis-negocios` · `PATCH /mis-negocios/{id}` · `POST /mis-negocios/{id}/fotos` · `PUT /mis-negocios/{id}/horarios` · `GET /mis-negocios/{id}/estadisticas`

**Vecino (Fase 2+)**
- `GET/POST/PATCH/DELETE /direcciones`
- `POST /mandados/cotizar` → tarifa y distancia sin crear
- `POST /mandados` · `GET /mandados?rol=vecino` · `GET /mandados/{id}` · `POST /mandados/{id}/cancelar` · `POST /mandados/{id}/confirmar-entrega` · `POST /mandados/{id}/calificar` · `POST /mandados/{id}/incidencias`

**Mensajero (Fase 2+)**
- `POST /mensajeros/solicitud` · `PATCH /mensajeros/yo` (disponible, ubicación, barrios)
- `GET /mandados/disponibles` · `POST /mandados/{id}/aceptar` · `POST /mandados/{id}/estado` (recogido/comprado/en_camino/entregado, con foto de recibo cuando aplique)
- `GET /mensajeros/yo/movimientos`

**Pagos (Fase 3)**
- `POST /pagos/mandados/{id}` → crea transacción Wompi · `POST /webhooks/wompi` (verifica firma, idempotente)

**Admin**
- CRUD completo bajo `/admin/*`: negocios (aprobar/rechazar, CSV), lista de espera (CSV), mensajeros, mandados, incidencias, movimientos, config, métricas.

Mientras `MANDADOS_ACTIVOS=false`, los endpoints de mandados responden `501 Not Implemented` con `{ "error": { "codigo": "proximamente" } }`, salvo `mandados-disponibles`.

---

## 11. Pantallas

**Públicas / vecino**
1. Mapa del barrio (home): mapa, chips de categoría, buscador, botón "mi ubicación", panel de resultados.
2. Resultados en lista / búsqueda.
3. Perfil del negocio.
4. Modal "Próximamente" del botón Pedir mandado (Fase 1).
5. Landing "Conoce MiCuadra" + lista de espera.
6. Entrar (magic link / OTP).
7. Crear mandado: elegir modalidad → negocio → qué recoger o qué comprar + presupuesto → dirección → resumen con tarifa → confirmar.
8. Seguimiento del mandado (línea de estados en vivo, datos del mensajero, botón WhatsApp, cancelar).
9. Confirmar entrega + pagar + calificar.
10. Mis mandados (historial).
11. Mi perfil y direcciones guardadas.
12. Términos, privacidad y ayuda (preguntas frecuentes).

**Dueño**
13. Registro de negocio en 4 pasos.
14. Mi negocio: editar perfil, horarios, fotos, "Cerrado hoy".
15. Estadísticas del negocio.
16. Destacar mi negocio (Fase 4).

**Mensajero**
17. Quiero ser mensajero (solicitud).
18. Panel del mensajero: interruptor "Disponible", mandados cercanos (lista + mapa), activos.
19. Detalle del mandado para el mensajero (aceptar, avanzar estado, subir recibo).
20. Mis ingresos, comisiones adeudadas y pagos.

**Admin**
21. Tablero de métricas (gate).
22. Negocios (cola de aprobación, lista, edición, CSV).
23. Lista de espera.
24. Mensajeros (solicitudes, verificación, niveles).
25. Mandados en vivo e incidencias.
26. Liquidaciones.
27. Configuración (tarifas, flags, barrios, categorías).

Estados vacíos, de carga y de error diseñados en cada pantalla (ej. "Todavía no hay negocios en esta cuadra. ¿Conoces uno? Agrégalo").

---

## 12. Fases de construcción y criterios de aceptación

### Fase 0 — Setup (semanas 1–2)
- Monorepo, `CLAUDE.md`, `.env.example`, `docs/decisiones.md`, README de arranque local.
- Proyecto Supabase con PostGIS, migraciones iniciales, RLS base, seed.
- API FastAPI con healthcheck, auth por JWT de Supabase, interfaces `MandadoService`, `PaymentService`, `NotificationService` con sus stubs.
- Web React + Vite + Tailwind + tokens de marca + PWA vacía.
- CI en GitHub Actions; ambientes dev / staging / prod.

**Aceptación:** `make dev` (o `pnpm dev` + `uvicorn`) levanta todo en local con datos de seed · CI verde en un PR de prueba · `GET /api/v1/health` responde en staging · el stub de mandados está conectado y probado.

### Fase 1 — Directorio + medición de demanda (semanas 3–8)
- Módulos 6.1 a 6.5, eventos y tablero del gate.

**Aceptación:**
- Desde un celular Android de gama media en 4G, el mapa con 50 negocios carga en < 3 s (Lighthouse móvil ≥ 85 en rendimiento y ≥ 95 en accesibilidad).
- `GET /negocios` filtra por radio y categoría y devuelve ordenado por distancia (test con PostGIS real, incluido el caso borde del radio).
- "Abierto ahora" es correcto con hora de Bogotá, incluidas franjas partidas y "cerrado hoy" (tests unitarios).
- Un dueño completa el registro de 4 pasos desde el celular en < 5 min, el negocio queda `pendiente`, el admin lo aprueba y aparece en el mapa.
- El botón "Pedir mandado" registra `click_pedir_mandado` y el tablero lo cuenta.
- La lista de espera guarda, evita duplicados y exporta CSV.
- El tablero del gate muestra los 6 criterios con datos reales.
- Producción desplegada con dominio y HTTPS.

### Fase 2 — Mandados Modalidad B con liquidación manual (semanas 9–14)
**Requisito de entrada:** el equipo confirma el gate (sección 9). Hasta entonces se queda en Fase 1 y se itera en crecimiento.
- Auth de vecinos y mensajeros, solicitud y verificación de mensajeros, crear/aceptar/seguir/entregar/calificar mandados B, expiración, cancelaciones, incidencias, libro de comisiones manual, Web Push.

**Aceptación:**
- Prueba e2e (Playwright) de punta a punta: vecino crea mandado B → mensajero cercano lo ve en < 5 s → acepta → avanza estados → vecino confirma, califica → se crea `comision_debida` correcta.
- Dos mensajeros aceptando a la vez: solo uno gana (test de concurrencia).
- Tarifas de la tabla 7.2 aplicadas en servidor; un mandado fuera del radio se rechaza.
- Expiración a los 15 min y autoconfirmación a los 30 min funcionando (job programado).
- Un mensajero con deuda > tope no puede aceptar.
- El directorio sigue funcionando igual y su código no cambió (solo se cambió la implementación detrás de la interfaz).

### Fase 3 — Modalidad A + pagos en línea (semanas 15–18)
- Niveles de mensajero, flujo de compra delegada con recibo obligatorio, integración Wompi (sandbox → producción), billetera del mensajero y retiros semanales registrados.

**Aceptación:**
- No se puede marcar `en_camino` en Modalidad A sin foto de recibo y valor ≤ presupuesto.
- Tarifa A = max($2.000, 10 % del valor real) redondeada a $100 (tests con casos borde).
- Webhook de Wompi verifica firma, es idempotente y deja el pago en el estado correcto.
- Un mensajero de nivel B no ve mandados A.

### Fase 4 — Crecimiento y monetización avanzada (semana 19+)
- Destacado pagado, estadísticas ampliadas para negocios, autovalidación de negocios con moderación por reportes, SEO local (páginas por barrio y categoría: `/pereira/cuba/panaderias`), nuevos barrios desde el admin.

**Aceptación:** un negocio compra destacado, aparece primero con distintivo y vence solo; las páginas por barrio son indexables (HTML con metadatos y sitemap).

---

## 13. Requisitos no funcionales

- **Rendimiento:** bundle inicial < 200 KB gzip; imágenes WebP con *lazy loading*; respuestas del API < 300 ms p95 para búsquedas.
- **Offline básico:** el shell y el último mapa consultado se ven sin conexión; formularios avisan si no hay red.
- **Seguridad:** validación en servidor de todo, *rate limiting* en endpoints públicos, CORS restringido, URLs firmadas para fotos de recibos (privadas), RLS en Supabase, sin datos personales en logs, dependencias auditadas en CI.
- **Privacidad (Ley 1581 de 2012):** consentimiento explícito, política de tratamiento de datos, opción de borrar la cuenta y los datos; el celular del vecino solo se muestra al mensajero asignado mientras el mandado está activo.
- **Observabilidad:** logs estructurados, Sentry (capa gratuita) en web y API.
- **Calidad:** cobertura ≥ 70 % en servicios de dominio (tarifas, máquina de estados, horarios, distancia).

---

## 14. Decisiones abiertas (propuesta por defecto entre corchetes)

El equipo debe confirmar o cambiar estas decisiones; mientras tanto, usa el default:

1. **Backend:** FastAPI (Python) vs Express (Node). **[FastAPI, como dice el badge del repo]**. Alternativa más simple: solo Supabase (Postgres + RLS + Edge Functions) sin API propia.
2. **Hosting del API:** Railway ya no tiene capa gratuita permanente (verificar condiciones actuales); alternativas Render free o Fly.io. **[Render free, aceptando el arranque en frío]**.
3. **Reparto de la tarifa:** la documentación dice que la comisión es la tarifa completa, pero también que el mensajero gana $1.200–$2.500 netos. **[20 % plataforma / 80 % mensajero]**.
4. **Tabla exacta de tarifas B por distancia y porcentaje de A.** **[$1.500 / $2.000 / $3.000 y 10 %]**.
5. **Login de vecinos y mensajeros:** OTP por SMS cuesta dinero (Twilio u otro proveedor). **[email + verificación manual del WhatsApp en Fase 2; OTP SMS cuando haya presupuesto]**.
6. **Pasarela:** Wompi vs Bold. **[Wompi]**; requiere RUT/cuenta a nombre de alguien del equipo.
7. **Repositorio:** construir dentro de `Athirtro/micuadra` (moviendo los .md a `/docs`) o en un repo nuevo. **[mismo repo, docs en `/docs`]**.
8. **Dominio:** **[micuadra.co o subdominio de Vercel mientras tanto]**.
9. **Coordenadas y límites de los barrios piloto:** el equipo debe validarlos en terreno.
10. **Topes:** presupuesto máximo A ($50.000), deuda máxima del mensajero ($20.000), mandados simultáneos (2).

---

## 15. Primer paso

Confirma que leíste todo, resume en 10 líneas lo que vas a construir, lista cualquier contradicción que veas, y luego ejecuta la **Fase 0**. Al terminarla, muéstrame cómo correrlo en local y qué criterios de aceptación verificaste.
