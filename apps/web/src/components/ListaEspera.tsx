import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { apiEnviar, apiGet, type Barrio, type ListaEsperaEntrada, type ListaEsperaRespuesta, type Metas } from '../lib/api'
import { Campo } from '../pages/Bienvenida'

type Rol = ListaEsperaEntrada['rol']

/** Lo que el vecino escribió en el modal de "Pedir mandado" viaja aquí sin pasar por la URL. */
export const CLAVE_QUE_PEDIRIA = 'micuadra.que-pediria'

const ROLES: { rol: Rol; emoji: string; titulo: string }[] = [
  { rol: 'vecino', emoji: '🏡', titulo: 'Soy vecino' },
  { rol: 'negocio', emoji: '🏪', titulo: 'Tengo un negocio' },
  { rol: 'mensajero', emoji: '🛵', titulo: 'Quiero ser mensajero' },
]

function leerQuePediria(): string {
  try {
    return sessionStorage.getItem(CLAVE_QUE_PEDIRIA) ?? ''
  } catch {
    return ''
  }
}

export function ListaEspera() {
  const [rol, setRol] = useState<Rol | null>(() => (leerQuePediria() ? 'vecino' : null))
  const [nombre, setNombre] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [barrio, setBarrio] = useState('')
  const [otroBarrio, setOtroBarrio] = useState('')
  const [negocioNombre, setNegocioNombre] = useState('')
  const [negocioTipo, setNegocioTipo] = useState('')
  const [quePediria, setQuePediria] = useState(leerQuePediria)
  const [acepta, setAcepta] = useState(false)

  const queryClient = useQueryClient()
  const barrios = useQuery({ queryKey: ['barrios'], queryFn: () => apiGet<Barrio[]>('/barrios'), staleTime: Infinity })
  const inscribir = useMutation({
    mutationFn: (datos: ListaEsperaEntrada) => apiEnviar<ListaEsperaRespuesta>('POST', '/lista-espera', datos),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['metas'] })
      try {
        sessionStorage.removeItem(CLAVE_QUE_PEDIRIA)
      } catch {
        // sin almacenamiento: no pasa nada
      }
    },
  })

  const celular = whatsapp.replace(/\D/g, '')
  const celularValido = /^3\d{9}$/.test(celular)
  const barrioFinal = barrio === 'otro' ? otroBarrio.trim() : barrio
  const negocioCompleto = rol !== 'negocio' || (negocioNombre.trim() && negocioTipo.trim())
  const listo = rol && nombre.trim().length >= 2 && celularValido && barrioFinal.length >= 2 && negocioCompleto && acepta

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (!listo) return
    inscribir.mutate({
      rol,
      nombre: nombre.trim(),
      whatsapp: celular,
      barrio: barrioFinal,
      negocio_nombre: rol === 'negocio' ? negocioNombre.trim() : null,
      negocio_tipo: rol === 'negocio' ? negocioTipo.trim() : null,
      que_pediria: rol === 'vecino' && quePediria.trim() ? quePediria.trim() : null,
      acepta_datos: true,
    })
  }

  if (inscribir.isSuccess) {
    const yaEstaba = inscribir.data?.nuevo === false
    return (
      <div role="status" className="entra rounded-r border border-line bg-surface p-6 text-center">
        <p className="text-4xl" aria-hidden="true">
          <span className="celebra">🎉</span>
        </p>
        <p className="mt-2 text-xl font-black">{yaEstaba ? 'Ya estabas en la lista' : '¡Quedaste en la lista!'}</p>
        <p className="mt-1 text-muted">
          {yaEstaba ? 'Actualizamos tus datos.' : 'Te escribimos por WhatsApp cuando arranquemos en tu barrio.'}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5 rounded-r border border-line bg-surface p-6" aria-labelledby="titulo-lista">
      <div>
        <h2 id="titulo-lista" className="text-2xl font-black">
          Inscríbete en la lista de espera
        </h2>
        <p className="mt-1 text-sm text-muted">Te avisamos cuando lleguen los mandados a tu cuadra.</p>
      </div>

      <fieldset>
        <legend className="font-bold">¿Cómo quieres participar?</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {ROLES.map((r) => (
            <button
              key={r.rol}
              type="button"
              aria-pressed={rol === r.rol}
              onClick={() => setRol(r.rol)}
              className={`tap flex items-center gap-2 rounded-r border-2 px-3 text-left font-bold ${
                rol === r.rol ? 'border-green bg-green/10' : 'border-line'
              }`}
            >
              <span aria-hidden="true">{r.emoji}</span>
              {r.titulo}
            </button>
          ))}
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
          className="tap w-full rounded-r border border-line bg-bg px-4 text-base"
        />
      </Campo>

      <Campo etiqueta="Tu WhatsApp" ayuda="10 dígitos, empieza por 3.">
        <input
          required
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="300 123 4567"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          aria-invalid={whatsapp !== '' && !celularValido}
          className="tap w-full rounded-r border border-line bg-bg px-4 text-base"
        />
        {whatsapp !== '' && !celularValido && (
          <span className="text-sm text-red">Revisa el número: debe tener 10 dígitos y empezar por 3.</span>
        )}
      </Campo>

      <Campo etiqueta="Tu barrio">
        <select
          required
          value={barrio}
          onChange={(e) => setBarrio(e.target.value)}
          className="tap w-full rounded-r border border-line bg-bg px-3 text-base"
        >
          <option value="" disabled>
            Elige tu barrio
          </option>
          {barrios.data?.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.nombre}
            </option>
          ))}
          <option value="otro">Otro barrio</option>
        </select>
      </Campo>
      {barrio === 'otro' && (
        <Campo etiqueta="¿Cuál barrio?">
          <input
            required
            maxLength={60}
            value={otroBarrio}
            onChange={(e) => setOtroBarrio(e.target.value)}
            className="tap w-full rounded-r border border-line bg-bg px-4 text-base"
          />
        </Campo>
      )}

      {rol === 'negocio' && (
        <>
          <Campo etiqueta="Nombre del negocio">
            <input
              required
              maxLength={80}
              value={negocioNombre}
              onChange={(e) => setNegocioNombre(e.target.value)}
              className="tap w-full rounded-r border border-line bg-bg px-4 text-base"
            />
          </Campo>
          <Campo etiqueta="¿Qué tipo de negocio es?" ayuda="Tienda, panadería, barbería…">
            <input
              required
              maxLength={60}
              value={negocioTipo}
              onChange={(e) => setNegocioTipo(e.target.value)}
              className="tap w-full rounded-r border border-line bg-bg px-4 text-base"
            />
          </Campo>
        </>
      )}

      {rol === 'vecino' && (
        <Campo etiqueta="¿Qué mandado pedirías? (opcional)">
          <input
            maxLength={200}
            placeholder="El pan de la mañana, una droga…"
            value={quePediria}
            onChange={(e) => setQuePediria(e.target.value)}
            className="tap w-full rounded-r border border-line bg-bg px-4 text-base"
          />
        </Campo>
      )}

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

      {inscribir.isError && (
        <p role="alert" className="text-sm font-bold text-red">
          {inscribir.error.message}
        </p>
      )}

      <button
        type="submit"
        disabled={!listo || inscribir.isPending}
        className="tap rounded-r bg-green px-4 font-bold text-green-ink disabled:opacity-50"
      >
        {inscribir.isPending ? 'Guardando…' : 'Inscribirme'}
      </button>
    </form>
  )
}

/** Barra de metas visibles (SPEC §6.1). */
export function BarraMetas() {
  const metas = useQuery({ queryKey: ['metas'], queryFn: () => apiGet<Metas>('/lista-espera/metas'), staleTime: 60_000 })
  if (!metas.data) return null
  const filas = [
    { etiqueta: 'Negocios en el mapa', ...metas.data.negocios_activos },
    { etiqueta: 'Vecinos esta semana', ...metas.data.vecinos_semana },
    { etiqueta: 'Mensajeros listos', ...metas.data.mensajeros_listos },
  ]
  return (
    <section aria-labelledby="titulo-metas" className="rounded-r border border-line bg-surface p-6">
      <h2 id="titulo-metas" className="text-lg font-black">
        Lo que falta para arrancar los mandados
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {filas.map((f) => (
          <li key={f.etiqueta}>
            <div className="flex justify-between text-sm">
              <span className="font-bold">{f.etiqueta}</span>
              <span className="font-mono">
                {f.valor} / {f.meta}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={f.etiqueta}
              aria-valuemin={0}
              aria-valuemax={f.meta}
              aria-valuenow={Math.min(f.valor, f.meta)}
              className="mt-1 h-2 overflow-hidden rounded-full bg-block"
            >
              <div className="h-full rounded-full bg-green" style={{ width: `${Math.min(100, (100 * f.valor) / f.meta)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
