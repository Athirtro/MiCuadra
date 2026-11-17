import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { apiGet, rutaNegocios, type Barrio, type Categoria, type ListaNegocios, type NegocioResumen, type Punto } from '../lib/api'
import { Flame, Footprints, MapPin, MapPinned, Search } from 'lucide-react'
import { IconoCategoria } from '../components/Icono'
import { Precio } from '../components/Precio'
import { registrarEvento } from '../lib/eventos'
import { formatoDistancia } from '../lib/formato'
import { rutaAPie, type Ruta } from '../lib/ruta'
import { barrioGuardado, useUbicacion } from '../lib/useUbicacion'

// Leaflet pesa ~40 KB: se carga aparte para que el resto de la pantalla aparezca de una.
const MapaBarrio = lazy(() => import('../components/MapaBarrio').then((m) => ({ default: m.MapaBarrio })))

const RADIOS = [
  { cuadras: 5, metros: 500 },
  { cuadras: 10, metros: 1000 },
]

export function Mapa() {
  const navigate = useNavigate()
  const { ubicacion, yo, pedirGps, centrarme, elegirBarrio } = useUbicacion()
  const [categoria, setCategoria] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const q = useDeferredValue(texto)
  const [abiertoAhora, setAbiertoAhora] = useState(false)
  const [conOfertas, setConOfertas] = useState(false)
  const [radioM, setRadioM] = useState(1000)
  const [centroMapa, setCentroMapa] = useState<Punto | null>(null)
  // "Buscar en esta zona" vale mientras no cambie la ubicación de origen (GPS o barrio).
  const [busquedaEn, setBusquedaEn] = useState<{ origen: Punto; punto: Punto } | null>(null)

  const categorias = useQuery({
    queryKey: ['categorias'],
    queryFn: () => apiGet<Categoria[]>('/categorias'),
    staleTime: Infinity,
  })
  const barrios = useQuery({ queryKey: ['barrios'], queryFn: () => apiGet<Barrio[]>('/barrios'), staleTime: Infinity })

  // Sin GPS: barrio recordado de una visita anterior.
  useEffect(() => {
    if (ubicacion.estado !== 'sin_ubicacion' || !barrios.data) return
    const guardado = barrios.data.find((b) => b.slug === barrioGuardado())
    if (guardado) elegirBarrio(guardado.slug, guardado.centroide)
  }, [ubicacion.estado, barrios.data, elegirBarrio])

  const origen = ubicacion.estado === 'gps' || ubicacion.estado === 'barrio' ? ubicacion.punto : null
  const centro = busquedaEn && busquedaEn.origen === origen ? busquedaEn.punto : origen

  const negocios = useQuery({
    queryKey: ['negocios', centro, radioM, categoria, q, abiertoAhora, conOfertas],
    queryFn: () =>
      apiGet<ListaNegocios>(rutaNegocios({ centro: centro as Punto, radioM, categoria, q, abiertoAhora, conOfertas })),
    enabled: centro !== null,
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (q.trim().length >= 3) registrarEvento('busqueda', undefined, { q: q.trim().slice(0, 60) })
  }, [q])

  const abrir = useCallback((slug: string) => navigate(`/n/${slug}`), [navigate])
  const [expandida, setExpandida] = useState(false)
  const [elegido, setElegido] = useState<NegocioResumen | null>(null)
  // En el mapa, tocar un pin elige el negocio y muestra el camino; la ficha se abre desde la tarjeta.
  const elegirEnMapa = useCallback(
    (slug: string) => {
      const n = negocios.data?.items.find((x) => x.slug === slug)
      if (n) {
        setElegido(n)
        registrarEvento('click_como_llegar', n.id, { en: 'mapa' })
      }
    },
    [negocios.data],
  )
  const irA = useCallback((n: NegocioResumen) => {
    setElegido(n)
    setExpandida(false)
    registrarEvento('click_como_llegar', n.id, { en: 'lista' })
  }, [])
  // El camino sale de dónde estás; se recalcula si te mueves más de 25 m.
  const desde = yo ? redondearPunto(yo.punto) : null
  const camino = useQuery({
    queryKey: ['camino', desde, elegido?.id],
    queryFn: ({ signal }) => rutaAPie(desde as Punto, (elegido as NegocioResumen).ubicacion, signal),
    enabled: Boolean(desde && elegido),
    staleTime: Infinity,
    retry: 1,
    placeholderData: keepPreviousData,
  })
  const lejosDelCentro =
    centro && centroMapa && distanciaAprox(centro, centroMapa) > Math.min(300, radioM / 2) ? centroMapa : null
  const items = useMemo(() => negocios.data?.items ?? [], [negocios.data])

  if (ubicacion.estado === 'buscando') {
    return <Aviso titulo="Buscando tu cuadra…" texto="Si tu celular te pregunta, permite ver tu ubicación." />
  }
  if (!centro) {
    return (
      <ElegirBarrio
        barrios={barrios.data}
        cargando={barrios.isPending}
        error={barrios.isError ? () => barrios.refetch() : null}
        alElegir={elegirBarrio}
        alPedirGps={'geolocation' in navigator ? pedirGps : null}
      />
    )
  }

  return (
    <div className="flex h-[calc(100dvh-57px-var(--nav))] flex-col md:grid md:grid-cols-[380px_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)]">
      {/* Filtros */}
      <div className="relative z-[1002] flex flex-col gap-2 border-b border-line bg-surface px-4 py-3 shadow-1 md:col-span-2">
        <label>
          <span className="sr-only">Buscar negocios o productos</span>
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Pan, cemento, acetaminofén…"
            className="tap w-full rounded-caja border border-line bg-bg px-4 text-base text-ink placeholder:text-muted"
            enterKeyHint="search"
          />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Categorías">
          <Chip activo={categoria === null} onClick={() => setCategoria(null)}>
            Todo
          </Chip>
          {categorias.data?.map((c) => (
            <Chip key={c.slug} activo={categoria === c.slug} onClick={() => setCategoria(categoria === c.slug ? null : c.slug)}>
              <IconoCategoria slug={c.slug} className="size-4" />
              {c.nombre}
            </Chip>
          ))}
        </div>
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 text-sm [scrollbar-width:none]">
          <Chip activo={abiertoAhora} onClick={() => setAbiertoAhora(!abiertoAhora)}>
            <span className="size-2 rounded-full bg-current" aria-hidden="true" />
            Abierto ahora
          </Chip>
          <Chip activo={conOfertas} onClick={() => setConOfertas(!conOfertas)}>
            <Flame className="size-4" aria-hidden="true" />
            Ofertas
          </Chip>
          <div className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface p-1" role="radiogroup" aria-label="¿Qué tan cerca?">
            <span className="pl-2 pr-1 text-xs font-bold text-muted">Hasta</span>
            {RADIOS.map((r) => (
              <button
                key={r.metros}
                type="button"
                role="radio"
                aria-checked={radioM === r.metros}
                onClick={() => setRadioM(r.metros)}
                className={`h-9 rounded-full px-3 text-sm font-bold whitespace-nowrap ${radioM === r.metros ? 'bg-green text-green-ink' : 'text-ink'}`}
              >
                {r.cuadras} cuadras
              </button>
            ))}
          </div>
          {ubicacion.estado === 'barrio' && barrios.data && (
            <select
              className="tap shrink-0 rounded-caja border border-line bg-bg px-2"
              value={ubicacion.barrio}
              aria-label="Barrio"
              onChange={(e) => {
                const b = barrios.data.find((x) => x.slug === e.target.value)
                if (b) elegirBarrio(b.slug, b.centroide)
              }}
            >
              {barrios.data.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.nombre}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* En el celular, mapa y hoja comparten esta zona; en pantallas grandes, cada uno su columna. */}
      <div className="relative flex-1 overflow-clip md:contents">
        {/* Mapa: en el celular termina donde empieza la hoja (16 px debajo, por las esquinas redondas). */}
        <div className="mapa-con-hoja absolute inset-x-0 top-0 bottom-[calc(45%-16px)] md:relative md:col-start-2 md:row-start-2 md:inset-auto">
          <Suspense fallback={<div className="h-full w-full bg-block" />}>
            <MapaBarrio
              centro={centro}
              radioM={radioM}
              negocios={items}
              alElegir={elegirEnMapa}
              alMover={setCentroMapa}
              yo={yo}
              camino={elegido && camino.data ? camino.data.trazado : null}
              alPedirUbicacion={centrarme}
              className="h-full w-full"
            />
          </Suspense>
          {elegido ? (
            <TarjetaCamino
              n={elegido}
              camino={camino}
              hayUbicacion={Boolean(yo)}
              alPedirUbicacion={centrarme}
              alAbrir={() => abrir(elegido.slug)}
              alCerrar={() => setElegido(null)}
            />
          ) : (
            lejosDelCentro && (
              <button
                type="button"
                onClick={() => origen && setBusquedaEn({ origen, punto: lejosDelCentro })}
                className="entra tap absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-green px-4 text-sm font-bold text-green-ink shadow-lg"
              >
                Buscar en esta zona
              </button>
            )
          )}
        </div>

        {/* Resultados: hoja que sube y tapa el mapa al desplazarse; baja con la manija o tirando hacia abajo. */}
        <HojaResultados expandida={expandida} alCambiar={setExpandida} ocupada={negocios.isFetching}>
          <Resultados consulta={negocios} radioM={radioM} alAbrir={abrir} alIr={irA} />
        </HojaResultados>
      </div>
    </div>
  )
}

/** Redondea a ~25 m para no recalcular el camino a cada paso del GPS. */
function redondearPunto(p: Punto): Punto {
  return { lat: Math.round(p.lat * 4000) / 4000, lng: Math.round(p.lng * 4000) / 4000 }
}

/** Fracción de la hoja que queda escondida cuando está abajo (igual que `.hoja` en styles.css). */
const HOJA_ABAJO = 0.55
/** Velocidad (px/ms) desde la que un tirón decide la dirección aunque el dedo haya recorrido poco. */
const TIRON = 0.35

function HojaResultados({
  expandida,
  alCambiar,
  ocupada,
  children,
}: {
  expandida: boolean
  alCambiar: (v: boolean) => void
  ocupada: boolean
  children: React.ReactNode
}) {
  const hoja = useRef<HTMLElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  // Se leen dentro de los listeners nativos sin volver a registrarlos.
  const estado = useRef({ expandida, alCambiar })
  useEffect(() => {
    estado.current = { expandida, alCambiar }
  }, [expandida, alCambiar])
  const arrastro = useRef(false)

  // Al bajar la hoja, la lista vuelve al principio para que lo primero que se vea sea el inicio.
  useEffect(() => {
    if (!expandida && lista.current) lista.current.scrollTop = 0
  }, [expandida])

  // La hoja sigue al dedo (listeners nativos: hace falta `passive: false` para frenar el scroll de la
  // lista mientras se arrastra). Al soltar, termina según la velocidad del gesto o la mitad del recorrido.
  useEffect(() => {
    const el = hoja.current
    if (!el) return
    const escritorio = window.matchMedia?.('(min-width: 48rem)')
    let inicio: { y: number; base: number; desdeLista: boolean } | null = null
    let activo = false
    let pos = 0
    let muestras: { y: number; t: number }[] = []

    const abajoPx = () => el.offsetHeight * HOJA_ABAJO
    const limitar = (v: number) => {
      const max = abajoPx()
      // Más allá de los topes se mueve a un tercio: se siente elástico en vez de un muro.
      if (v < 0) return v / 3
      if (v > max) return max + (v - max) / 3
      return v
    }

    const alTocar = (e: TouchEvent) => {
      if (escritorio?.matches || e.touches.length !== 1) return
      const t = e.touches[0]
      if (!t) return
      const desdeLista = Boolean(lista.current?.contains(e.target as Node))
      inicio = { y: t.clientY, base: estado.current.expandida ? 0 : abajoPx(), desdeLista }
      activo = false
      arrastro.current = false
      muestras = [{ y: t.clientY, t: e.timeStamp }]
    }

    const alMover = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!inicio || !t) return
      const dy = t.clientY - inicio.y
      if (!activo) {
        if (Math.abs(dy) < 6) return
        // Con la hoja arriba, la lista se desplaza normal; solo se arrastra la hoja al tirar hacia
        // abajo estando la lista al principio.
        if (estado.current.expandida && inicio.desdeLista && (dy < 0 || (lista.current?.scrollTop ?? 0) > 0)) {
          inicio = null
          return
        }
        activo = true
        arrastro.current = true
        inicio.y = t.clientY
        el.style.transition = 'none'
      }
      e.preventDefault()
      pos = limitar(inicio.base + t.clientY - inicio.y)
      el.style.transform = `translateY(${pos}px)`
      muestras.push({ y: t.clientY, t: e.timeStamp })
      if (muestras.length > 5) muestras.shift()
    }

    const alSoltar = () => {
      if (!inicio || !activo) {
        inicio = null
        return
      }
      const primera = muestras[0]
      const ultima = muestras[muestras.length - 1]
      // Velocidad de los últimos movimientos (con menos de 10 ms de datos no es confiable: decide la posición).
      const dt = primera && ultima ? ultima.t - primera.t : 0
      const v = primera && ultima && dt >= 10 ? (ultima.y - primera.y) / dt : 0
      const arriba = v < -TIRON ? true : v > TIRON ? false : pos < abajoPx() / 2
      // Se quitan los estilos del dedo: la clase anima desde aquí hasta el destino.
      el.style.transition = ''
      el.style.transform = ''
      inicio = null
      activo = false
      estado.current.alCambiar(arriba)
    }

    el.addEventListener('touchstart', alTocar, { passive: true })
    el.addEventListener('touchmove', alMover, { passive: false })
    el.addEventListener('touchend', alSoltar)
    el.addEventListener('touchcancel', alSoltar)
    return () => {
      el.removeEventListener('touchstart', alTocar)
      el.removeEventListener('touchmove', alMover)
      el.removeEventListener('touchend', alSoltar)
      el.removeEventListener('touchcancel', alSoltar)
    }
  }, [])

  return (
    <section
      ref={hoja}
      aria-label="Resultados"
      aria-busy={ocupada}
      data-expandida={expandida}
      className="hoja absolute inset-x-0 top-0 bottom-0 z-[1001] flex flex-col rounded-t-[22px] bg-surface shadow-2 md:static md:col-start-1 md:row-start-2 md:rounded-none md:border-r md:border-line md:shadow-none"
    >
      <button
        type="button"
        onClick={() => {
          // Un arrastre que termina sobre la manija no cuenta como toque.
          if (arrastro.current) {
            arrastro.current = false
            return
          }
          alCambiar(!expandida)
        }}
        aria-expanded={expandida}
        aria-label={expandida ? 'Bajar la lista y ver el mapa' : 'Subir la lista'}
        className="flex h-7 w-full shrink-0 touch-none items-center justify-center md:hidden"
      >
        <span className="h-1 w-10 rounded-full bg-line" />
      </button>
      <div
        ref={lista}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onScroll={(e) => {
          // Rueda del mouse o teclado con la hoja abajo: sube la hoja.
          if (!expandida && e.currentTarget.scrollTop > 8) alCambiar(true)
        }}
      >
        {children}
      </div>
    </section>
  )
}

function TarjetaCamino({
  n,
  camino,
  hayUbicacion,
  alPedirUbicacion,
  alAbrir,
  alCerrar,
}: {
  n: NegocioResumen
  camino: ReturnType<typeof useQuery<Ruta>>
  hayUbicacion: boolean
  alPedirUbicacion: () => void
  alAbrir: () => void
  alCerrar: () => void
}) {
  return (
    <div className="entra absolute inset-x-3 top-3 z-[1000] rounded-caja bg-surface p-3 shadow-2" role="status">
      <div className="flex items-start gap-3">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-full"
          style={{ background: `${n.categoria.color}22`, color: n.categoria.color }}
          aria-hidden="true"
        >
          <IconoCategoria slug={n.categoria.slug} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{n.nombre}</p>
          {!hayUbicacion ? (
            <p className="text-sm text-muted">Activa tu ubicación para ver el camino.</p>
          ) : camino.isPending ? (
            <p className="text-sm text-muted">Buscando el camino…</p>
          ) : camino.isError ? (
            <p className="text-sm text-red">{camino.error.message}</p>
          ) : (
            <p className="text-sm">
              <span className="inline-flex items-center gap-1 font-bold">
                <Footprints className="size-4" aria-hidden="true" /> {camino.data.minutos} min
              </span>
              <span className="text-muted"> · {formatoDistancia(camino.data.metros)} a pie</span>
            </p>
          )}
        </div>
        <button type="button" onClick={alCerrar} aria-label="Quitar el camino" className="tap -m-2 grid place-items-center text-xl text-muted">
          ×
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        {!hayUbicacion && (
          <button type="button" onClick={alPedirUbicacion} className="tap flex-1 rounded-caja bg-green px-3 text-sm font-bold text-green-ink">
            Usar mi ubicación
          </button>
        )}
        <button type="button" onClick={alAbrir} className="tap flex-1 rounded-caja border border-line px-3 text-sm font-bold">
          Ver negocio
        </button>
      </div>
    </div>
  )
}

function Resultados({
  consulta,
  radioM,
  alAbrir,
  alIr,
}: {
  consulta: ReturnType<typeof useQuery<ListaNegocios>>
  radioM: number
  alAbrir: (slug: string) => void
  alIr: (n: NegocioResumen) => void
}) {
  if (consulta.isPending) {
    return (
      <div role="status">
        <span className="sr-only">Cargando negocios…</span>
        <ul className="divide-y divide-line" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="esqueleto size-14 shrink-0 rounded-caja" />
              <span className="flex flex-1 flex-col gap-2">
                <span className="esqueleto h-4 w-2/3 rounded" />
                <span className="esqueleto h-3 w-1/3 rounded" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <div className="p-4">
        <p className="font-bold">No pudimos cargar los negocios.</p>
        <p className="text-sm text-muted">{consulta.error.message}</p>
        <button type="button" onClick={() => consulta.refetch()} className="tap mt-3 rounded-caja border border-line px-4 font-bold">
          Reintentar
        </button>
      </div>
    )
  }
  const { items, total } = consulta.data
  if (!items.length) {
    return (
      <div className="p-6 text-center">
        <MapPinned className="mx-auto size-9 text-muted" strokeWidth={1.5} aria-hidden="true" />
        <p className="mt-2 font-bold">Todavía no hay negocios en esta cuadra.</p>
        <p className="mt-1 text-sm text-muted">
          {radioM < 1000 ? 'Prueba con 10 cuadras o quita algún filtro. ' : ''}¿Conoces uno?{' '}
          <Link to="/conoce" className="font-bold text-green underline">
            Agrégalo
          </Link>
        </p>
      </div>
    )
  }
  return (
    <>
      <p className="px-4 pt-3 pb-1 font-mono text-[11px] tracking-wider text-muted uppercase">
        {total} {total === 1 ? 'negocio' : 'negocios'} · a menos de {radioM / 100} cuadras
      </p>
      <ul className="divide-y divide-line">
        {items.map((n) => (
          <li key={n.id} className="flex items-center">
            <button
              type="button"
              onClick={() => alAbrir(n.slug)}
              className="group flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left hover:bg-bg focus-visible:bg-bg"
            >
              <span
                className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-caja ring-1 ring-black/5"
                style={{ background: `${n.categoria.color}22`, color: n.categoria.color }}
                aria-hidden="true"
              >
                {n.foto_url ? (
                  <img src={n.foto_url} alt="" loading="lazy" className="size-full object-cover" width={56} height={56} />
                ) : (
                  <IconoCategoria slug={n.categoria.slug} className="size-6" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-bold">{n.nombre}</span>
                  {n.destacado && (
                    <span className="shrink-0 rounded bg-sun px-1.5 text-xs font-bold text-sun-ink">Destacado</span>
                  )}
                </span>
                <span className="block text-sm text-muted">
                  {n.categoria.nombre} · {formatoDistancia(n.distancia_m)}
                </span>
                <span className="flex flex-wrap items-center gap-x-2">
                  <EstadoAbierto abierto={n.abierto_ahora} />
                  {n.ofertas > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red/10 px-2 text-xs font-bold text-red">
                      <Flame className="size-3" aria-hidden="true" />
                      {n.ofertas} {n.ofertas === 1 ? 'oferta' : 'ofertas'}
                    </span>
                  )}
                </span>
                {n.productos && n.productos.length > 0 && (
                  <span className="mt-1.5 flex flex-col gap-0.5 rounded-caja bg-bg px-2 py-1.5 text-sm">
                    {n.productos.map((p) => (
                      <span key={p.nombre} className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Search className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                          <span className="truncate">{p.nombre}</span>
                        </span>
                        <Precio precio={p.precio} oferta={p.precio_oferta} className="shrink-0 text-sm" />
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() => alIr(n)}
              aria-label={`Cómo llegar a ${n.nombre}`}
              className="tap mx-3 flex shrink-0 flex-col items-center justify-center rounded-caja bg-block px-2.5 py-1.5 text-xs font-bold"
            >
              <Footprints className="size-5" aria-hidden="true" />
              Ir
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

export function EstadoAbierto({ abierto }: { abierto: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-bold ${abierto ? 'text-green' : 'text-red'}`}>
      <span className={`size-2 rounded-full ${abierto ? 'bg-green shadow-[0_0_0_3px_color-mix(in_srgb,var(--green)_20%,transparent)]' : 'bg-red'}`} aria-hidden="true" />
      {abierto ? 'Abierto ahora' : 'Cerrado'}
    </span>
  )
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`tap inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-bold whitespace-nowrap ${
        activo ? 'border-green bg-green text-green-ink shadow-1' : 'border-line bg-surface text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function ElegirBarrio({
  barrios,
  cargando,
  error,
  alElegir,
  alPedirGps,
}: {
  barrios?: Barrio[]
  cargando: boolean
  error: (() => void) | null
  alElegir: (slug: string, punto: Punto) => void
  alPedirGps: (() => void) | null
}) {
  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-black">¿En qué barrio estás?</h1>
      <p className="mt-2 text-muted">No pudimos ver tu ubicación. Elige tu barrio y te mostramos lo que hay cerca.</p>
      {alPedirGps && (
        <button
          type="button"
          onClick={alPedirGps}
          className="tap mt-4 inline-flex items-center gap-2 rounded-caja border border-line bg-surface px-4 font-bold shadow-1"
        >
          <span aria-hidden="true">◎</span> Usar mi ubicación
        </button>
      )}
      {cargando && <p className="mt-6 text-muted">Cargando barrios…</p>}
      {barrios?.length === 0 && (
        <p className="mt-6 text-muted">
          Todavía no hay negocios en el mapa.{' '}
          <Link to="/conoce" className="font-bold text-green underline">
            Sé el primero
          </Link>
        </p>
      )}
      {error && (
        <p className="mt-6">
          No pudimos cargar los barrios.{' '}
          <button type="button" onClick={error} className="tap font-bold text-green underline">
            Reintentar
          </button>
        </p>
      )}
      <div className="escalonado mt-6 grid grid-cols-2 gap-2">
        {barrios?.slice(0, 12).map((b, i) => (
          <button
            key={b.slug}
            type="button"
            style={{ '--i': i } as React.CSSProperties}
            onClick={() => alElegir(b.slug, b.centroide)}
            className="tap flex aspect-[4/3] flex-col items-start justify-end rounded-caja bg-block p-3 text-left hover:bg-sun hover:text-sun-ink"
          >
            <span className="font-display text-lg leading-tight font-black">{b.nombre}</span>
            <span className="font-mono text-xs opacity-70">
              {b.negocios} {b.negocios === 1 ? 'negocio' : 'negocios'}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <section className="entra mx-auto max-w-md px-4 py-16 text-center" role="status">
      <MapPin className="mx-auto size-10 text-green" strokeWidth={1.75} aria-hidden="true" />
      <h1 className="mt-3 text-2xl font-black">{titulo}</h1>
      <p className="mt-2 text-muted">{texto}</p>
    </section>
  )
}

/** Metros aproximados entre dos puntos cercanos (suficiente para decidir si el mapa se movió). */
function distanciaAprox(a: Punto, b: Punto): number {
  const dLat = (a.lat - b.lat) * 110_574
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}
