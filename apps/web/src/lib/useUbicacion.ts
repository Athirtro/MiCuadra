import { useCallback, useEffect, useState } from 'react'
import type { Punto } from './api'

const CLAVE_BARRIO = 'micuadra.barrio'

export type Ubicacion =
  | { estado: 'buscando' }
  | { estado: 'gps'; punto: Punto }
  | { estado: 'barrio'; punto: Punto; barrio: string }
  | { estado: 'sin_ubicacion' }

export function barrioGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE_BARRIO)
  } catch {
    return null
  }
}

/** Geolocalización del navegador; si se niega o falla, el usuario elige un barrio piloto. */
const hayGps = () => 'geolocation' in navigator

export function useUbicacion() {
  const [ubicacion, setUbicacion] = useState<Ubicacion>(() =>
    hayGps() ? { estado: 'buscando' } : { estado: 'sin_ubicacion' },
  )

  // Solo pide la posición; el estado cambia en los callbacks (asíncronos).
  const solicitar = useCallback(() => {
    if (!hayGps()) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setUbicacion({ estado: 'gps', punto: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      () => setUbicacion((u) => (u.estado === 'barrio' ? u : { estado: 'sin_ubicacion' })),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 },
    )
  }, [])

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

  return { ubicacion, pedirGps, elegirBarrio }
}
