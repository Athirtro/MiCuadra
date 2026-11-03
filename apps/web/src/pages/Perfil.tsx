import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError, apiGet, type NegocioDetalle } from '../lib/api'
import { registrarEvento } from '../lib/eventos'
import { emojiCategoria, enlaceComoLlegar, enlaceWhatsapp, horariosPorDia } from '../lib/negocio'
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

  if (negocio.isPending) return <p className="mx-auto max-w-xl p-4 text-muted">Cargando…</p>
  if (negocio.isError) {
    const noExiste = negocio.error instanceof ApiError && negocio.error.status === 404
    return (
      <section className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">{noExiste ? 'Este negocio no está en el mapa' : 'No pudimos cargar el negocio'}</h1>
        <p className="mt-2 text-muted">{noExiste ? 'Puede que ya no exista o que aún no lo hayamos aprobado.' : negocio.error.message}</p>
        <Link to="/" className="tap mt-6 inline-flex items-center rounded-r bg-green px-5 font-bold text-green-ink">
          Volver al mapa
        </Link>
      </section>
    )
  }

  return <FichaNegocio n={negocio.data} />
}

function FichaNegocio({ n }: { n: NegocioDetalle }) {
  const [modalMandado, setModalMandado] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const emoji = emojiCategoria(n.categoria.slug)

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

  return (
    <article className="mx-auto max-w-xl pb-28">
      <Carrusel fotos={n.fotos} nombre={n.nombre} emoji={emoji} color={n.categoria.color} />

      <div className="px-4 pt-4">
        <p className="text-sm font-bold" style={{ color: n.categoria.color }}>
          {emoji} {n.categoria.nombre}
          {n.barrio && <span className="font-normal text-muted"> · {n.barrio.nombre}</span>}
        </p>
        <h1 className="mt-1 text-3xl leading-tight font-black">{n.nombre}</h1>
        <div className="mt-1 flex items-center gap-2">
          <EstadoAbierto abierto={n.abierto_ahora} />
          {n.cerrado_hoy && <span className="text-sm text-muted">· Hoy no abre</span>}
          {n.destacado && <span className="rounded bg-sun px-1.5 text-xs font-bold text-sun-ink">Destacado</span>}
        </div>
        {n.descripcion && <p className="mt-3">{n.descripcion}</p>}

        <div className="mt-5 grid grid-cols-2 gap-2">
          {n.whatsapp && (
            <a
              href={enlaceWhatsapp(n.whatsapp, n.nombre)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => registrarEvento('click_whatsapp', n.id)}
              className="tap col-span-2 flex items-center justify-center gap-2 rounded-r bg-green px-4 font-bold text-green-ink"
            >
              Escribir por WhatsApp
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              registrarEvento('click_pedir_mandado', n.id)
              setModalMandado(true)
            }}
            className="tap flex items-center justify-center gap-2 rounded-r bg-sun px-4 font-bold text-sun-ink"
          >
            🛵 Pedir mandado
          </button>
          <a
            href={enlaceComoLlegar(n.ubicacion)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => registrarEvento('click_como_llegar', n.id)}
            className="tap flex items-center justify-center rounded-r border border-line bg-surface px-4 font-bold"
          >
            Cómo llegar
          </a>
        </div>

        <section className="mt-6">
          <h2 className="text-lg font-black">Dónde queda</h2>
          {n.direccion_texto && <p className="mt-1">{n.direccion_texto}</p>}
          <div className="mt-2">
            <Suspense fallback={<div className="h-40 rounded-r bg-block" />}>
              <MiniMapa punto={n.ubicacion} color={n.categoria.color} emoji={emoji} />
            </Suspense>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-black">Horario</h2>
          {n.horarios.length ? (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {horariosPorDia(n.horarios).map(([dia, franjas]) => (
                <div key={dia} className="contents">
                  <dt className="font-bold">{dia}</dt>
                  <dd className={franjas === 'Cerrado' ? 'text-muted' : ''}>{franjas}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-1 text-muted">Este negocio no ha publicado su horario.</p>
          )}
        </section>

        <div className="mt-8 flex flex-wrap gap-2 text-sm">
          <button type="button" onClick={compartir} className="tap rounded-r border border-line px-4 font-bold">
            {copiado ? 'Enlace copiado ✓' : 'Compartir'}
          </button>
          {n.telefono && (
            <a href={`tel:${n.telefono}`} className="tap inline-flex items-center rounded-r border border-line px-4 font-bold">
              Llamar
            </a>
          )}
        </div>
      </div>

      {modalMandado && <ModalProximamente nombre={n.nombre} alCerrar={() => setModalMandado(false)} />}
    </article>
  )
}

function Carrusel({ fotos, nombre, emoji, color }: { fotos: string[]; nombre: string; emoji: string; color: string }) {
  if (!fotos.length) {
    return (
      <div className="grid aspect-[16/9] place-items-center text-6xl" style={{ background: `${color}22` }} aria-hidden="true">
        {emoji}
      </div>
    )
  }
  return (
    <div className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto" aria-label={`Fotos de ${nombre}`}>
      {fotos.map((url, i) => (
        <img
          key={url}
          src={url}
          alt={`${nombre}, foto ${i + 1} de ${fotos.length}`}
          className="h-full w-full shrink-0 snap-center object-cover"
          loading={i === 0 ? 'eager' : 'lazy'}
        />
      ))}
    </div>
  )
}

/** Fase 1: el botón mide demanda y lleva a la lista de espera (SPEC §6.3). */
function ModalProximamente({ nombre, alCerrar }: { nombre: string; alCerrar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    // Sin cleanup que llame close(): dispararía onClose y cerraría el modal recién abierto
    // (StrictMode monta los efectos dos veces). El <dialog> sale del DOM al desmontarse.
    const dialogo = ref.current
    if (dialogo && !dialogo.open) dialogo.showModal?.()
  }, [])

  return (
    <dialog
      ref={ref}
      onClose={alCerrar}
      aria-labelledby="titulo-mandado"
      className="m-auto w-[min(92vw,26rem)] rounded-r bg-surface p-6 text-ink backdrop:bg-black/50"
    >
      <p className="text-4xl" aria-hidden="true">
        🛵
      </p>
      <h2 id="titulo-mandado" className="mt-2 text-2xl font-black">
        Los mandados llegan muy pronto
      </h2>
      <p className="mt-2 text-muted">
        Pronto un vecino podrá ir a {nombre} por ti. Inscríbete en la lista de espera y serás de los primeros en
        usarlo.
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Link to="/conoce#lista" className="tap flex items-center justify-center rounded-r bg-green px-4 font-bold text-green-ink">
          Quiero estar en la lista
        </Link>
        <button type="button" onClick={alCerrar} className="tap rounded-r border border-line px-4 font-bold">
          Ahora no
        </button>
      </div>
    </dialog>
  )
}
