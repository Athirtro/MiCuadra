import { useCallback, useEffect, useState } from 'react'
import type { Punto } from './api'

const CLAVE_BARRIO = 'micuadra.barrio'

export type Ubicacion =
  | { estado: 'buscando' }
  | { estado: 'gps'; punto: Punto }
  | { estado: 'barrio'; punto: Punto; barrio: string }
  | { estado: 'sin_ubicacion' }

/** Dónde está la persona ahora mismo (se actualiza mientras camina) y con qué precisión, en metros. */
export interface Yo {
  punto: Punto
  precision: number
}

export function barrioGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE_BARRIO)
  } catch {
    return null
  }
}

/** Geolocalización del navegador; si se niega o falla, el usuario elige un barrio. */
const hayGps = () => 'geolocation' in navigator

export function useUbicacion() {
  const [ubicacion, setUbicacion] = useState<Ubicacion>(() =>
    hayGps() ? { estado: 'buscando' } : { estado: 'sin_ubicacion' },
  )
  const [yo, setYo] = useState<Yo | null>(null)
  const [seguir, setSeguir] = useState(false)

  // Solo pide la posición; el estado cambia en los callbacks (asíncronos).
  const solicitar = useCallback(() => {
    if (!hayGps()) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const punto = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUbicacion({ estado: 'gps', punto })
        setYo({ punto, precision: pos.coords.accuracy })
        setSeguir(true)
      },
      () => setUbicacion((u) => (u.estado === 'barrio' ? u : { estado: 'sin_ubicacion' })),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 },
    )
  }, [])

  // Con permiso dado, el punto azul sigue a la persona sin mover la búsqueda (no recarga la lista).
  useEffect(() => {
    if (!seguir || !hayGps()) return
    const id = navigator.geolocation.watchPosition(
      (pos) => setYo({ punto: { lat: pos.coords.latitude, lng: pos.coords.longitude }, precision: pos.coords.accuracy }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [seguir])

  /** Botón "mi ubicación". */
  const pedirGps = useCallback(() => {
    if (!hayGps()) return
    setUbicacion((u) => (u.estado === 'barrio' ? u : { estado: 'buscando' }))
    solicitar()
  }, [solicitar])

  const elegirBarrio = useCallback((slug: string, punto: Punto) => {
    try {
      localStorage.setItem(CLAVE_BARRIO, slug)
    } catch {
      // sin almacenamiento: se elige solo por esta visita
    }
    setUbicacion({ estado: 'barrio', punto, barrio: slug })
  }, [])

  useEffect(solicitar, [solicitar])

  return { ubicacion, yo, pedirGps, elegirBarrio }
}
