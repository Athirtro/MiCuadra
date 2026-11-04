import type { ReactNode } from 'react'
import { ESTADO_APARTADO, textoTotal } from '../lib/apartado'
import type { Apartado } from '../lib/api'
import { formatoCOP } from '../lib/formato'

const fecha = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Bogota',
})

/** Un apartado con sus líneas y total; `titulo` y `acciones` cambian según quién lo mira. */
export function TarjetaApartado({ a, titulo, acciones }: { a: Apartado; titulo: ReactNode; acciones?: ReactNode }) {
  const estado = ESTADO_APARTADO[a.estado]
  return (
    <li className="tarjeta p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{titulo}</p>
          <p className="text-sm text-muted">
            <span className="font-mono font-bold text-ink">{a.codigo}</span> · {fecha.format(new Date(a.created_at))}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${estado.clase}`}>{estado.texto}</span>
      </div>
      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {a.items.map((i, n) => (
          <li key={`${i.item_id ?? i.nombre}-${n}`} className="flex justify-between gap-3">
            <span>
              <span className="font-mono font-bold">{i.cantidad} ×</span> {i.nombre}
            </span>
            <span className="shrink-0 text-muted">{i.precio !== null ? formatoCOP(i.precio * i.cantidad) : '—'}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex justify-between border-t border-line pt-2 font-bold">
        <span>Total</span>
        <span>{textoTotal(a)}</span>
      </p>
      {a.nota && <p className="mt-2 rounded-lg bg-block px-3 py-2 text-sm">«{a.nota}»</p>}
      {a.estado === 'cancelado' && (
        <p className="mt-2 text-sm text-muted">
          Cancelado por {a.cancelado_por === 'negocio' ? 'el negocio' : 'el vecino'}
          {a.motivo_cancelacion && `: ${a.motivo_cancelacion}`}
        </p>
      )}
      {acciones && <div className="mt-3 flex flex-wrap gap-2">{acciones}</div>}
    </li>
  )
}
