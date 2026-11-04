import type { Apartado } from './api'
import { formatoCOP } from './formato'

export const ESTADO_APARTADO: Record<Apartado['estado'], { texto: string; clase: string }> = {
  pendiente: { texto: 'Por confirmar', clase: 'bg-sun text-sun-ink' },
  confirmado: { texto: 'Confirmado', clase: 'bg-green/15 text-green' },
  listo: { texto: 'Listo para recoger', clase: 'bg-green text-green-ink' },
  entregado: { texto: 'Entregado', clase: 'bg-block text-muted' },
  cancelado: { texto: 'Cancelado', clase: 'bg-red/15 text-red' },
}

/** Total para mostrar: si algo no tiene precio, se avisa que falta sumarlo. */
export function textoTotal(a: Pick<Apartado, 'total' | 'hay_sin_precio'>): string {
  if (a.total === 0 && a.hay_sin_precio) return 'Precio por confirmar'
  return a.hay_sin_precio ? `${formatoCOP(a.total)} + lo que falta por precio` : formatoCOP(a.total)
}

/** Mensaje de WhatsApp que el vecino le manda al negocio al apartar. */
export function mensajeApartado(a: Apartado): string {
  const lineas = a.items.map(
    (i) => `• ${i.cantidad} × ${i.nombre}${i.precio !== null ? ` — ${formatoCOP(i.precio * i.cantidad)}` : ''}`,
  )
  return [
    `Hola, ${a.negocio.nombre}. Hice un apartado por MiCuadra 🛒`,
    `Código: *${a.codigo}*`,
    '',
    ...lineas,
    '',
    `Total: ${textoTotal(a)}`,
    ...(a.nota ? [`Nota: ${a.nota}`] : []),
    '',
    '¿Me confirmas cuando esté listo? Pago al recoger.',
  ].join('\n')
}
