import type { TipoEvento } from '@micuadra/shared'
import { apiPost } from './api'

const CLAVE_ANON = 'micuadra.anon_id'
const CLAVE_SESION = 'micuadra.sesion'

/** El navegador pide no rastrear (Do Not Track o Global Privacy Control). */
export function noRastrear(): boolean {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean }
  return n.doNotTrack === '1' || n.globalPrivacyControl === true
}

/** Id aleatorio del navegador, sin datos personales (SPEC §9). */
export function anonId(): string {
  try {
    const guardado = localStorage.getItem(CLAVE_ANON)
    if (guardado) return guardado
    const nuevo = crypto.randomUUID()
    localStorage.setItem(CLAVE_ANON, nuevo)
    return nuevo
  } catch {
    return crypto.randomUUID()
  }
}

type Metadata = Record<string, string | number | boolean | null>

/** Registra un evento sin bloquear la interfaz. Resuelve `true` si el API lo guardó. */
export function registrarEvento(tipo: TipoEvento, negocioId?: string, metadata?: Metadata): Promise<boolean> {
  if (noRastrear()) return Promise.resolve(false)
  return apiPost('/eventos', { tipo, anon_id: anonId(), negocio_id: negocioId ?? null, metadata: metadata ?? {} })
    .then((r) => r.ok)
    .catch(() => false)
}

/** Un evento `sesion` por pestaña: base de "sesiones únicas por semana". */
export function registrarSesion(): void {
  try {
    if (sessionStorage.getItem(CLAVE_SESION)) return
  } catch {
    // sin sessionStorage (modo privado estricto): se registra igual
  }
  void registrarEvento('sesion').then((ok) => {
    if (!ok) return // se reintenta en la próxima carga
    try {
      sessionStorage.setItem(CLAVE_SESION, '1')
    } catch {
      // sin sessionStorage
    }
  })
}
