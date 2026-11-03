# Análisis Técnico-Económico — MiCuadra (Propuesta Original)

---

## 1. Viabilidad Técnica e Infraestructura para un Equipo de 3 Estudiantes Sin Capital

### Stack Propuesto vs. Capacidad Real del Equipo

| Componente | Propuesta | Riesgo / Brecha |
|---|---|---|
| Backend | Node.js / FastAPI (REST) | Aceptable. Curva suave, ecosistema gratuito. Sin riesgo si hay experiencia básica. |
| Frontend | React / Next.js | Razonable. SSR de Next.js añade complejidad operativa innecesaria en MVP; React puro + Vite es suficiente. |
| BD geoespacial | PostgreSQL + PostGIS | **Alto riesgo operativo.** PostGIS requiere configuración no trivial, índices GIST, queries ST_DWithin. Para 3 estudiantes sin DBA es una deuda técnica temprana. Alternativa viable: MongoDB Atlas con índices 2dsphere (tier gratuito, geolocalización nativa, sin gestión de servidor). |
| Mapas | Mapbox / OpenStreetMap | Mapbox tiene costo desde cierto volumen; Leaflet.js + OSM tiles (gratuito, sin límites estrictos en pruebas) es la opción correcta para fase 0. |
| Móvil nativo | React Native (fases posteriores) | Correcto diferirlo. No tocar hasta validar retención en web. |
| Infraestructura | No especificada | **Vacío crítico.** Sin presupuesto, el stack debe correr en capa gratuita: Railway/Render (backend), Vercel (frontend), Supabase o PlanetScale (BD). Cualquier VPS introduce costo fijo desde mes 1. |
| WhatsApp | Business API | API oficial requiere proveedor BSP, costos por conversación y aprobación Meta. En Fase 1, un enlace `wa.me/57XXXXXXXXXX` es funcional, gratuito y suficiente. |

### Estimación de Costo Infraestructura (Fase MVP)

Con elecciones conservadoras (Supabase Free + Railway Free + Vercel Hobby): **$0/mes** hasta ~500 usuarios activos. El cuello de botella real no es costo sino **ancho de banda de desarrollo**: 3 personas con carga académica tienen capacidad efectiva de ~30-40 h/semana combinadas, lo que hace el roadmap de 16 semanas **optimista en un 40-60%** sin una división de roles explícita (product, backend, frontend).

---

## 2. Evaluación Crítica del Modelo SaaS ($15k–$60k COP/mes)

### Barreras Psicológicas y Económicas del Tendero de Barrio

**Perfil de decisión del dueño de micronegocio informal:**
- Mentalidad de costo hundido nulo: paga solo por lo que ya usa y percibe directamente.
- Referencia mental: redes sociales = gratis. Cualquier costo mensual activa fricción de "¿por qué pagar esto?".
- Aversión a suscripciones recurrentes: prefiere pago único o pago condicionado a resultado visible.
- Ciclo de pago: muchos negocios manejan flujo de caja diario/semanal, no mensual. Una suscripción mensual obliga a reservar capital que puede no tener.

**Problema estructural del modelo freemium propuesto:**
El plan Vecino (gratuito) ofrece visibilidad básica, que es exactamente lo que el negocio quiere. La propuesta de valor incremental de los planes pagos (fotos ilimitadas, horarios detallados, estadísticas) no resuelve ningún dolor económico tangible para el tendero. El dolor del tendero no es "quiero más fotos en mi perfil"; es "quiero más clientes". Mientras la plataforma no demuestre causalidad directa entre el pago y el incremento de clientes, la conversión free→pago será cercana a 0%.

**Benchmark de referencia:** Google Business Profile ofrece perfil completo, fotos ilimitadas, estadísticas y integración en Maps —todo gratuito— y aun así la mayoría de micronegocios no lo reclaman. La barrera no es precio: es percepción de valor. MiCuadra tiene que demostrar ese valor antes de cobrar, no después.

**Viabilidad financiera del modelo original:**
- Para cubrir costos operativos mínimos reales (~$300k–$500k COP/mes entre dominio, hosting eventualmente pago, contingencias): necesitan 20–33 negocios en plan Vitrina.
- Para un ingreso mínimo estudiantil (~$1.5M COP/mes entre 3): 100+ suscriptores Vitrina activos.
- Timeline realista para alcanzar 100 suscriptores pagos desde cero en un mercado sin tracción previa: **12–18 meses**, no 16 semanas.

---

## 3. Matriz Técnica y Comercial: Fortalezas vs. Debilidades/Riesgos

### Fortalezas

| Dimensión | Fortaleza |
|---|---|
| **Mercado** | Nicho real y desatendido: ningún competidor identificado con presencia activa en Pereira/Eje Cafetero. Ventana de entrada como primer jugador local. |
| **Propuesta de valor usuario final** | Cero fricción de consumo: no requiere cuenta para buscar. El mapa como interfaz es universalmente intuitivo. |
| **Simplicidad del MVP** | Fase 1 no requiere logística de domicilios, pasarelas de pago ni gestión de inventario. Alcance técnico reducido y focuseable. |
| **Modelo de monetización predecible** | Suscripción fija > comisión variable desde la perspectiva del negocio (cuando ya hay valor percibido). |
| **Stack técnico** | Tecnologías maduras con comunidad amplia, documentación abundante y opciones de hosting gratuito. Apto para equipo junior. |
| **Differenciador de categorías** | Incluye servicios (barbería, taller, gimnasio) que las apps de domicilios no pueden incorporar por su naturaleza transaccional. |
| **Costo de adquisición de contenido inicial** | El equipo puede cargar los primeros 20-30 negocios manualmente en días, sin depender de que los tenderos se registren solos. |

### Debilidades y Riesgos

| Dimensión | Debilidad / Riesgo | Severidad |
|---|---|---|
| **Conversión freemium→pago** | El valor incremental de los planes pagos no resuelve el dolor económico del tendero. Conversión proyectada < 5% sin demostración de ROI directo. | 🔴 Alta |
| **Cold-start bilateral** | Sin negocios el usuario no vuelve; sin usuarios el negocio no paga. Requiere resolver el lado de oferta antes de abrir demanda. | 🔴 Alta |
| **Retención del usuario final** | Un directorio estático sin transacción, reserva ni recompensa tiene baja razón de retorno. El usuario que ya sabe dónde está su barbero no necesita volver. | 🔴 Alta |
| **Capacidad de desarrollo** | 3 estudiantes con carga académica = ~30-40 h/semana efectivas. El roadmap de 16 semanas es optimista. Sin PM explícito, hay riesgo de scope creep. | 🟠 Media-Alta |
| **Monetización tardía** | El modelo SaaS solo genera ingresos cuando hay suficiente tracción para justificar el pago. En las primeras 16 semanas: ingreso = $0. | 🟠 Media-Alta |
| **Dependencia de geolocalización** | Sin permisos de ubicación activos o en zonas con mala señal GPS, la propuesta de "cercanía" se degrada. Requiere fallback por barrio/zona manual. | 🟡 Media |
| **Actualización de datos** | Los horarios, precios y fotos envejecen. Sin incentivo activo para que el tendero actualice su perfil, el directorio pierde credibilidad en 2-3 meses. | 🟡 Media |
| **PostGIS en tier gratuito** | Supabase soporta PostGIS pero con limitaciones de CPU en el tier free. Queries geoespaciales complejas pueden tener latencia inaceptable con tráfico real. | 🟡 Media |
| **Diferenciación sostenible** | Google puede lanzar una función hiperlocal mañana. La ventaja competitiva real es solo la ejecución local y la relación con la comunidad, no la tecnología. | 🟡 Media |
| **Riesgo regulatorio WhatsApp** | Uso masivo de links wa.me para derivar tráfico puede violar TOS de WhatsApp en contextos comerciales; Business API es la vía formal pero costosa. | 🟢 Baja (Fase 1) |
