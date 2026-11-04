import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router'
import type { CambioEstadoNegocio, NegocioAdmin } from '../../lib/api'
import { emojiCategoria } from '../../lib/negocio'
import { Estado, fecha, Filtro, useAdminMutation, useAdminQuery } from './Admin'

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Filtro etiqueta="Estado" valor={estado} opciones={ESTADOS} onChange={setEstado} />
        <input
          type="search"
          aria-label="Buscar negocio por nombre"
          placeholder="Buscar por nombre"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="tap rounded-r border border-line bg-surface px-4 text-base sm:w-64"
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
  const [motivo, setMotivo] = useState('')
  const cambiar = useAdminMutation<CambioEstadoNegocio>('POST', () => `/negocios/${n.id}/estado`, (v) => v)

  return (
    <li className="tarjeta p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: n.categoria.color }}>
            {emojiCategoria(n.categoria.slug)} {n.categoria.nombre}
            <span className="font-normal text-muted"> · {n.barrio?.nombre ?? 'Sin barrio piloto'}</span>
          </p>
          <h2 className="text-lg font-black">{n.nombre}</h2>
        </div>
        <span className="shrink-0 rounded bg-block px-2 py-0.5 text-xs font-bold">{ETIQUETA[n.estado]}</span>
      </div>
      {n.descripcion && <p className="mt-1 text-sm">{n.descripcion}</p>}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
        <dt className="text-muted">Dirección</dt>
        <dd>{n.direccion_texto ?? '—'}</dd>
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
              className="rounded-r border border-line bg-bg px-3 py-2 text-base font-normal"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={!motivo.trim() || cambiar.isPending} className="tap rounded-r bg-red px-4 font-bold text-white disabled:opacity-50">
              Rechazar
            </button>
            <button type="button" onClick={() => setRechazando(false)} className="tap rounded-r border border-line px-4 font-bold">
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
              className="tap rounded-r bg-green px-4 font-bold text-green-ink disabled:opacity-50"
            >
              {n.estado === 'pendiente' ? 'Aprobar' : 'Activar'}
            </button>
          )}
          {n.estado === 'pendiente' && (
            <button type="button" onClick={() => setRechazando(true)} className="tap rounded-r border border-line px-4 font-bold">
              Rechazar
            </button>
          )}
          {n.estado === 'activo' && (
            <>
              <Link to={`/n/${n.slug}`} className="tap inline-flex items-center rounded-r border border-line px-4 font-bold">
                Ver perfil
              </Link>
              <button
                type="button"
                disabled={cambiar.isPending}
                onClick={() => cambiar.mutate({ estado: 'inactivo' })}
                className="tap rounded-r border border-line px-4 font-bold disabled:opacity-50"
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
    </li>
  )
}
