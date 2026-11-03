# Pivot — Modelo Híbrido: Directorio Hiperlocal + Red de Mandados

---

## 1. Descripción de la Plataforma

### Concepto Central

La plataforma indexa negocios de barrio —barberías, tiendas, talleres, panaderías, fruverías— con la misma lógica de mapa/categoría/cercanía de un directorio convencional, pero convierte cada búsqueda en un punto de entrada transaccional: el usuario no solo *encuentra* el negocio, puede pedirle a alguien del barrio que vaya por él. El motor de mandados no reemplaza al directorio; lo activa. El negocio gana visibilidad pasiva; el vecino/estudiante que quiere ingresos gana un canal de trabajo flexible; el usuario que no puede o no quiere salir obtiene el producto sin depender de una app de domicilios industrial.

La diferencia estructural frente a una app de domicilios tradicional es que la plataforma **no posee ni coordina flotas**: facilita la conexión entre el usuario que tiene una necesidad y el vecino que tiene tiempo, dentro de un radio máximo de 5-10 cuadras. La transacción es mínima, el radio es corto y la logística no requiere optimización de rutas.

### Las Dos Modalidades de Mandado

**Modalidad A — Mensajero como Comprador Delegado**

El usuario describe qué necesita y fija un presupuesto máximo. El mensajero va al negocio, compra los productos dentro del presupuesto indicado, paga con su propio dinero o con un adelanto acordado, y entrega. Al completar, se liquida el costo real de los productos más la comisión del mandado. Esta modalidad requiere confianza (ratings, historial) y funciona mejor para productos de bajo valor unitario: pan, frutas, aseo, encargos de tienda.

Flujo simplificado:
1. Usuario crea mandado: negocio destino (del directorio) + lista/presupuesto + dirección de entrega.
2. Mensajero cercano acepta y confirma disponibilidad del producto.
3. Mensajero compra, fotografía el ticket y entrega.
4. Plataforma descuenta comisión del pago total al cerrar el mandado.

**Modalidad B — Mensajero como Transportista Puro**

El usuario ya realizó la compra (en el negocio o telefónicamente) y necesita que alguien la recoja y lleve. El mensajero no maneja dinero del producto: solo cobra su tarifa de transporte. Esta modalidad elimina el riesgo de confianza monetaria y es viable desde el día 1, incluso sin historial del mensajero.

Flujo simplificado:
1. Usuario crea mandado: negocio origen (del directorio) + dirección de destino + descripción del paquete.
2. Mensajero acepta, recoge y entrega.
3. Plataforma cobra comisión fija al cierre.

La coexistencia de ambas modalidades permite a la plataforma escalar desde lo más simple (B, solo transporte) hacia lo más complejo (A, compra delegada) conforme maduran los mecanismos de confianza.

---

## 2. Modelo de Negocio y Ventaja Competitiva

### Monetización: Micro-Comisión por Mandado Completado

La plataforma cobra una comisión sobre cada mandado exitoso, no una suscripción mensual al negocio ni al usuario. Estructura sugerida:

| Modalidad | Tarifa sugerida | Quién paga |
|---|---|---|
| B (transporte puro) | $1.500–$3.000 COP fijos | Usuario que solicita |
| A (compra delegada) | 8–12% del valor del mandado, mín. $2.000 COP | Usuario que solicita |
| Destacado en directorio | $15.000–$25.000 COP/mes (opcional, no bloqueante) | Negocio |

El negocio **no necesita pagar nada** para aparecer en el directorio ni para recibir mandados a través de la plataforma. Esto elimina la fricción de adquisición del lado de la oferta: el negocio tiene incentivo de aparecer aunque nunca pague, porque los mandados le traen clientes reales.

### Por Qué Este Modelo Supera al SaaS/Mensualidad en Fricción, Adquisición e Ingresos

**Fricción de entrada:**
- SaaS: el negocio debe pagar antes de percibir valor. Requiere acto de fe.
- Comisión por mandado: el negocio nunca paga. El usuario paga solo cuando ya recibió el servicio. Fricción = 0 para ambos lados en la adopción inicial.

**Adquisición de usuarios:**
- SaaS: requiere convencer al tendero de que el directorio le traerá clientes suficientes para justificar $15k–$25k/mes. Difícil de demostrar sin masa crítica previa (paradoja del huevo y la gallina).
- Mandados: cada mandado completado es una prueba de valor en tiempo real para el negocio (recibió un cliente que no habría llegado de otra forma), para el mensajero (recibió ingreso) y para el usuario (recibió su encargo). Los tres lados del mercado se autoconstituyen mediante la transacción.

**Generación de ingresos inmediatos:**
- SaaS: ingresos en $0 hasta que se alcance masa crítica de negocios pagantes. Puede tardar 12–18 meses.
- Mandados: el primer ingreso ocurre con el primer mandado completado. Con 5 mandados/día a $2.000 COP de comisión promedio = $300k COP/mes desde semanas tempranas; escala directamente con volumen de transacciones, no con persuasión de suscripciones.

**Flywheel del modelo:**
Más negocios indexados → más mandados posibles → más mensajeros atraídos → tiempos de respuesta más bajos → más usuarios solicitan mandados → más negocios quieren aparecer → más negocios indexados.

**Alineación de incentivos:**
- Usuario: paga solo cuando recibe valor.
- Mensajero: gana por ejecución, no por tiempo de espera.
- Negocio: recibe clientes gratis; paga destacado solo si quiere visibilidad extra.
- Plataforma: ingresa por volumen de transacciones exitosas, alineado directamente con la satisfacción de los tres lados.

---

## 3. Hoja de Ruta Técnica y MVP Estratégico

### Principio Arquitectónico Rector

El sistema se construye en dos capas desacopladas desde el inicio:

- **Capa de Directorio (Núcleo):** indexación, búsqueda, perfiles. Funcional y desplegable sola.
- **Capa Transaccional (Enchufable):** mandados, pagos, mensajería en tiempo real. Se conecta sobre hooks/interfaces ya definidas, sin tocar el núcleo.

Este desacoplamiento permite lanzar el directorio sin esperar a que esté lista la lógica de mandados, y permite construir la lógica de mandados sin refactorizar el directorio.

### Etapas de Desarrollo

---

#### Etapa 0 — Definición y Setup (Semanas 1–2)

- Definición de entidades de datos: `Negocio`, `Categoría`, `Ubicación`, `Usuario`, `Mensajero`, `Mandado`.
- Diseño de la API REST con contratos de interfaz explícitos para los hooks transaccionales (endpoints que existen pero retornan `501 Not Implemented` hasta Etapa 2).
- Elección de stack definitivo con cero costo operativo:
  - Backend: FastAPI (Python) o Express (Node.js) en Railway Free.
  - BD: Supabase Free (PostgreSQL + PostGIS habilitado).
  - Frontend: React + Vite en Vercel Hobby.
  - Mapas: Leaflet.js + tiles OSM (gratuito, sin API key).
- Setup de repositorio, CI básico (GitHub Actions: lint + tests) y ambientes (dev / staging / prod).
- Definición de criterios de validación del MVP (ver sección 3.3).

---

#### Etapa 1 — MVP: Motor de Directorio (Semanas 3–8)

**Objetivo:** Directorio 100% funcional, desplegado en producción, con negocios reales cargados.

**Módulos:**

**1.1 — Gestión de Negocios (Admin/Interno)**
- CRUD de negocios con campos: nombre, categoría, coordenadas, horarios, fotos (hasta 5), descripción breve, teléfono/WhatsApp, activo/inactivo.
- Carga inicial manual por el equipo (primeros 30–50 negocios de 2–3 barrios piloto).
- Panel de administración mínimo (no público): lista, edición rápida, toggle activo.

**1.2 — API Geoespacial**
- Endpoint `GET /negocios?lat=&lng=&radio=&categoria=`: retorna negocios dentro del radio, ordenados por distancia.
- Índice espacial en PostgreSQL (ST_DWithin sobre columna `geography`).
- Endpoint `GET /negocios/:id`: detalle completo del negocio.
- Endpoint `GET /categorias`: lista plana de categorías con íconos.
- **Hook transaccional (stub):** `GET /negocios/:id/mandados-disponibles` → retorna `{ disponible: false, razon: "próximamente" }`. El frontend consume este endpoint desde ya; en Etapa 2 retornará datos reales sin cambiar el contrato.

**1.3 — Frontend de Búsqueda**
- Mapa Leaflet centrado en la ubicación del usuario (geolocalización HTML5 con fallback a coordenadas de barrio por defecto).
- Marcadores por categoría con clúster automático (Leaflet.markercluster).
- Panel lateral: lista de resultados con nombre, categoría, distancia y foto thumbnail.
- Filtro por categoría (chips horizontales sobre el mapa).
- Vista de perfil del negocio: fotos (carrusel), horarios, descripción, botón "Contactar por WhatsApp" (`wa.me/` link), botón "Pedir Mandado" (visible pero deshabilitado en Etapa 1; activo en Etapa 2).
- Diseño responsive mobile-first (el 80%+ del tráfico llegará desde móvil).

**1.4 — Registro de Negocios (Self-Service, Semana 6–8)**
- Formulario guiado en 4 pasos: datos básicos → ubicación en mapa (pin drag) → fotos → horarios.
- Validación: el negocio queda en estado `pendiente` hasta aprobación manual del equipo (anti-spam inicial).
- Sin autenticación compleja en Fase 1: magic link por WhatsApp o email para que el dueño edite su perfil.

**Arquitectura lógica del hook transaccional (definida en Etapa 1, implementada en Etapa 2):**

```
DirectoryService
  └─ getNegocioDetail(id)
       └─ [hook] mandadoService.getDisponibilidad(negocioId)
                  → Etapa 1: MandadoStub.getDisponibilidad() → { disponible: false }
                  → Etapa 2: MandadoReal.getDisponibilidad() → { disponible: true, mensajerosActivos: N }
```

El `DirectoryService` no conoce la implementación concreta; solo invoca la interfaz. El swap en Etapa 2 no toca el directorio.

---

#### Etapa 2 — Motor Transaccional: Mandados (Semanas 9–16)

**Condición de entrada:** Los criterios de validación del MVP (sección 3.3) deben estar cumplidos antes de iniciar esta etapa. Si no están cumplidos, se extiende Etapa 1.

**Módulos:**

**2.1 — Autenticación de Usuarios y Mensajeros**
- Auth por número de celular (OTP SMS vía Twilio o Supabase Auth con proveedor de SMS).
- Roles: `usuario`, `mensajero`, `admin`.
- Perfil de mensajero: foto, nombre, barrios de cobertura, calificación promedio, mandados completados.

**2.2 — Flujo de Mandado (Modalidad B — Primero)**
- Creación de mandado: negocio destino (del directorio, autocompletado) + dirección de entrega + descripción + foto opcional del producto a recoger.
- Estado del mandado: `creado → aceptado → en camino → entregado → cancelado`.
- Notificaciones push o SMS en cada cambio de estado (mínimo SMS para evitar dependencia de app nativa).
- Mensajero acepta/rechaza desde su vista móvil.
- Rating mutuo al cierre (usuario califica mensajero; mensajero puede marcar incidencias).

**2.3 — Flujo de Mandado (Modalidad A — Segunda)**
- Extensión del flujo B: campo adicional "presupuesto máximo" + confirmación de ticket (foto obligatoria antes de entregar).
- Lógica de adelanto: en Fase inicial, el mensajero pone el dinero y se le reembolsa al entregar (sin pasarela de pago compleja). En Fase posterior: integración PSE/Nequi para pago anticipado.

**2.4 — Pasarela de Pagos**
- Integración Wompi (Bancolombia) o Bold: ambas tienen API REST, documentación en español, soporte para Colombia y comisiones bajas (~2.9% + $900 COP por transacción).
- La interfaz de pago fue definida como hook en Etapa 1: `paymentService.charge(mandadoId, amount)`. El swap de stub a implementación real es transparente para el resto del sistema.
- Liquidación al mensajero: transferencia semanal o acumulación en wallet interno para retiro.

**2.5 — Panel del Mensajero**
- Dashboard: mandados disponibles cercanos, historial, ingresos acumulados, calificación.
- Mapa en tiempo real de mandados activos en su radio.

---

#### Etapa 3 — Crecimiento y Monetización Avanzada (Semana 17+)

- Apertura de registro de negocios sin aprobación manual (autovalidación por geolocalización + moderación por reporte).
- Planes de destacado para negocios (ahora sí hay tracción que justifica el pago).
- Analytics para negocios: cuántos mandados originados desde su perfil, zona de demanda, horarios pico.
- Expansión geográfica al Eje Cafetero completo.
- Evaluación de app nativa (React Native) basada en datos de uso móvil web.
- Módulo de reserva de turno (barberías, talleres): integra el mismo motor de slots sobre los perfiles ya existentes.

---

### 3.3 Criterios de Validación del MVP (Etapa 1) Antes de Invertir en Motor Transaccional

La Etapa 2 requiere significativamente más complejidad técnica (auth, estados de mandado, pagos, notificaciones en tiempo real, confianza entre extraños). Invertir en ella sin validar el directorio es el error más común en startups de dos lados: construir soluciones a problemas que nadie ha confirmado que tiene el volumen suficiente.

**Los siguientes criterios deben cumplirse simultáneamente antes de iniciar Etapa 2:**

| # | Criterio | Métrica mínima | Método de medición |
|---|---|---|---|
| 1 | **Adopción del directorio** | ≥ 200 sesiones únicas/semana sostenidas por 3 semanas | Google Analytics / Plausible (gratuito) |
| 2 | **Retención de usuarios** | ≥ 25% de usuarios retornan en la semana siguiente a su primera visita | Cohorte semana 1 vs semana 2 |
| 3 | **Engagement transaccional** | ≥ 40 clicks en botón "Pedir Mandado" (deshabilitado) en 2 semanas | Event tracking en el botón stub |
| 4 | **Validación cualitativa** | ≥ 10 entrevistas a usuarios que clickearon "Pedir Mandado" confirmando intención real de uso | Entrevistas directas (DM o llamada) |
| 5 | **Red de mensajeros potenciales** | ≥ 15 personas inscritas en lista de espera de mensajeros | Formulario simple (Google Form) vinculado desde la app |
| 6 | **Cobertura del directorio** | ≥ 40 negocios activos en el mapa, ≥ 3 categorías representadas | Conteo en BD |

**Lógica de los criterios:**
- El criterio 3 actúa como proxy de demanda transaccional sin construir el sistema: si nadie hace click en un botón deshabilitado que dice "Pedir Mandado", no hay demanda latente suficiente para justificar la Etapa 2.
- El criterio 4 valida que el click no es curiosidad sino intención: un usuario que dice "sí, lo usaría para que me traigan el pan" es una señal distinta a uno que dice "pensé que era otra cosa".
- El criterio 5 valida el lado de la oferta: sin mensajeros reales disponibles, el tiempo de respuesta del primer mandado será inaceptable y destruirá la experiencia de lanzamiento.
- Los criterios 1 y 2 validan que el directorio por sí solo tiene valor de retención, lo que garantiza que la base sobre la que se construirá el motor transaccional ya tiene tracción orgánica.

Si al final de la semana 10 los criterios 1, 2 y 3 no están cumplidos, el equipo debe ejecutar un ciclo de growth (SEO local, distribución en grupos de WhatsApp de barrio, alianzas con juntas de acción comunal) antes de pasar a Etapa 2. Construir el motor transaccional para un directorio que nadie visita es deuda sin retorno.
