import { useMutation, useQuery } from '@tanstack/react-query'
import { ExternalLink, MapPinned, Pencil, Plus } from 'lucide-react'
import { lazy, Suspense, useDeferredValue, useState } from 'react'
import { Link } from 'react-router'
import { apiGet, type Barrio, type BarrioEnMapa, type CambioEstadoNegocio, type EdicionNegocio, type NegocioAdmin, type Punto } from '../../lib/api'
import { Dialogo } from '../../components/Dialogo'
import { IconoCategoria } from '../../components/Icono'
import { Estado, fecha, Filtro, useAdminMutation, useAdminQuery, useToken } from './Admin'

const SelectorUbicacion = lazy(() => import('../../components/MapaBarrio').then((m) => ({ default: m.SelectorUbicacion })))

const CENTRO_PEREIRA: Punto = { lat: 4.8133, lng: -75.6961 }
const ENTRADA = 'tap w-full rounded-caja border border-line bg-bg px-3 text-base font-normal'

type FiltroEstado = NegocioAdmin['estado'] | 'todos'

const ESTADOS: { valor: FiltroEstado; texto: string }[] = [
  { valor: 'pendiente', texto: 'Por aprobar' },
  { valor: 'activo', texto: 'Activos' },
  { valor: 'rechazado', texto: 'Rechazados' },
  { valor: 'inactivo', texto: 'Inactivos' },
  { valor: 'todos', texto: 'Todos' },
]

const ETIQUETA: Record<NegocioAdmin['estado'], string> = {
  pendiente: 'Por aprobar',
  activo: 'Activo',
  rechazado: 'Rechazado',
  inactivo: 'Inactivo',
  borrador: 'Borrador',
}

/** Cola de aprobación y lista de negocios (SPEC §6.5). */
export function Negocios() {
  const [estado, setEstado] = useState<FiltroEstado>('pendiente')
  const [q, setQ] = useState('')
  const qDiferida = useDeferredValue(q.trim())
  const params = new URLSearchParams()
  if (estado !== 'todos') params.set('estado', estado)
  if (qDiferida) params.set('q', qDiferida)
  const negocios = useAdminQuery<NegocioAdmin[]>(`/negocios?${params}`)

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/admin/negocios/agregar"
        className="tap inline-flex items-center justify-center self-start rounded-caja bg-green px-4 font-bold text-green-ink"
      >
        <Plus className="mr-1.5 size-5" aria-hidden="true" /> Agregar negocios (uno o por CSV)
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Filtro etiqueta="Estado" valor={estado} opciones={ESTADOS} onChange={setEstado} />
        <input
          type="search"
          aria-label="Buscar negocio por nombre"
          placeholder="Buscar por nombre"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="tap rounded-caja border border-line bg-surface px-4 text-base sm:w-64"
        />
      </div>
      <Estado cargando={negocios.isPending} error={negocios.error} vacio={negocios.data?.length === 0}>
        <p className="text-sm text-muted">{negocios.data?.length} negocios</p>
        <ul className="flex flex-col gap-3">
          {negocios.data?.map((n) => (
            <TarjetaNegocio key={n.id} n={n} />
          ))}
        </ul>
      </Estado>
    </div>
  )
}

function TarjetaNegocio({ n }: { n: NegocioAdmin }) {
  const [rechazando, setRechazando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const cambiar = useAdminMutation<CambioEstadoNegocio>('POST', () => `/negocios/${n.id}/estado`, (v) => v)

  return (
    <li className="tarjeta p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-bold" style={{ color: n.categoria.color }}>
            <IconoCategoria slug={n.categoria.slug} className="size-4" /> {n.categoria.nombre}
            <span className="font-normal text-muted"> · {n.barrio?.nombre ?? 'Sin barrio'}</span>
          </p>
          <h2 className="text-lg font-black">{n.nombre}</h2>
        </div>
        <span className="shrink-0 rounded bg-block px-2 py-0.5 text-xs font-bold">{ETIQUETA[n.estado]}</span>
      </div>
      {n.descripcion && <p className="mt-1 text-sm">{n.descripcion}</p>}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
        <dt className="text-muted">Dirección</dt>
        <dd>
          {n.direccion_texto ?? '—'}
          {n.ubicacion && (
            <a
              href={`https://www.google.com/maps?q=${n.ubicacion.lat},${n.ubicacion.lng}`}
              target="_blank"
              rel="noreferrer"
              className="ml-2 inline-flex items-center gap-0.5 font-bold text-green underline"
            >
              ver pin <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </dd>
        <dt className="text-muted">WhatsApp</dt>
        <dd className="font-mono">{n.whatsapp ?? '—'}</dd>
        <dt className="text-muted">Dueño</dt>
        <dd>{n.dueno ? `${n.dueno.nombre ?? ''} · ${n.dueno.email ?? ''}` : n.creado_por_admin ? 'Cargado por el equipo' : '—'}</dd>
        <dt className="text-muted">Registrado</dt>
        <dd>{fecha(n.created_at)}</dd>
      </dl>
      {n.reportes_abiertos > 0 && (
        <p className="mt-2 text-sm font-bold text-red">
          {n.reportes_abiertos} {n.reportes_abiertos === 1 ? 'reporte abierto' : 'reportes abiertos'}
        </p>
      )}
      {n.estado === 'rechazado' && n.motivo_rechazo && <p className="mt-2 text-sm">Motivo: {n.motivo_rechazo}</p>}

      {rechazando ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (motivo.trim()) cambiar.mutate({ estado: 'rechazado', motivo: motivo.trim() }, { onSuccess: () => setRechazando(false) })
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-bold">
            Motivo del rechazo (lo ve el dueño)
            <textarea
              required
              autoFocus
              maxLength={280}
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="rounded-caja border border-line bg-bg px-3 py-2 text-base font-normal"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={!motivo.trim() || cambiar.isPending} className="tap rounded-caja bg-red px-4 font-bold text-white disabled:opacity-50">
              Rechazar
            </button>
            <button type="button" onClick={() => setRechazando(false)} className="tap rounded-caja border border-line px-4 font-bold">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {n.estado !== 'activo' && (
            <button
              type="button"
              disabled={cambiar.isPending}
              onClick={() => cambiar.mutate({ estado: 'activo' })}
              className="tap rounded-caja bg-green px-4 font-bold text-green-ink disabled:opacity-50"
            >
              {n.estado === 'pendiente' ? 'Aprobar' : 'Activar'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="tap inline-flex items-center rounded-caja border border-line px-4 font-bold"
          >
            <Pencil className="mr-1.5 size-4" aria-hidden="true" /> Editar nombre y ubicación
          </button>
          {n.estado === 'pendiente' && (
            <button type="button" onClick={() => setRechazando(true)} className="tap rounded-caja border border-line px-4 font-bold">
              Rechazar
            </button>
          )}
          {n.estado === 'activo' && (
            <>
              <Link to={`/n/${n.slug}`} className="tap inline-flex items-center rounded-caja border border-line px-4 font-bold">
                Ver perfil
              </Link>
              <button
                type="button"
                disabled={cambiar.isPending}
                onClick={() => cambiar.mutate({ estado: 'inactivo' })}
                className="tap rounded-caja border border-line px-4 font-bold disabled:opacity-50"
              >
                Desactivar
              </button>
            </>
          )}
        </div>
      )}
      {cambiar.isError && (
        <p role="alert" className="mt-2 text-sm font-bold text-red">
          {cambiar.error.message}
        </p>
      )}
      {editando && <DialogoEdicion n={n} alCerrar={() => setEditando(false)} />}
    </li>
  )
}

/** Lee «4.8051, -75.7381» o un enlace de Google Maps (…@4.8051,-75.7381… o ?q=4.8051,-75.7381). */
function puntoDeTexto(texto: string): Punto | null {
  const m = texto.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/)
  if (!m) return null
  const p = { lat: Number(m[1]), lng: Number(m[2]) }
  return p.lat >= 4.6 && p.lat <= 5 && p.lng >= -76 && p.lng <= -75.5 ? p : null
}

/** El admin corrige el nombre, mueve el pin y ajusta la dirección y el barrio. */
function DialogoEdicion({ n, alCerrar }: { n: NegocioAdmin; alCerrar: () => void }) {
  const barrios = useQuery({ queryKey: ['barrios'], queryFn: () => apiGet<Barrio[]>('/barrios'), staleTime: Infinity })
  const [nombre, setNombre] = useState(n.nombre)
  const [punto, setPunto] = useState<Punto>(n.ubicacion ?? CENTRO_PEREIRA)
  const [direccion, setDireccion] = useState(n.direccion_texto ?? '')
  const [barrio, setBarrio] = useState(n.barrio?.nombre ?? '')
  const token = useToken()
  const delMapa = useMutation({
    mutationFn: (p: Punto) => apiGet<BarrioEnMapa>(`/admin/barrio-en-mapa?lat=${p.lat.toFixed(6)}&lng=${p.lng.toFixed(6)}`, undefined, token),
    onSuccess: (r) => {
      if (r.nombre) setBarrio(r.nombre)
    },
  })
  const [pegado, setPegado] = useState('')
  const guardar = useAdminMutation<EdicionNegocio>('PATCH', () => `/negocios/${n.id}`, (v) => v)
  const pegadoInvalido = pegado.trim() !== '' && puntoDeTexto(pegado) === null
  const valido = direccion.trim().length >= 3 && nombre.trim().length >= 2

  return (
    <Dialogo titulo={`Editar ${n.nombre}`} alCerrar={alCerrar}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valido) return
          guardar.mutate(
            { nombre: nombre.trim(), ubicacion: punto, direccion_texto: direccion.trim(), barrio: barrio.trim() || null },
            { onSuccess: alCerrar },
          )
        }}
      >
        <h2 className="text-xl font-black">Editar negocio</h2>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Nombre del negocio
          <input required minLength={2} maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} className={ENTRADA} />
        </label>
        <p className="text-sm text-muted">Toca el mapa o arrastra el pin justo donde está la puerta.</p>
        <Suspense fallback={<div className="esqueleto h-72 rounded-caja" />}>
          <SelectorUbicacion punto={punto} alCambiar={setPunto} categoria={n.categoria.slug} />
        </Suspense>
        <p className="font-mono text-xs text-muted">
          {punto.lat.toFixed(5)}, {punto.lng.toFixed(5)}
        </p>
        <label className="flex flex-col gap-1 text-sm font-bold">
          O pega las coordenadas o el enlace de Google Maps
          <input
            value={pegado}
            placeholder="4.8051, -75.7381"
            onChange={(e) => {
              setPegado(e.target.value)
              const p = puntoDeTexto(e.target.value)
              if (p) setPunto(p)
            }}
            className={ENTRADA}
            autoComplete="off"
          />
        </label>
        {pegadoInvalido && <p className="text-sm text-red">No encontré coordenadas de Pereira en ese texto.</p>}
        <label className="flex flex-col gap-1 text-sm font-bold">
          Dirección
          <input required minLength={3} maxLength={120} value={direccion} onChange={(e) => setDireccion(e.target.value)} className={ENTRADA} />
        </label>
        <div className="flex flex-col gap-1">
          <label htmlFor={`barrio-${n.id}`} className="text-sm font-bold">
            Barrio
          </label>
          <div className="flex gap-2">
            <input
              id={`barrio-${n.id}`}
              list={`barrios-${n.id}`}
              maxLength={60}
              value={barrio}
              placeholder="Cualquier barrio de Pereira"
              onChange={(e) => setBarrio(e.target.value)}
              className={ENTRADA}
              autoComplete="off"
            />
            <button
              type="button"
              disabled={delMapa.isPending}
              onClick={() => delMapa.mutate(punto)}
              className="tap inline-flex shrink-0 items-center rounded-caja border border-line px-3 text-sm font-bold disabled:opacity-50"
            >
              <MapPinned className="mr-1 size-4" aria-hidden="true" />
              {delMapa.isPending ? 'Buscando…' : 'Tomar del mapa'}
            </button>
          </div>
          <datalist id={`barrios-${n.id}`}>
            {barrios.data?.map((b) => (
              <option key={b.slug} value={b.nombre} />
            ))}
          </datalist>
          {delMapa.isSuccess && !delMapa.data.nombre && (
            <p className="text-sm text-muted">El mapa no sabe el barrio de ese punto: escríbelo.</p>
          )}
          {delMapa.isError && <p className="text-sm text-red">No pudimos consultar el mapa. Escribe el barrio.</p>}
        </div>
        {guardar.isError && (
          <p role="alert" className="text-sm font-bold text-red">
            {guardar.error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={!valido || guardar.isPending}
          className="tap rounded-caja bg-green px-4 font-bold text-green-ink disabled:opacity-50"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" onClick={alCerrar} className="tap font-bold text-muted">
          Cancelar
        </button>
      </form>
    </Dialogo>
  )
}
