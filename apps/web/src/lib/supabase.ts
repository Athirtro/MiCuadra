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
