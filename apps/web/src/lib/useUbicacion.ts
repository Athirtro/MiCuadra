import { useCallback, useEffect, useMemo, useState } from 'react'
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
  /** Hacia dónde mira o camina, en grados desde el norte (0–360); null si no se sabe. */
  rumbo: number | null
}

type EventoBrujula = DeviceOrientationEvent & { webkitCompassHeading?: number }
type OrientacionConPermiso = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }

/**
 * Brújula del celular. Donde el navegador lo exige (iPhone, Chrome reciente) el permiso se pide
 * desde un toque del usuario (`pedirBrujula`).
 */
export function useBrujula() {
  const [rumbo, setRumbo] = useState<number | null>(null)
  const [activa, setActiva] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return
    // iPhone (y Chrome reciente) exigen permiso pedido desde un toque; sin él no hay eventos.
    const pidePermiso = typeof (DeviceOrientationEvent as OrientacionConPermiso).requestPermission === 'function'
    if (pidePermiso && !activa) return
    let ultimo = -1
    const alGirar = (e: Event) => {
      const ev = e as EventoBrujula
      // iPhone trae el rumbo listo; Android da alpha absoluto (antihorario desde el norte).
      const grados =
        ev.webkitCompassHeading ?? (ev.absolute && ev.alpha !== null ? (360 - ev.alpha) % 360 : null)
      if (grados === null || grados === undefined) return
      // Menos de 4° no se nota y evita redibujar a cada vibración del sensor.
      if (ultimo >= 0 && Math.abs(grados - ultimo) < 4) return
      ultimo = grados
      setRumbo(grados)
    }
    const evento = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
    window.addEventListener(evento, alGirar)
    return () => window.removeEventListener(evento, alGirar)
  }, [activa])

  const pedirBrujula = useCallback(() => {
    const pedir = (DeviceOrientationEvent as OrientacionConPermiso | undefined)?.requestPermission
    if (!pedir) return setActiva(true)
    pedir()
      .then((r) => setActiva(r === 'granted'))
      .catch(() => undefined)
  }, [])

  return { rumbo, pedirBrujula }
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
        setYo({ punto, precision: pos.coords.accuracy, rumbo: null })
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
      (pos) =>
        setYo({
          punto: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          precision: pos.coords.accuracy,
          // Al caminar el GPS sabe la dirección; quieto no (heading null o NaN).
          rumbo: pos.coords.heading !== null && !Number.isNaN(pos.coords.heading) && (pos.coords.speed ?? 0) > 0.5 ? pos.coords.heading : null,
        }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [seguir])

  /** Botón "mi ubicación". */
  const pedirGps = useCallback(() => {
    if (!hayGps()) return
    // Si ya hay ubicación, se conserva mientras llega la nueva (el mapa no desaparece).
    setUbicacion((u) => (u.estado === 'barrio' || u.estado === 'gps' ? u : { estado: 'buscando' }))
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

  const { rumbo: brujula, pedirBrujula } = useBrujula()
  // El rumbo del GPS (caminando) manda; quieto, el de la brújula.
  const yoConRumbo = useMemo(() => (yo ? { ...yo, rumbo: yo.rumbo ?? brujula } : null), [yo, brujula])

  /** Botón "centrarme": vuelve a pedir la ubicación y, en iPhone, el permiso de la brújula. */
  const centrarme = useCallback(() => {
    pedirBrujula()
    pedirGps()
  }, [pedirBrujula, pedirGps])

  return { ubicacion, yo: yoConRumbo, pedirGps, centrarme, elegirBarrio }
}
