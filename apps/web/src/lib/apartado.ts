import type { Apartado } from './api'
import { formatoCOP } from './formato'

// Internamente siguen siendo "apartados" (tablas y rutas del API); para el vecino y el
// negocio son pedidos contra entrega: se paga al recibir, sin pasarela de pagos.

type Estado = Apartado['estado']
type ConEntrega = Pick<Apartado, 'estado' | 'entrega'>

const CLASE: Record<Estado, string> = {
  pendiente: 'bg-sun text-sun-ink',
  confirmado: 'bg-green/15 text-green',
  listo: 'bg-green text-green-ink',
  entregado: 'bg-block text-muted',
  cancelado: 'bg-red/15 text-red',
}

/** Nombre del paso: "listo" se dice distinto si lo recogen o si la tienda lo lleva. */
export function textoEstado(a: ConEntrega): string {
  switch (a.estado) {
    case 'pendiente':
      return 'Recibido'
    case 'confirmado':
      return 'Preparando'
    case 'listo':
      return a.entrega === 'domicilio' ? 'En camino' : 'Listo para recoger'
    case 'entregado':
      return 'Entregado'
    case 'cancelado':
      return 'Cancelado'
  }
}

export function estadoPedido(a: ConEntrega): { texto: string; clase: string } {
  return { texto: textoEstado(a), clase: CLASE[a.estado] }
}

export interface Paso {
  estado: Exclude<Estado, 'cancelado'>
  texto: string
  ayuda: string
  hora: string | null
  hecho: boolean
  actual: boolean
}

const ORDEN: Paso['estado'][] = ['pendiente', 'confirmado', 'listo', 'entregado']

/** Los cuatro pasos del pedido para la línea de seguimiento, con la hora de cada uno. */
export function pasosPedido(a: Apartado): Paso[] {
  const domicilio = a.entrega === 'domicilio'
  const actual = ORDEN.indexOf(a.estado as Paso['estado'])
  const horas: Record<Paso['estado'], string | null> = {
    pendiente: a.created_at,
    confirmado: a.confirmado_at,
    listo: a.listo_at,
    entregado: a.entregado_at,
  }
  const ayudas: Record<Paso['estado'], string> = {
    pendiente: 'La tienda lo está revisando',
    confirmado: 'Están alistando tu pedido',
    listo: domicilio ? 'Va para tu casa' : 'Pasa por él a la tienda',
    entregado: 'Pagado al recibir',
  }
  return ORDEN.map((estado, i) => ({
    estado,
    texto: textoEstado({ estado, entrega: a.entrega }),
    ayuda: ayudas[estado],
    hora: horas[estado],
    hecho: actual >= 0 && i <= actual,
    actual: i === actual,
  }))
}

/** Total para mostrar: si algo no tiene precio, se avisa que falta sumarlo. */
export function textoTotal(a: Pick<Apartado, 'total' | 'hay_sin_precio'>): string {
  if (a.total === 0 && a.hay_sin_precio) return 'Precio por confirmar'
  return a.hay_sin_precio ? `${formatoCOP(a.total)} + lo que falta por precio` : formatoCOP(a.total)
}

/** "Efectivo (paga con $50.000)" o "Transferencia al recibir". */
export function textoPago(a: Pick<Apartado, 'forma_pago' | 'paga_con' | 'total'>): string {
  if (a.forma_pago === 'transferencia') return 'Transferencia (Nequi, Daviplata…) al recibir'
  if (a.paga_con && a.paga_con > a.total) {
    return `Efectivo: paga con ${formatoCOP(a.paga_con)}, cambio ${formatoCOP(a.paga_con - a.total)}`
  }
  return 'Efectivo al recibir'
}

export function textoEntrega(a: Pick<Apartado, 'entrega' | 'direccion_entrega'>): string {
  return a.entrega === 'domicilio' ? `Domicilio: ${a.direccion_entrega ?? ''}` : 'Lo recoge en la tienda'
}

/** Mensaje de WhatsApp que el vecino le manda al negocio al pedir. */
export function mensajeApartado(a: Apartado): string {
  const lineas = a.items.map(
    (i) => `• ${i.cantidad} × ${i.nombre}${i.precio !== null ? ` — ${formatoCOP(i.precio * i.cantidad)}` : ''}`,
  )
  return [
    `Hola, ${a.negocio.nombre}. Hice un pedido por MiCuadra 🛒`,
    `Código: *${a.codigo}*`,
    '',
    ...lineas,
    '',
    `Total: ${textoTotal(a)}`,
    a.entrega === 'domicilio' ? `Para llevar a: ${a.direccion_entrega ?? ''}` : 'Lo recojo en la tienda.',
    `Pago contra entrega: ${textoPago(a)}`,
    ...(a.nota ? [`Nota: ${a.nota}`] : []),
  ].join('\n')
}
