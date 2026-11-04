import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { useSesion } from '../lib/sesion'
import { auth, authDisponible, urlRegreso } from '../lib/supabase'

/** Entrar y crear cuenta son lo mismo: la primera vez que entras, se crea tu cuenta. */
export function Entrar() {
  const { sesion } = useSesion()
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState<'inicio' | 'enviando' | 'enviado' | 'error'>('inicio')
  const [error, setError] = useState('')

  if (sesion) return <Navigate to="/cuenta" replace />

  async function conGoogle() {
    setError('')
    const { error } = await auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: urlRegreso(), queryParams: { prompt: 'select_account' } },
    })
    if (error) {
      setEstado('error')
      setError('No pudimos abrir Google. Intenta con tu correo.')
    }
  }

  async function conCorreo(e: FormEvent) {
    e.preventDefault()
    setEstado('enviando')
    const { error } = await auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: urlRegreso() } })
    if (error) {
      setEstado('error')
      setError(
        error.status === 429
          ? 'Ya te enviamos varios enlaces. Espera unos minutos e intenta otra vez.'
          : 'No pudimos enviar el enlace. Revisa el correo e intenta de nuevo.',
      )
      return
    }
    setEstado('enviado')
  }

  return (
    <section className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-black">Entra a MiCuadra</h1>
        <p className="mt-2 text-muted">
          Si es tu primera vez, se crea tu cuenta. Regístrate como vecino o registra tu negocio gratis.
        </p>
      </div>

      {!authDisponible && (
        <p className="rounded-r border border-red p-3 text-sm">Las cuentas no están configuradas en este ambiente.</p>
      )}

      <button
        type="button"
        onClick={conGoogle}
        disabled={!authDisponible}
        className="tap flex items-center justify-center gap-3 rounded-r border border-line bg-surface px-4 font-bold disabled:opacity-50"
      >
        <LogoGoogle />
        Continuar con Google
      </button>

      <div className="flex items-center gap-3 text-sm text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />o con tu correo<span className="h-px flex-1 bg-line" />
      </div>

      {estado === 'enviado' ? (
        <div role="status" className="entra rounded-r bg-block p-4">
          <p className="font-bold">📬 Revisa tu correo</p>
          <p className="mt-1 text-sm">
            Te enviamos un enlace a <strong>{email}</strong>. Ábrelo desde este mismo celular para entrar. Si no
            llega, mira en "Spam" o "Promociones".
          </p>
        </div>
      ) : (
        <form onSubmit={conCorreo} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold">Correo electrónico</span>
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@gmail.com"
              className="tap rounded-r border border-line bg-surface px-4 text-base"
            />
          </label>
          <button
            type="submit"
            disabled={estado === 'enviando' || !authDisponible}
            className="tap rounded-r bg-green px-4 font-bold text-green-ink disabled:opacity-60"
          >
            {estado === 'enviando' ? 'Enviando…' : 'Enviarme un enlace para entrar'}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm font-bold text-red">
          {error}
        </p>
      )}

      <p className="text-xs text-muted">
        Al entrar aceptas que tratemos tus datos según nuestra{' '}
        <Link to="/privacidad" className="underline">
          política de privacidad
        </Link>{' '}
        (Ley 1581 de 2012).
      </p>
    </section>
  )
}

function LogoGoogle() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
