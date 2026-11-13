import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { apiGet, type Estadisticas, type MiNegocio } from '../lib/api'
import { formatoCOP } from '../lib/formato'
import { usePerfil } from '../lib/sesion'
import { Cargando } from './Cuenta'

const PERIODOS = [7, 30, 90] as const
type Clave = keyof Estadisticas['totales']

const TARJETAS: { clave: Clave; titulo: string; emoji: string; dinero?: boolean }[] = [
  { clave: 'vistas', titulo: 'Vieron tu ficha', emoji: '👀' },
  { clave: 'vecinos', titulo: 'Vecinos distintos', emoji: '🏘️' },
  { clave: 'como_llegar', titulo: 'Pidieron cómo llegar', emoji: '🚶' },
  { clave: 'whatsapp', titulo: 'Te escribieron', emoji: '💬' },
  { clave: 'apartados', titulo: 'Apartados', emoji: '🛍️' },
  { clave: 'vendido', titulo: 'Entregado', emoji: '💵', dinero: true },
]

const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

/** Estadísticas del negocio para su dueño (o un admin): qué tanto lo ven y lo buscan. */
export function EstadisticasNegocio() {
  const { id = '' } = useParams()
  const { sesion, token, cargandoSesion } = usePerfil()
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30)

  const negocios = useQuery({
    queryKey: ['mis-negocios', sesion?.user.id],
    queryFn: () => apiGet<MiNegocio[]>('/mis-negocios', undefined, token),
    enabled: Boolean(token),
  })
  const datos = useQuery({
    queryKey: ['estadisticas', id, dias],
    queryFn: () => apiGet<Estadisticas>(`/mis-negocios/${id}/estadisticas?dias=${dias}`, undefined, token),
    enabled: Boolean(token),
    placeholderData: keepPreviousData,
  })

  if (cargandoSesion) return <Cargando />
  if (!sesion || !token) return <Navigate to="/entrar" replace />
  if (datos.isPending) return <Cargando />
  if (datos.isError) {
    return (
      <section className="mx-auto max-w-md px-4 py-10">
        <p role="alert" className="font-bold">
          {datos.error.message}
        </p>
        <Link to="/cuenta" className="mt-3 inline-block font-bold text-green underline">
          Volver a mi cuenta
        </Link>
      </section>
    )
  }

  const e = datos.data
  const negocio = negocios.data?.find((n) => n.id === id)
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-8 pb-28" aria-busy={datos.isFetching}>
      <div>
        <Link to="/cuenta" className="text-sm font-bold text-green underline">
          ← Mi cuenta
        </Link>
        <h1 className="mt-1 text-2xl font-black">Cómo le va a {negocio?.nombre ?? 'este negocio'}</h1>
        <p className="mt-1 text-muted">Lo que hacen los vecinos con tu ficha en MiCuadra. Se cuenta en hora de Colombia.</p>
      </div>

      <div className="flex w-fit gap-1 rounded-full border border-line bg-surface p-1" role="radiogroup" aria-label="Periodo">
        {PERIODOS.map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={dias === d}
            onClick={() => setDias(d)}
            className={`h-9 rounded-full px-4 text-sm font-bold ${dias === d ? 'bg-green text-green-ink' : 'text-ink'}`}
          >
            {d} días
          </button>
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TARJETAS.map((t) => (
          <Tarjeta
            key={t.clave}
            {...t}
            valor={e.totales[t.clave]}
            antes={e.anteriores[t.clave]}
            dias={dias}
          />
        ))}
      </ul>

      <GraficaVistas porDia={e.por_dia} />

      <section className="tarjeta p-4" aria-labelledby="titulo-top">
        <h2 id="titulo-top" className="text-lg font-black">
          Lo más apartado
        </h2>
        {e.mas_apartados.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Todavía no te han apartado nada en estos {dias} días.</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-2">
            {e.mas_apartados.map((p, k) => {
              const max = e.mas_apartados[0]?.unidades ?? 1
              return (
                <li key={p.nombre} className="flex items-center gap-3 text-sm">
                  <span className="w-5 font-mono text-muted">{k + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2">
                      <span className="truncate font-bold">{p.nombre}</span>
                      <span className="shrink-0 tabular-nums">{p.unidades} und.</span>
                    </span>
                    <span className="mt-1 block h-1.5 rounded-full bg-block">
                      <span className="block h-full rounded-full bg-green" style={{ width: `${(p.unidades / max) * 100}%` }} />
                    </span>
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </section>
  )
}

function Tarjeta({
  titulo,
  emoji,
  valor,
  antes,
  dinero,
  dias,
}: {
  titulo: string
  emoji: string
  valor: number
  antes: number
  dinero?: boolean
  dias: number
}) {
  const cambio = antes === 0 ? null : Math.round(((valor - antes) / antes) * 100)
  return (
    <li className="tarjeta flex flex-col gap-1 p-3">
      <span className="text-sm text-muted">
        <span aria-hidden="true">{emoji}</span> {titulo}
      </span>
      <span className="text-2xl font-black tabular-nums">{dinero ? formatoCOP(valor) : valor.toLocaleString('es-CO')}</span>
      <span className="text-xs text-muted">
        {cambio === null ? (
          antes === 0 && valor > 0 ? 'Nuevo en este periodo' : `Igual que los ${dias} días anteriores`
        ) : (
          <>
            <span className={`font-bold ${cambio >= 0 ? 'text-green' : 'text-red'}`}>
              {cambio >= 0 ? '▲' : '▼'} {Math.abs(cambio)}%
            </span>{' '}
            vs. {dias} días antes
          </>
        )}
      </span>
    </li>
  )
}

/** Barras de vistas por día (una sola serie: el título la nombra). Tocar una barra muestra el detalle. */
function GraficaVistas({ porDia }: { porDia: Estadisticas['por_dia'] }) {
  const [activo, setActivo] = useState<number | null>(null)
  const max = Math.max(1, ...porDia.map((d) => d.vistas))
  const dia = activo !== null ? porDia[activo] : null
  const total = porDia.reduce((s, d) => s + d.vistas, 0)
  return (
    <section className="tarjeta p-4" aria-labelledby="titulo-grafica">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="titulo-grafica" className="text-lg font-black">
          Vistas por día
        </h2>
        <p className="text-sm text-muted tabular-nums" aria-live="polite">
          {dia
            ? `${fechaCorta(dia.fecha)}: ${dia.vistas} vistas · ${dia.contactos} contactos · ${dia.apartados} apartados`
            : `Máximo ${max} en un día`}
        </p>
      </div>
      {total === 0 ? (
        <p className="mt-3 text-sm text-muted">Aún no hay vistas en este periodo. Comparte tu ficha para que te encuentren.</p>
      ) : (
        <>
          <div
            className="mt-4 flex h-36 items-end gap-[2px] border-b border-line"
            onMouseLeave={() => setActivo(null)}
            aria-hidden="true"
          >
            {porDia.map((d, k) => (
              <button
                key={d.fecha}
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setActivo(k)}
                onClick={() => setActivo(activo === k ? null : k)}
                className="group flex h-full min-w-0 flex-1 items-end"
              >
                <span
                  className={`block w-full rounded-t-[4px] transition-colors ${activo === k ? 'bg-ink' : 'bg-green'} ${d.vistas === 0 ? 'opacity-0' : ''}`}
                  style={{ height: `${Math.max(3, (d.vistas / max) * 100)}%` }}
                />
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>{fechaCorta(porDia[0]?.fecha ?? '')}</span>
            <span>Hoy</span>
          </div>
          <table className="sr-only">
            <caption>Vistas, contactos y apartados por día</caption>
            <thead>
              <tr>
                <th>Día</th>
                <th>Vistas</th>
                <th>Contactos</th>
                <th>Apartados</th>
              </tr>
            </thead>
            <tbody>
              {porDia.map((d) => (
                <tr key={d.fecha}>
                  <td>{fechaCorta(d.fecha)}</td>
                  <td>{d.vistas}</td>
                  <td>{d.contactos}</td>
                  <td>{d.apartados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
