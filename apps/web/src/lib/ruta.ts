import type { Punto } from './api'

/** Camino a pie calculado por OSRM sobre OpenStreetMap. */
export interface Ruta {
  /** Puntos del trazado como [lat, lng], listos para Leaflet. */
  trazado: [number, number][]
  metros: number
  minutos: number
}

// Servidor público de rutas a pie de FOSSGIS (OpenStreetMap Alemania). Recibe solo los dos
// puntos del trayecto (tu ubicación y el negocio), sin nombre ni cuenta; lo dice /privacidad.
const SERVIDOR = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'

interface RespuestaOsrm {
  code: string
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[]
}

export async function rutaAPie(desde: Punto, hasta: Punto, signal?: AbortSignal): Promise<Ruta> {
  const coords = `${desde.lng},${desde.lat};${hasta.lng},${hasta.lat}`
  const r = await fetch(`${SERVIDOR}/${coords}?overview=full&geometries=geojson`, { signal })
  if (!r.ok) throw new Error('No pudimos calcular el camino. Intenta de nuevo.')
  const datos = (await r.json()) as RespuestaOsrm
  const ruta = datos.routes?.[0]
  if (datos.code !== 'Ok' || !ruta) throw new Error('No encontramos un camino a pie hasta este negocio.')
  return {
    trazado: ruta.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    metros: Math.round(ruta.distance),
    // A pie, OSRM supone ~5 km/h; se redondea hacia arriba y nunca menos de 1 minuto.
    minutos: Math.max(1, Math.ceil(ruta.duration / 60)),
  }
}
