import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { apiGet, rutaNegocios, type Barrio, type Categoria, type ListaNegocios, type Punto } from '../lib/api'
import { registrarEvento } from '../lib/eventos'
import { formatoDistancia } from '../lib/formato'
import { emojiCategoria } from '../lib/negocio'
import { barrioGuardado, useUbicacion } from '../lib/useUbicacion'

// Leaflet pesa ~40 KB: se carga aparte para que el resto de la pantalla aparezca de una.
const MapaBarrio = lazy(() => import('../components/MapaBarrio').then((m) => ({ default: m.MapaBarrio })))

const RADIOS = [
  { cuadras: 5, metros: 500 },
  { cuadras: 10, metros: 1000 },
]

export function Mapa() {
  const navigate = useNavigate()
  const { ubicacion, pedirGps, elegirBarrio } = useUbicacion()
  const [categoria, setCategoria] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const q = useDeferredValue(texto)
  const [abiertoAhora, setAbiertoAhora] = useState(false)
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
    queryKey: ['negocios', centro, radioM, categoria, q, abiertoAhora],
    queryFn: () =>
      apiGet<ListaNegocios>(rutaNegocios({ centro: centro as Punto, radioM, categoria, q, abiertoAhora })),
    enabled: centro !== null,
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (q.trim().length >= 3) registrarEvento('busqueda', undefined, { q: q.trim().slice(0, 60) })
  }, [q])

  const abrir = useCallback((slug: string) => navigate(`/n/${slug}`), [navigate])
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
      />
    )
  }

  return (
    <div className="grid h-[calc(100dvh-57px)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-[380px_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)]">
      {/* Filtros */}
      <div className="z-10 flex flex-col gap-2 border-b border-line bg-surface px-4 py-3 md:col-span-2">
        <div className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">Buscar negocios</span>
            <input
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pan, droguería, barbería…"
              className="tap w-full rounded-r border border-line bg-bg px-4 text-base text-ink placeholder:text-muted"
              enterKeyHint="search"
            />
          </label>
          <button
            type="button"
            onClick={pedirGps}
            className="tap rounded-r border border-line bg-bg px-3 text-sm font-bold"
            aria-label="Usar mi ubicación"
            title="Usar mi ubicación"
          >
            📍
          </button>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Categorías">
          <Chip activo={categoria === null} onClick={() => setCategoria(null)}>
            Todo
          </Chip>
          {categorias.data?.map((c) => (
            <Chip key={c.slug} activo={categoria === c.slug} onClick={() => setCategoria(categoria === c.slug ? null : c.slug)}>
              {emojiCategoria(c.slug)} {c.nombre}
            </Chip>
          ))}
        </div>
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 text-sm">
          <Chip activo={abiertoAhora} onClick={() => setAbiertoAhora(!abiertoAhora)}>
            🟢 Abierto ahora
          </Chip>
          {RADIOS.map((r) => (
            <Chip key={r.metros} activo={radioM === r.metros} onClick={() => setRadioM(r.metros)}>
              {r.cuadras} cuadras
            </Chip>
          ))}
          {ubicacion.estado === 'barrio' && barrios.data && (
            <select
              className="tap shrink-0 rounded-r border border-line bg-bg px-2"
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

      {/* Mapa */}
      <div className="relative md:col-start-2 md:row-start-2">
        <Suspense fallback={<div className="h-full w-full bg-block" />}>
          <MapaBarrio
            centro={centro}
            radioM={radioM}
            negocios={items}
            alElegir={abrir}
            alMover={setCentroMapa}
            className="h-full w-full"
          />
        </Suspense>
        {lejosDelCentro && (
          <button
            type="button"
            onClick={() => origen && setBusquedaEn({ origen, punto: lejosDelCentro })}
            className="entra tap absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-green px-4 text-sm font-bold text-green-ink shadow-lg"
          >
            Buscar en esta zona
          </button>
        )}
      </div>

      {/* Resultados */}
      <section
        aria-label="Resultados"
        aria-busy={negocios.isFetching}
        className="overflow-y-auto border-t border-line bg-surface md:col-start-1 md:row-start-2 md:border-t-0 md:border-r"
      >
        <Resultados consulta={negocios} radioM={radioM} alAbrir={abrir} />
      </section>
    </div>
  )
}

function Resultados({
  consulta,
  radioM,
  alAbrir,
}: {
  consulta: ReturnType<typeof useQuery<ListaNegocios>>
  radioM: number
  alAbrir: (slug: string) => void
}) {
  if (consulta.isPending) {
    return (
      <div role="status">
        <span className="sr-only">Cargando negocios…</span>
        <ul className="divide-y divide-line" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="esqueleto size-14 shrink-0 rounded-r" />
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
        <button type="button" onClick={() => consulta.refetch()} className="tap mt-3 rounded-r border border-line px-4 font-bold">
          Reintentar
        </button>
      </div>
    )
  }
  const { items, total } = consulta.data
  if (!items.length) {
    return (
      <div className="p-6 text-center">
        <p className="text-3xl" aria-hidden="true">
          🗺️
        </p>
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
      <p className="px-4 pt-3 text-xs text-muted">
        {total} {total === 1 ? 'negocio' : 'negocios'} a menos de {radioM / 100} cuadras
      </p>
      <ul className="divide-y divide-line">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => alAbrir(n.slug)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg focus-visible:bg-bg"
            >
              <span
                className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-r text-2xl"
                style={{ background: `${n.categoria.color}22` }}
                aria-hidden="true"
              >
                {n.foto_url ? (
                  <img src={n.foto_url} alt="" loading="lazy" className="size-full object-cover" width={56} height={56} />
                ) : (
                  emojiCategoria(n.categoria.slug)
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
                <EstadoAbierto abierto={n.abierto_ahora} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

export function EstadoAbierto({ abierto }: { abierto: boolean }) {
  return (
    <span className={`text-sm font-bold ${abierto ? 'text-green' : 'text-red'}`}>
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
      className={`tap shrink-0 rounded-full border px-4 text-sm font-bold whitespace-nowrap ${
        activo ? 'border-green bg-green text-green-ink' : 'border-line bg-bg text-ink'
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
}: {
  barrios?: Barrio[]
  cargando: boolean
  error: (() => void) | null
  alElegir: (slug: string, punto: Punto) => void
}) {
  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-black">¿En qué barrio estás?</h1>
      <p className="mt-2 text-muted">No pudimos ver tu ubicación. Elige tu barrio y te mostramos lo que hay cerca.</p>
      {cargando && <p className="mt-6 text-muted">Cargando barrios…</p>}
      {error && (
        <p className="mt-6">
          No pudimos cargar los barrios.{' '}
          <button type="button" onClick={error} className="tap font-bold text-green underline">
            Reintentar
          </button>
        </p>
      )}
      <div className="escalonado mt-6 grid grid-cols-2 gap-2">
        {barrios
          ?.filter((b) => b.es_piloto)
          .map((b, i) => (
            <button
              key={b.slug}
              type="button"
              style={{ '--i': i } as React.CSSProperties}
              onClick={() => alElegir(b.slug, b.centroide)}
              className="tap flex aspect-[4/3] items-end rounded-r bg-block p-3 text-left font-display text-lg font-black hover:bg-sun hover:text-sun-ink"
            >
              {b.nombre}
            </button>
          ))}
      </div>
    </section>
  )
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <section className="entra mx-auto max-w-md px-4 py-16 text-center" role="status">
      <p className="text-4xl" aria-hidden="true">
        📍
      </p>
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
