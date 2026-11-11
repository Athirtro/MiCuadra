import { formatoCOP } from '../lib/formato'

/** Precio de un producto: con oferta, el normal tachado al lado del rebajado. */
export function Precio({ precio, oferta, className = '' }: { precio: number | null; oferta?: number | null; className?: string }) {
  if (precio === null) return <span className={`text-muted ${className}`}>Pregunta el precio</span>
  if (oferta === null || oferta === undefined) return <span className={`font-bold ${className}`}>{formatoCOP(precio)}</span>
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <span className="font-bold text-red">{formatoCOP(oferta)}</span>
      <s className="text-xs text-muted" aria-label={`antes ${formatoCOP(precio)}`}>
        {formatoCOP(precio)}
      </s>
    </span>
  )
}
