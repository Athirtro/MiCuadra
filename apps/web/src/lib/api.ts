import type { components } from '@micuadra/shared/api'

export type Health = components['schemas']['Health']
export type Disponibilidad = components['schemas']['Disponibilidad']

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje)
  }
}

export async function apiGet<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${ruta}`, init)
  const cuerpo: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error = (cuerpo as { error?: { codigo?: string; mensaje?: string } } | null)?.error
    throw new ApiError(
      res.status,
      error?.codigo ?? 'error',
      error?.mensaje ?? 'No pudimos conectarnos. Revisa tu conexión.',
    )
  }
  return cuerpo as T
}
