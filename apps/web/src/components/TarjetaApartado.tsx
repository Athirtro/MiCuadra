import { Banknote, Check, MapPin, Store } from 'lucide-react'
import type { ReactNode } from 'react'
import { estadoPedido, pasosPedido, textoEntrega, textoPago, textoTotal } from '../lib/apartado'
import type { Apartado } from '../lib/api'
import { formatoCOP } from '../lib/formato'

const fecha = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Bogota',
})
const hora = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })

/** Línea de seguimiento: Recibido → Preparando → Listo / En camino → Entregado. */
export function SeguimientoPedido({ a }: { a: Apartado }) {
  if (a.estado === 'cancelado') return null
  const pasos = pasosPedido(a)
  return (
    <ol className="mt-3 grid grid-cols-4" aria-label="Seguimiento del pedido">
      {pasos.map((p, i) => (
        <li
          key={p.estado}
          aria-current={p.actual ? 'step' : undefined}
          className="relative flex flex-col items-center text-center"
        >
          {i > 0 && (
            <span
              aria-hidden="true"
              className={`absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2 ${p.hecho ? 'bg-green' : 'bg-line'}`}
            />
          )}
          <span
            aria-hidden="true"
            className={`relative grid size-7 place-items-center rounded-full border-2 text-xs font-black ${
              p.hecho ? 'border-green bg-green text-green-ink' : 'border-line bg-surface text-muted'
            } ${p.actual && a.estado !== 'entregado' ? 'ring-4 ring-green/25' : ''}`}
          >
            {p.hecho ? <Check className="size-4" strokeWidth={3} /> : i + 1}
          </span>
          <span className={`mt-1 text-xs leading-tight ${p.actual ? 'font-black' : p.hecho ? 'font-bold' : 'text-muted'}`}>
            {p.texto}
            <span className="sr-only">{p.hecho ? ' (hecho)' : ' (pendiente)'}</span>
          </span>
          {p.hecho && p.hora && <span className="font-mono text-[10px] text-muted">{hora.format(new Date(p.hora))}</span>}
        </li>
      ))}
    </ol>
  )
}

/** Un pedido con su seguimiento, líneas, entrega y pago; `titulo` y `acciones` cambian según quién lo mira. */
export function TarjetaApartado({
  a,
  titulo,
  acciones,
  seguimiento = true,
}: {
  a: Apartado
  titulo: ReactNode
  acciones?: ReactNode
  seguimiento?: boolean
}) {
  const estado = estadoPedido(a)
  const ayuda = pasosPedido(a).find((p) => p.actual)?.ayuda
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
      {seguimiento && <SeguimientoPedido a={a} />}
      {seguimiento && ayuda && a.estado !== 'entregado' && (
        <p className="mt-2 text-center text-sm text-muted">{ayuda}</p>
      )}
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
      <div className="mt-2 flex flex-col gap-1 text-sm">
        <p className="flex items-start gap-2">
          {a.entrega === 'domicilio' ? (
            <MapPin className="mt-0.5 size-4 shrink-0 text-green" aria-hidden="true" />
          ) : (
            <Store className="mt-0.5 size-4 shrink-0 text-green" aria-hidden="true" />
          )}
          {textoEntrega(a)}
        </p>
        <p className="flex items-start gap-2">
          <Banknote className="mt-0.5 size-4 shrink-0 text-green" aria-hidden="true" />
          {textoPago(a)}
        </p>
      </div>
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
