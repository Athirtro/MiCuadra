import type { components } from '@micuadra/shared/api'

type Esquemas = components['schemas']
export type Health = Esquemas['Health']
export type Disponibilidad = Esquemas['Disponibilidad']
export type Categoria = Esquemas['Categoria']
export type Barrio = Esquemas['Barrio']
export type NegocioResumen = Esquemas['NegocioResumen']
export type ListaNegocios = Esquemas['ListaNegocios']
export type NegocioDetalle = Esquemas['NegocioDetalle']
export type Punto = Esquemas['Punto']
export type Perfil = Esquemas['Perfil']
export type PerfilEntrada = Esquemas['PerfilEntrada']
export type NegocioEntrada = Esquemas['NegocioEntrada']
export type MiNegocio = Esquemas['MiNegocio']
export type Horario = Esquemas['Horario']
export type Foto = Esquemas['Foto']
export type ListaEsperaEntrada = Esquemas['ListaEsperaEntrada']
export type ListaEsperaRespuesta = Esquemas['ListaEsperaRespuesta']
export type Metas = Esquemas['Metas']
export type ReporteEntrada = Esquemas['ReporteEntrada']
export type NegocioAdmin = Esquemas['NegocioAdmin']
export type CambioEstadoNegocio = Esquemas['CambioEstadoNegocio']
export type InscritoEspera = Esquemas['InscritoEspera']
export type Reporte = Esquemas['Reporte']
export type Entrevista = Esquemas['Entrevista']
export type EntrevistaEntrada = Esquemas['EntrevistaEntrada']
export type Gate = Esquemas['Gate']
export type Criterio = Esquemas['Criterio']

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

async function leer<T>(res: Response): Promise<T> {
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

async function pedir(ruta: string, init: RequestInit = {}, token?: string): Promise<Response> {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  try {
    return await fetch(`${BASE}${ruta}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'sin_conexion', 'No hay conexión. Revisa tus datos o el wifi.')
  }
}

export async function apiGet<T>(ruta: string, init?: RequestInit, token?: string): Promise<T> {
  return leer<T>(await pedir(ruta, init, token))
}

/** POST/PUT/PATCH/DELETE con JSON y sesión. */
export async function apiEnviar<T>(
  metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  ruta: string,
  cuerpo: unknown,
  token?: string,
): Promise<T> {
  const res = await pedir(
    ruta,
    { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) },
    token,
  )
  return leer<T>(res)
}

/** Descarga un archivo que pide sesión (ej. el CSV de la lista de espera). */
export async function apiDescargar(ruta: string, nombre: string, token?: string): Promise<void> {
  const res = await pedir(ruta, {}, token)
  if (!res.ok) await leer(res)
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre })
  a.click()
  URL.revokeObjectURL(url)
}

export interface FiltrosNegocios {
  centro: Punto
  radioM: number
  categoria?: string | null
  q?: string
  abiertoAhora?: boolean
}

export function rutaNegocios({ centro, radioM, categoria, q, abiertoAhora }: FiltrosNegocios): string {
  const p = new URLSearchParams({
    lat: centro.lat.toFixed(6),
    lng: centro.lng.toFixed(6),
    radio_m: String(radioM),
    limit: '100',
  })
  if (categoria) p.set('categoria', categoria)
  if (q?.trim()) p.set('q', q.trim())
  if (abiertoAhora) p.set('abierto_ahora', 'true')
  return `/negocios?${p}`
}

export function apiPost(ruta: string, cuerpo: unknown): Promise<Response> {
  return fetch(`${BASE}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    keepalive: true,
  })
}
