import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { apiEnviar, apiGet, type Barrio, type Perfil, type PerfilEntrada } from '../lib/api'
import { usePerfil } from '../lib/sesion'
import { Cargando } from './Cuenta'

type Tipo = PerfilEntrada['tipo']

/** Formulario después de registrarse: ¿vecino (consumidor) o empresario? */
export function Bienvenida() {
  const { sesion, token, cargandoSesion, perfil } = usePerfil()
  if (cargandoSesion || (sesion && perfil.isPending)) return <Cargando />
  if (!sesion) return <Navigate to="/entrar" replace />
  if (!perfil.data) return <Cargando />
  return <FormularioBienvenida perfil={perfil.data} token={token} />
}

function FormularioBienvenida({ perfil, token }: { perfil: Perfil; token?: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const yaEsDueno = perfil.roles.includes('dueno')
  const [tipo, setTipo] = useState<Tipo | null>(perfil.perfil_completo ? (yaEsDueno ? 'dueno' : 'vecino') : null)
  const [nombre, setNombre] = useState(perfil.nombre ?? '')
  const [celular, setCelular] = useState(perfil.celular ?? '')
  const [barrio, setBarrio] = useState(perfil.barrio?.slug ?? '')
  const [acepta, setAcepta] = useState(false)

  const barrios = useQuery({ queryKey: ['barrios'], queryFn: () => apiGet<Barrio[]>('/barrios'), staleTime: Infinity })

  const guardar = useMutation({
    mutationFn: (datos: PerfilEntrada) => apiEnviar<Perfil>('PUT', '/yo/perfil', datos, token),
    onSuccess: (nuevo) => {
      queryClient.setQueryData(['yo', nuevo.id], nuevo)
      navigate(tipo === 'dueno' ? '/mi-negocio/nuevo' : '/cuenta', { replace: true })
    },
  })

  const celularLimpio = celular.replace(/\D/g, '')
  const celularValido = /^3\d{9}$/.test(celularLimpio)

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (!tipo || !celularValido || !acepta) return
    guardar.mutate({ tipo, nombre: nombre.trim(), celular: celularLimpio, barrio: barrio || null, acepta_datos: true })
  }

  return (
    <section className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-3xl font-black">¡Bienvenido a MiCuadra!</h1>
      <p className="mt-2 text-muted">Cuéntanos un poco de ti para mostrarte lo que te sirve.</p>

      <form onSubmit={enviar} className="mt-6 flex flex-col gap-5">
        <fieldset>
          <legend className="font-bold">¿Cómo vas a usar MiCuadra?</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <OpcionTipo
              activo={tipo === 'vecino'}
              onClick={() => setTipo('vecino')}
              emoji="🏡"
              titulo="Soy vecino"
              texto="Quiero encontrar negocios de mi barrio."
            />
            <OpcionTipo
              activo={tipo === 'dueno'}
              onClick={() => setTipo('dueno')}
              emoji="🏪"
              titulo="Tengo un negocio"
              texto="Quiero que mis vecinos me encuentren. Es gratis."
            />
          </div>
        </fieldset>

        <Campo etiqueta="Tu nombre">
          <input
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="tap w-full rounded-caja border border-line bg-surface px-4 text-base"
          />
        </Campo>

        <Campo etiqueta="Tu celular (WhatsApp)" ayuda="10 dígitos, empieza por 3. Solo lo usamos para avisarte cosas de tu cuenta.">
          <input
            required
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="300 123 4567"
            value={celular}
            onChange={(e) => setCelular(e.target.value)}
            aria-invalid={celular !== '' && !celularValido}
            className="tap w-full rounded-caja border border-line bg-surface px-4 text-base"
          />
          {celular !== '' && !celularValido && (
            <span className="text-sm text-red">Revisa el número: debe tener 10 dígitos y empezar por 3.</span>
          )}
        </Campo>

        <Campo etiqueta="¿En qué barrio vives?">
          <select
            value={barrio}
            onChange={(e) => setBarrio(e.target.value)}
            className="tap w-full rounded-caja border border-line bg-surface px-3 text-base"
          >
            <option value="">Otro barrio de Pereira</option>
            {barrios.data?.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            required
            checked={acepta}
            onChange={(e) => setAcepta(e.target.checked)}
            className="mt-1 size-5 shrink-0 accent-[var(--green)]"
          />
          <span>
            Autorizo a MiCuadra a tratar mis datos personales según la{' '}
            <Link to="/privacidad" className="font-bold underline">
              política de privacidad
            </Link>{' '}
            (Ley 1581 de 2012).
          </span>
        </label>

        {guardar.isError && (
          <p role="alert" className="text-sm font-bold text-red">
            {guardar.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={!tipo || !celularValido || !acepta || guardar.isPending}
          className="tap rounded-caja bg-green px-4 font-bold text-green-ink disabled:opacity-50"
        >
          {guardar.isPending ? 'Guardando…' : tipo === 'dueno' ? 'Seguir con mi negocio →' : 'Listo, ir al mapa'}
        </button>
      </form>
    </section>
  )
}

function OpcionTipo(props: { activo: boolean; onClick: () => void; emoji: string; titulo: string; texto: string }) {
  return (
    <button
      type="button"
      aria-pressed={props.activo}
      onClick={props.onClick}
      className={`flex flex-col items-start gap-1 rounded-caja border-2 p-4 text-left ${
        props.activo ? 'border-green bg-green/10' : 'border-line bg-surface'
      }`}
    >
      <span className="text-3xl" aria-hidden="true">
        {props.emoji}
      </span>
      <span className="font-bold">{props.titulo}</span>
      <span className="text-sm text-muted">{props.texto}</span>
    </button>
  )
}

export function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-bold">{etiqueta}</span>
      {ayuda && <span className="text-sm text-muted">{ayuda}</span>}
      {children}
    </label>
  )
}
