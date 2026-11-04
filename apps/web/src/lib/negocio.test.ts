import { describe, expect, it } from 'vitest'
import { diaHoy, emojiCategoria, enlaceComoLlegar, enlaceWhatsapp, horariosPorDia } from './negocio'

describe('negocio', () => {
  it('arma el enlace de WhatsApp con indicativo de Colombia y saludo', () => {
    const url = enlaceWhatsapp('3001234567', 'Tienda Doña Rosa')
    expect(url.startsWith('https://wa.me/573001234567?text=')).toBe(true)
    expect(decodeURIComponent(url.split('text=')[1] ?? '')).toBe('Hola, Tienda Doña Rosa. Te encontré en MiCuadra 👋')
  })

  it('arma el enlace de "Cómo llegar"', () => {
    expect(enlaceComoLlegar({ lat: 4.798, lng: -75.73 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=4.798,-75.73',
    )
  })

  it('agrupa horarios por día empezando el lunes y marca días cerrados', () => {
    const dias = horariosPorDia([
      { dia_semana: 1, abre: '09:00', cierra: '12:30' },
      { dia_semana: 1, abre: '14:00', cierra: '19:30' },
      { dia_semana: 5, abre: '18:00', cierra: '01:00' },
    ])
    expect(dias[0]).toEqual(['Lunes', '9:00–12:30 · 14:00–19:30'])
    expect(dias[4]).toEqual(['Viernes', '18:00–1:00'])
    expect(dias[6]).toEqual(['Domingo', 'Cerrado'])
  })

  it('tiene emoji por categoría y uno genérico', () => {
    expect(emojiCategoria('panaderia')).toBe('🥖')
    expect(emojiCategoria('otra')).toBe('📍')
  })
})

describe('diaHoy', () => {
  it('usa la hora de Pereira, no la del celular', () => {
    // 3 a. m. UTC del lunes 2 de noviembre = 10 p. m. del domingo en Bogotá
    expect(diaHoy(new Date('2026-11-02T03:00:00Z'))).toBe(0)
    expect(diaHoy(new Date('2026-11-02T15:00:00Z'))).toBe(1)
  })
})
