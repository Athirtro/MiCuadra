import type { Punto } from './api'

/** Emoji por categoría: liviano, sin descargar íconos, y se entiende en cualquier celular. */
export const EMOJI_CATEGORIA: Record<string, string> = {
  tienda: '🏪',
  panaderia: '🥖',
  barberia: '💈',
  drogueria: '💊',
  fruver: '🍎',
  papeleria: '✏️',
  taller: '🔧',
  gimnasio: '🏋️',
  lavanderia: '👕',
  'comida-casera': '🍲',
}

export function emojiCategoria(slug: string): string {
  return EMOJI_CATEGORIA[slug] ?? '📍'
}

/** `3001234567` → enlace de WhatsApp con el saludo de MiCuadra. */
export function enlaceWhatsapp(celular: string, nombreNegocio: string): string {
  const texto = `Hola, ${nombreNegocio}. Te encontré en MiCuadra 👋`
  return `https://wa.me/57${celular}?text=${encodeURIComponent(texto)}`
}

/** Abre la app de mapas del celular (Google Maps entiende el formato en Android, iOS y web). */
export function enlaceComoLlegar({ lat, lng }: Punto): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const

/** Horarios agrupados por día, empezando el lunes: `[["Lunes", "9:00–12:30 · 14:00–19:30"], …]`. */
export function horariosPorDia(horarios: { dia_semana: number; abre: string; cierra: string }[]): [string, string][] {
  const orden = [1, 2, 3, 4, 5, 6, 0]
  return orden.map((dia) => {
    const franjas = horarios.filter((h) => h.dia_semana === dia).map((h) => `${hora(h.abre)}–${hora(h.cierra)}`)
    return [DIAS[dia] ?? '', franjas.length ? franjas.join(' · ') : 'Cerrado']
  })
}

function hora(hhmm: string): string {
  const [h = '0', m = '00'] = hhmm.split(':')
  return `${Number(h)}:${m}`
}

/** Día de la semana en Pereira (0 = domingo), sin importar la zona del celular. */
export function diaHoy(ahora = new Date()): number {
  const nombre = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Bogota' }).format(ahora)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(nombre)
}
