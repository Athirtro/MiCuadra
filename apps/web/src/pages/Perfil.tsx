import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Dialogo } from '../components/Dialogo'
import { CLAVE_QUE_PEDIRIA } from '../components/ListaEspera'
import { ApiError, apiEnviar, apiGet, type NegocioDetalle, type Punto, type ReporteEntrada } from '../lib/api'
import { registrarEvento } from '../lib/eventos'
import { formatoDistancia } from '../lib/formato'
import { DIAS, diaHoy, emojiCategoria, enlaceWhatsapp, horariosPorDia } from '../lib/negocio'
import { rutaAPie } from '../lib/ruta'
import { useBrujula } from '../lib/useUbicacion'
import { EstadoAbierto } from './Mapa'

const MiniMapa = lazy(() => import('../components/MapaBarrio').then((m) => ({ default: m.MiniMapa })))

export function Perfil() {
  const { slug = '' } = useParams()
  const negocio = useQuery({
    queryKey: ['negocio', slug],
    queryFn: () => apiGet<NegocioDetalle>(`/negocios/${encodeURIComponent(slug)}`),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  })

  const id = negocio.data?.id
  useEffect(() => {
    if (id) registrarEvento('vista_perfil', id)
  }, [id])

  useEffect(() => {
    if (negocio.data) document.title = `${negocio.data.nombre} — MiCuadra`
    return () => {
      document.title = 'MiCuadra — El mapa vivo de tu cuadra'
    }
  }, [negocio.data])

  if (negocio.isPending) {
    return (
      <div className="mx-auto max-w-xl" role="status">
        <span className="sr-only">Cargando…</span>
        <div className="esqueleto aspect-[16/9]" />
        <div className="flex flex-col gap-3 px-4 pt-5" aria-hidden="true">
          <div className="esqueleto h-4 w-1/3 rounded" />
          <div className="esqueleto h-8 w-3/4 rounded" />
          <div className="esqueleto h-4 w-1/4 rounded" />
          <div className="esqueleto mt-4 h-48 rounded-caja" />
        </div>
      </div>
    )
  }
  if (negocio.isError) {
    const noExiste = negocio.error instanceof ApiError && negocio.error.status === 404
    return (
      <section className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">{noExiste ? 'Este negocio no está en el mapa' : 'No pudimos cargar el negocio'}</h1>
        <p className="mt-2 text-muted">{noExiste ? 'Puede que ya no exista o que aún no lo hayamos aprobado.' : negocio.error.message}</p>
        <Link to="/" className="tap mt-6 inline-flex items-center rounded-caja bg-green px-5 font-bold text-green-ink">
          Volver al mapa
        </Link>
      </section>
    )
  }

  return <FichaNegocio n={negocio.data} />
}

function FichaNegocio({ n }: { n: NegocioDetalle }) {
  const [modalMandado, setModalMandado] = useState(false)
  const [modalReporte, setModalReporte] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const emoji = emojiCategoria(n.categoria.slug)
  const llegar = useComoLlegar(n.ubicacion)

  async function compartir() {
    const url = `${location.origin}/n/${n.slug}`
    const datos = { title: n.nombre, text: `${n.nombre} en MiCuadra`, url }
    try {
      if (navigator.share) await navigator.share(datos)
      else {
        await navigator.clipboard.writeText(url)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2500)
      }
    } catch {
      // el usuario canceló el menú de compartir
    }
  }

  const hoy = DIAS[diaHoy()]

  return (
    <article className="mx-auto max-w-xl pb-32">
      <Carrusel fotos={n.fotos} nombre={n.nombre} emoji={emoji} color={n.categoria.color} />

      {/* Encabezado como hoja que sube sobre la foto */}
      <div className="relative -mt-5 rounded-t-[22px] bg-bg px-4 pt-5">
        <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: n.categoria.color }}>
          <span
            className="grid size-7 place-items-center rounded-full text-base"
            style={{ background: `${n.categoria.color}22` }}
            aria-hidden="true"
          >
            {emoji}
          </span>
          {n.categoria.nombre}
          {n.barrio && <span className="font-normal text-muted">· {n.barrio.nombre}</span>}
        </p>
        <h1 className="mt-2 text-[2rem] leading-[1.05] font-black text-balance">{n.nombre}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <EstadoAbierto abierto={n.abierto_ahora} />
          {n.cerrado_hoy && <span className="text-sm text-muted">Hoy no abre</span>}
          {n.destacado && <span className="rounded-full bg-sun px-2 py-0.5 text-xs font-bold text-sun-ink">★ Destacado</span>}
        </div>
        {n.descripcion && <p className="mt-3 text-pretty">{n.descripcion}</p>}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={compartir} className="tap inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-bold shadow-1">
            <span aria-hidden="true">↗</span>
            {copiado ? 'Enlace copiado ✓' : 'Compartir'}
          </button>
          {n.telefono && (
            <a href={`tel:${n.telefono}`} className="tap inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-bold shadow-1">
              <span aria-hidden="true">☎</span>
              Llamar
            </a>
          )}
        </div>

        <section className="tarjeta mt-5 overflow-hidden" aria-labelledby="titulo-donde">
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <h2 id="titulo-donde" className="text-lg font-black">
                Dónde queda
              </h2>
              {n.direccion_texto && <p className="mt-0.5 text-sm text-muted">{n.direccion_texto}</p>}
            </div>
            {llegar.estado === 'inactivo' ? (
              <button
                type="button"
                onClick={() => {
                  registrarEvento('click_como_llegar', n.id)
                  llegar.pedir()
                }}
                className="tap inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green px-4 text-sm font-bold text-green-ink"
              >
                <span aria-hidden="true">🚶</span> Cómo llegar
              </button>
            ) : (
              <button
                type="button"
                onClick={llegar.quitar}
                className="tap inline-flex shrink-0 items-center rounded-full bg-block px-4 text-sm font-bold"
              >
                Quitar camino
              </button>
            )}
          </div>
          {llegar.estado !== 'inactivo' && (
            <p role="status" className="entra -mt-1 px-4 pb-3 text-sm">
              {llegar.estado === 'ubicando' ? (
                <span className="text-muted">Buscando dónde estás…</span>
              ) : llegar.estado === 'sin_ubicacion' ? (
                <span className="text-red">
                  No pudimos ver tu ubicación. Revisa que el navegador tenga permiso de ubicación para MiCuadra.
                </span>
              ) : llegar.ruta.isPending ? (
                <span className="text-muted">Buscando el camino…</span>
              ) : llegar.ruta.isError ? (
                <span className="text-red">{llegar.ruta.error.message}</span>
              ) : (
                <>
                  <span className="font-bold">🚶 {llegar.ruta.data.minutos} min</span>
                  <span className="text-muted"> · {formatoDistancia(llegar.ruta.data.metros)} a pie desde donde estás</span>
                </>
              )}
            </p>
          )}
          <Suspense fallback={<div className="esqueleto h-40" />}>
            <MiniMapa
              punto={n.ubicacion}
              color={n.categoria.color}
              emoji={emoji}
              yo={llegar.yo}
              camino={llegar.ruta.data?.trazado ?? null}
            />
          </Suspense>
        </section>

        <section className="tarjeta mt-3 p-4" aria-labelledby="titulo-horario">
          <h2 id="titulo-horario" className="text-lg font-black">
            Horario
          </h2>
          {n.horarios.length ? (
            <dl className="mt-2 grid grid-cols-[auto_1fr] text-sm">
              {horariosPorDia(n.horarios).map(([dia, franjas]) => (
                <div
                  key={dia}
                  className={`col-span-2 grid grid-cols-subgrid gap-x-4 rounded-lg px-2 py-1.5 ${dia === hoy ? 'bg-green/10' : ''}`}
                >
                  <dt className={dia === hoy ? 'font-black text-green' : 'font-bold'}>
                    {dia}
                    {dia === hoy && <span className="sr-only"> (hoy)</span>}
                  </dt>
                  <dd className={`font-mono text-[13px] ${franjas === 'Cerrado' ? 'text-muted' : ''}`}>{franjas}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-1 text-muted">Este negocio no ha publicado su horario.</p>
          )}
        </section>

        <p className="mt-6 text-center">
          <button type="button" onClick={() => setModalReporte(true)} className="tap px-2 text-sm text-muted underline">
            Reportar información incorrecta
          </button>
        </p>
      </div>

      {/* Acciones principales siempre a mano del pulgar */}
      <div className="barra-inferior fixed inset-x-0 bottom-0 z-[1050] border-t border-line bg-surface/90 px-4 pt-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl gap-2">
          {n.whatsapp && (
            <a
              href={enlaceWhatsapp(n.whatsapp, n.nombre)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => registrarEvento('click_whatsapp', n.id)}
              aria-label="Escribir por WhatsApp"
              className="tap flex flex-1 items-center justify-center gap-2 rounded-caja bg-green px-3 font-bold whitespace-nowrap text-green-ink shadow-1"
            >
              <span aria-hidden="true">💬</span> WhatsApp
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              registrarEvento('click_pedir_mandado', n.id)
              setModalMandado(true)
            }}
            className="tap flex flex-1 items-center justify-center gap-2 rounded-caja bg-sun px-3 font-bold whitespace-nowrap text-sun-ink shadow-1"
          >
            🛵 Pedir mandado
          </button>
        </div>
      </div>

      {modalMandado && <ModalProximamente nombre={n.nombre} alCerrar={() => setModalMandado(false)} />}
      {modalReporte && <ModalReportar negocioId={n.id} alCerrar={() => setModalReporte(false)} />}
    </article>
  )
}

function Carrusel({ fotos, nombre, emoji, color }: { fotos: string[]; nombre: string; emoji: string; color: string }) {
  const [rotas, setRotas] = useState<string[]>([])
  const [actual, setActual] = useState(0)
  const validas = fotos.filter((f) => !rotas.includes(f))

  if (!validas.length) {
    return (
      <div
        className="grid aspect-[16/9] place-items-center text-7xl"
        style={{ background: `radial-gradient(circle at 50% 40%, ${color}33, ${color}11 70%)` }}
        aria-hidden="true"
      >
        <span className="drop-shadow-sm">{emoji}</span>
      </div>
    )
  }
  return (
    <div className="relative">
      <div
        className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        aria-label={`Fotos de ${nombre}`}
        onScroll={(e) => setActual(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
      >
        {validas.map((url, i) => (
          <img
            key={url}
            src={url}
            alt={`${nombre}, foto ${i + 1} de ${validas.length}`}
            className="h-full w-full shrink-0 snap-center bg-block object-cover"
            loading={i === 0 ? 'eager' : 'lazy'}
            onError={() => setRotas((r) => [...r, url])}
          />
        ))}
      </div>
      {validas.length > 1 && (
        <div className="absolute inset-x-0 bottom-8 flex justify-center gap-1.5" aria-hidden="true">
          {validas.map((url, i) => (
            <span
              key={url}
              className={`h-1.5 rounded-full bg-white shadow transition-[width,opacity] duration-200 ${i === actual ? 'w-4 opacity-100' : 'w-1.5 opacity-60'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * "Cómo llegar" sin salir de MiCuadra: pide la ubicación solo al tocar el botón y dibuja el
 * camino a pie en el mapa del perfil. La flecha usa la brújula si el celular la da.
 */
function useComoLlegar(destino: Punto) {
  const [estado, setEstado] = useState<'inactivo' | 'ubicando' | 'sin_ubicacion' | 'listo'>('inactivo')
  const [desde, setDesde] = useState<{ punto: Punto; precision: number } | null>(null)
  const { rumbo, pedirBrujula } = useBrujula()

  // Mientras el camino esté a la vista, el punto sigue a la persona.
  useEffect(() => {
    if (estado !== 'listo' || !('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition(
      (pos) => setDesde({ punto: { lat: pos.coords.latitude, lng: pos.coords.longitude }, precision: pos.coords.accuracy }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [estado])

  // El camino se recalcula solo si la persona se mueve más de ~25 m.
  const origen = desde ? { lat: Math.round(desde.punto.lat * 4000) / 4000, lng: Math.round(desde.punto.lng * 4000) / 4000 } : null
  const ruta = useQuery({
    queryKey: ['camino', origen, destino],
    queryFn: ({ signal }) => rutaAPie(origen as Punto, destino, signal),
    enabled: estado === 'listo' && origen !== null,
    staleTime: Infinity,
    retry: 1,
    placeholderData: keepPreviousData,
  })

  function pedir() {
    pedirBrujula()
    if (!('geolocation' in navigator)) return setEstado('sin_ubicacion')
    setEstado('ubicando')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDesde({ punto: { lat: pos.coords.latitude, lng: pos.coords.longitude }, precision: pos.coords.accuracy })
        setEstado('listo')
      },
      () => setEstado('sin_ubicacion'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  return {
    estado,
    ruta,
    yo: estado === 'listo' && desde ? { ...desde, rumbo } : null,
    pedir,
    quitar: () => setEstado('inactivo'),
  }
}

/** Fase 1: el botón mide demanda y lleva a la lista de espera (SPEC §6.3). */
function ModalProximamente({ nombre, alCerrar }: { nombre: string; alCerrar: () => void }) {
  const navigate = useNavigate()
  const [pedido, setPedido] = useState('')

  function irALista() {
    try {
      if (pedido.trim()) sessionStorage.setItem(CLAVE_QUE_PEDIRIA, `${pedido.trim()} (en ${nombre})`)
    } catch {
      // sin almacenamiento: la lista de espera simplemente sale vacía
    }
    navigate('/conoce#lista')
  }

  return (
    <Dialogo titulo="Los mandados llegan muy pronto" alCerrar={alCerrar}>
      <p className="text-4xl" aria-hidden="true">
        🛵
      </p>
      <h2 className="mt-2 text-2xl font-black">Los mandados llegan muy pronto</h2>
      <p className="mt-2 text-muted">
        Pronto un vecino podrá ir a {nombre} por ti. Inscríbete en la lista de espera y serás de los primeros en
        usarlo.
      </p>
      <label className="mt-4 flex flex-col gap-1">
        <span className="font-bold">¿Qué le habrías pedido?</span>
        <input
          maxLength={150}
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          placeholder="Ej.: 6 panes y una leche"
          className="tap w-full rounded-caja border border-line bg-bg px-4 text-base"
        />
      </label>
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" onClick={irALista} className="tap rounded-caja bg-green px-4 font-bold text-green-ink">
          Quiero estar en la lista
        </button>
        <button type="button" onClick={alCerrar} className="tap rounded-caja border border-line px-4 font-bold">
          Ahora no
        </button>
      </div>
    </Dialogo>
  )
}

const MOTIVOS: { motivo: ReporteEntrada['motivo']; texto: string }[] = [
  { motivo: 'cerro', texto: 'Ya no existe o cerró' },
  { motivo: 'horario', texto: 'El horario está mal' },
  { motivo: 'ubicacion', texto: 'La ubicación o dirección está mal' },
  { motivo: 'contacto', texto: 'El WhatsApp o el teléfono no sirven' },
  { motivo: 'otro', texto: 'Otra cosa' },
]

function ModalReportar({ negocioId, alCerrar }: { negocioId: string; alCerrar: () => void }) {
  const [motivo, setMotivo] = useState<ReporteEntrada['motivo'] | null>(null)
  const [detalle, setDetalle] = useState('')
  const reportar = useMutation({
    mutationFn: (datos: ReporteEntrada) => apiEnviar<null>('POST', `/negocios/${negocioId}/reportes`, datos),
  })

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (motivo) reportar.mutate({ motivo, detalle: detalle.trim() || null })
  }

  return (
    <Dialogo titulo="Reportar información incorrecta" alCerrar={alCerrar}>
      {reportar.isSuccess ? (
        <div role="status" className="entra">
          <h2 className="text-2xl font-black">¡Gracias por avisar!</h2>
          <p className="mt-2 text-muted">El equipo de MiCuadra lo revisa y corrige el mapa.</p>
          <button type="button" onClick={alCerrar} className="tap mt-5 w-full rounded-caja bg-green px-4 font-bold text-green-ink">
            Listo
          </button>
        </div>
      ) : (
        <form onSubmit={enviar}>
          <h2 className="text-2xl font-black">¿Qué está mal?</h2>
          <fieldset className="mt-3 flex flex-col gap-1">
            <legend className="sr-only">Motivo</legend>
            {MOTIVOS.map((m) => (
              <label key={m.motivo} className="tap flex items-center gap-3">
                <input
                  type="radio"
                  name="motivo"
                  checked={motivo === m.motivo}
                  onChange={() => setMotivo(m.motivo)}
                  className="size-5 accent-[var(--green)]"
                />
                {m.texto}
              </label>
            ))}
          </fieldset>
          <label className="mt-3 flex flex-col gap-1">
            <span className="font-bold">Cuéntanos más (opcional)</span>
            <textarea
              maxLength={500}
              rows={3}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              className="w-full rounded-caja border border-line bg-bg px-4 py-2 text-base"
            />
          </label>
          {reportar.isError && (
            <p role="alert" className="mt-2 text-sm font-bold text-red">
              {reportar.error.message}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="submit"
              disabled={!motivo || reportar.isPending}
              className="tap rounded-caja bg-green px-4 font-bold text-green-ink disabled:opacity-50"
            >
              {reportar.isPending ? 'Enviando…' : 'Enviar reporte'}
            </button>
            <button type="button" onClick={alCerrar} className="tap rounded-caja border border-line px-4 font-bold">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </Dialogo>
  )
}
