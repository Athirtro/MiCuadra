import { AuthClient } from '@supabase/auth-js'

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL as string | undefined
const LLAVE_PUBLICA = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** `false` si faltan las variables de Supabase (p. ej. en pruebas): la web funciona sin cuentas. */
export const authDisponible = Boolean(URL_SUPABASE && LLAVE_PUBLICA)

/**
 * Solo el módulo de autenticación de Supabase (mucho más liviano que el cliente completo).
 * PKCE: Google y el enlace por correo vuelven con `?code=` y el cliente lo canjea solo.
 */
export const auth = new AuthClient({
  url: `${URL_SUPABASE ?? 'http://localhost'}/auth/v1`,
  headers: { apikey: LLAVE_PUBLICA ?? '', Authorization: `Bearer ${LLAVE_PUBLICA ?? ''}` },
  storageKey: 'micuadra.sesion',
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  flowType: 'pkce',
})

/** A dónde vuelve el usuario después de Google o del enlace del correo. */
export const urlRegreso = () => `${location.origin}/cuenta`

const BUCKET_FOTOS = 'negocio-fotos'

/** Sube una foto a Supabase Storage con la sesión del dueño y devuelve su URL pública. */
export async function subirFoto(
  negocioId: string,
  foto: Blob,
  token: string,
  /** Subcarpeta dentro del negocio, p. ej. `catalogo` para las fotos de productos. */
  carpeta?: string,
): Promise<string> {
  const archivo = `${crypto.randomUUID()}.${foto.type === 'image/webp' ? 'webp' : 'jpg'}`
  const ruta = carpeta ? `${negocioId}/${carpeta}/${archivo}` : `${negocioId}/${archivo}`
  const res = await fetch(`${URL_SUPABASE}/storage/v1/object/${BUCKET_FOTOS}/${ruta}`, {
    method: 'POST',
    headers: { apikey: LLAVE_PUBLICA ?? '', Authorization: `Bearer ${token}`, 'Content-Type': foto.type, 'x-upsert': 'false' },
    body: foto,
  }).catch(() => null)
  if (!res?.ok) throw new Error('No pudimos subir la foto. Revisa tu conexión e intenta de nuevo.')
  return `${URL_SUPABASE}/storage/v1/object/public/${BUCKET_FOTOS}/${ruta}`
}

/** Borra el archivo de Storage (si falla, solo queda un archivo huérfano: no se avisa). */
export async function borrarArchivoFoto(url: string, token: string): Promise<void> {
  const marca = `/object/public/${BUCKET_FOTOS}/`
  const ruta = url.split(marca)[1]
  if (!ruta) return
  await fetch(`${URL_SUPABASE}/storage/v1/object/${BUCKET_FOTOS}/${ruta}`, {
    method: 'DELETE',
    headers: { apikey: LLAVE_PUBLICA ?? '', Authorization: `Bearer ${token}` },
  }).catch(() => null)
}
