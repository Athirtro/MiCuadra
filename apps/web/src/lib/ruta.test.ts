import { afterEach, describe, expect, it, vi } from 'vitest'
import { rutaAPie } from './ruta'

afterEach(() => vi.unstubAllGlobals())

describe('rutaAPie', () => {
  it('pide la ruta a pie y voltea las coordenadas a [lat, lng]', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'Ok',
          routes: [{ distance: 412.6, duration: 301, geometry: { coordinates: [[-75.73, 4.798], [-75.729, 4.8]] } }],
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchFalso)
    const ruta = await rutaAPie({ lat: 4.798, lng: -75.73 }, { lat: 4.8, lng: -75.729 })
    expect(String(fetchFalso.mock.calls[0]?.[0])).toContain('/foot/-75.73,4.798;-75.729,4.8?')
    expect(ruta).toEqual({ trazado: [[4.798, -75.73], [4.8, -75.729]], metros: 413, minutos: 6 })
  })

  it('explica cuando no hay camino', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'NoRoute' }))))
    await expect(rutaAPie({ lat: 4.8, lng: -75.7 }, { lat: 4.81, lng: -75.71 })).rejects.toThrow('No encontramos un camino')
  })
})
