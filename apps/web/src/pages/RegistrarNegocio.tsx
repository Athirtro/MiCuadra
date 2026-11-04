import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import {
  apiEnviar,
  apiGet,
  type Barrio,
  type Categoria,
  type Horario,
  type MiNegocio,
  type NegocioEntrada,
  type Perfil,
  type Punto,
} from '../lib/api'
import { DIAS, emojiCategoria } from '../lib/negocio'
import { usePerfil } from '../lib/sesion'
import { Campo } from './Bienvenida'
import { Cargando } from './Cuenta'

const SelectorUbicacion = lazy(() =>
  import('../components/MapaBarrio').then((m) => ({ default: m.SelectorUbicacion })),
)

const CLAVE_BORRADOR = 'micuadra.borrador-negocio'
const PASOS = ['Tu negocio', 'Ubicación', 'Horario', 'Revisar'] as const
const CENTRO_PEREIRA: Punto = { lat: 4.8133, lng: -75.6961 }
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0]

interface Borrador {
  nombre: string
  categoria: string
  whatsapp: string
  telefono: string
  descripcion: string
  direccion_texto: string
  ubicacion: Punto | null
  horarios: Horario[]
}

const VACIO: Borrador = {
  nombre: '',
  categoria: '',
  whatsapp: '',
  telefono: '',
  descripcion: '',
  direccion_texto: '',
  ubicacion: null,
  horarios: [],
}

function leerBorrador(): Borrador {
  try {
    const guardado = localStorage.getItem(CLAVE_BORRADOR)
    return guardado ? { ...VACIO, ...(JSON.parse(guardado) as Partial<Borrador>) } : VACIO
  } catch {
    return VACIO
  }
}

/** Registro del negocio en pasos (SPEC §6.4). Queda "en revisión" hasta que un admin lo apruebe. */
export function RegistrarNegocio() {
  const { sesion, token, cargandoSesion, perfil } = usePerfil()
  if (cargandoSesion || (sesion && perfil.isPending)) return <Cargando />
  if (!sesion) return <Navigate to="/entrar" replace />
  if (!perfil.data) return <Cargando />
  if (!perfil.data.perfil_completo) return <Navigate to="/bienvenida" replace />
  if (!perfil.data.roles.some((r) => r === 'dueno' || r === 'admin')) {
    return <HacermeEmpresario perfil={perfil.data} token={token} />
  }
  return <Asistente perfil={perfil.data} token={token} />
}

/** Un vecino que también tiene negocio: se le agrega el rol de empresario con sus mismos datos. */
function HacermeEmpresario({ perfil, token }: { perfil: Perfil; token?: string }) {
  const queryClient = useQueryClient()
  const cambiar = useMutation({
    mutationFn: () =>
      apiEnviar<Perfil>(
        'PUT',
        '/yo/perfil',
        { tipo: 'dueno', nombre: perfil.nombre, celular: perfil.celular, barrio: perfil.barrio?.slug ?? null, acepta_datos: true },
        token,
      ),
    onSuccess: (nuevo) => queryClient.setQueryData(['yo', nuevo.id], nuevo),
  })
  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-black">¿Tienes un negocio?</h1>
      <p className="mt-2 text-muted">
        Registrarlo es gratis y sigues pudiendo usar MiCuadra como vecino con la misma cuenta.
      </p>
      {cambiar.isError && <p className="mt-3 text-sm font-bold text-red">{cambiar.error.message}</p>}
      <button
        type="button"
        onClick={() => cambiar.mutate()}
        disabled={cambiar.isPending}
        className="tap mt-6 w-full rounded-r bg-green px-4 font-bold text-green-ink"
      >
        Sí, quiero registrar mi negocio
      </button>
    </section>
  )
}

function Asistente({ perfil, token }: { perfil: Perfil; token?: string }) {
  const queryClient = useQueryClient()
  const [paso, setPaso] = useState(0)
  const [b, setB] = useState<Borrador>(() => {
    const borrador = leerBorrador()
    return { ...borrador, whatsapp: borrador.whatsapp || perfil.celular || '' }
  })

  // Guarda el borrador entre pasos (y si se cierra la app a mitad).
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(b))
    } catch {
      // sin almacenamiento: el borrador vive solo mientras la pantalla está abierta
    }
  }, [b])

  const cambiar = useCallback(<K extends keyof Borrador>(campo: K, valor: Borrador[K]) => {
    setB((actual) => ({ ...actual, [campo]: valor }))
  }, [])

  const categorias = useQuery({ queryKey: ['categorias'], queryFn: () => apiGet<Categoria[]>('/categorias'), staleTime: Infinity })
  const barrios = useQuery({ queryKey: ['barrios'], queryFn: () => apiGet<Barrio[]>('/barrios'), staleTime: Infinity })

  const enviar = useMutation({
    mutationFn: () => {
      const cuerpo: NegocioEntrada = {
        nombre: b.nombre.trim(),
        categoria: b.categoria,
        whatsapp: b.whatsapp.replace(/\D/g, ''),
        telefono: b.telefono.trim() || null,
        descripcion: b.descripcion.trim() || null,
        direccion_texto: b.direccion_texto.trim(),
        ubicacion: b.ubicacion as Punto,
        horarios: b.horarios,
      }
      return apiEnviar<MiNegocio>('POST', '/mis-negocios', cuerpo, token)
    },
    onSuccess: () => {
      try {
        localStorage.removeItem(CLAVE_BORRADOR)
      } catch {
        // nada que borrar
      }
      void queryClient.invalidateQueries({ queryKey: ['mis-negocios'] })
    },
  })

  if (enviar.isSuccess) {
    return (
      <section className="entra mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-5xl" aria-hidden="true">
          <span className="celebra">🎉</span>
        </p>
        <h1 className="mt-3 text-3xl font-black">¡Recibimos tu negocio!</h1>
        <p className="mt-2 text-muted">
          <strong>{enviar.data.nombre}</strong> queda en revisión. El equipo de MiCuadra lo revisa y te avisamos por
          WhatsApp cuando aparezca en el mapa.
        </p>
        <p className="mt-4">Mientras tanto, sube fotos de tu negocio: así los vecinos lo reconocen.</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            to={`/mi-negocio/${enviar.data.id}/fotos`}
            className="tap inline-flex items-center justify-center rounded-r bg-green px-5 font-bold text-green-ink"
          >
            📷 Subir fotos
          </Link>
          <Link to="/cuenta" className="tap inline-flex items-center justify-center rounded-r border border-line px-5 font-bold">
            Más tarde
          </Link>
        </div>
      </section>
    )
  }

  const whatsappValido = /^3\d{9}$/.test(b.whatsapp.replace(/\D/g, ''))
  const listo = [
    b.nombre.trim().length >= 2 && b.categoria !== '' && whatsappValido && b.descripcion.length <= 280,
    b.ubicacion !== null && b.direccion_texto.trim().length >= 3,
    true, // el horario es opcional
    true,
  ]

  return (
    <section className="mx-auto max-w-xl px-4 py-6">
      <h1 className="text-2xl font-black">Registra tu negocio</h1>
      <Progreso paso={paso} />

      <form
        className="mt-6 flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!listo[paso]) return
          if (paso < PASOS.length - 1) setPaso(paso + 1)
          else enviar.mutate()
        }}
      >
        {paso === 0 && <PasoDatos b={b} cambiar={cambiar} categorias={categorias.data} whatsappValido={whatsappValido} />}
        {paso === 1 && <PasoUbicacion b={b} cambiar={cambiar} perfil={perfil} barrios={barrios.data} />}
        {paso === 2 && <PasoHorario horarios={b.horarios} alCambiar={(h) => cambiar('horarios', h)} />}
        {paso === 3 && <PasoRevisar b={b} categorias={categorias.data} irA={setPaso} />}

        {enviar.isError && (
          <p role="alert" className="text-sm font-bold text-red">
            {enviar.error.message}
          </p>
        )}

        <div className="flex gap-2">
          {paso > 0 && (
            <button type="button" onClick={() => setPaso(paso - 1)} className="tap rounded-r border border-line px-5 font-bold">
              Atrás
            </button>
          )}
          <button
            type="submit"
            disabled={!listo[paso] || enviar.isPending}
            className="tap flex-1 rounded-r bg-green px-5 font-bold text-green-ink disabled:opacity-50"
          >
            {paso < PASOS.length - 1 ? 'Siguiente' : enviar.isPending ? 'Enviando…' : 'Enviar a revisión'}
          </button>
        </div>
      </form>
    </section>
  )
}

function Progreso({ paso }: { paso: number }) {
  return (
    <ol className="mt-4 grid grid-cols-4 gap-1" aria-label="Pasos del registro">
      {PASOS.map((nombre, i) => (
        <li key={nombre} aria-current={i === paso ? 'step' : undefined} className="flex flex-col gap-1">
          <span className={`h-1.5 rounded-full ${i <= paso ? 'bg-green' : 'bg-line'}`} />
          <span className={`text-xs ${i === paso ? 'font-bold' : 'text-muted'}`}>
            {i + 1}. {nombre}
          </span>
        </li>
      ))}
    </ol>
  )
}

type Cambiar = <K extends keyof Borrador>(campo: K, valor: Borrador[K]) => void
const INPUT = 'tap w-full rounded-r border border-line bg-surface px-4 text-base'

function PasoDatos({
  b,
  cambiar,
  categorias,
  whatsappValido,
}: {
  b: Borrador
  cambiar: Cambiar
  categorias?: Categoria[]
  whatsappValido: boolean
}) {
  return (
    <>
      <Campo etiqueta="Nombre del negocio">
        <input required maxLength={80} value={b.nombre} onChange={(e) => cambiar('nombre', e.target.value)} className={INPUT} placeholder="Panadería El Trigal" />
      </Campo>
      <fieldset>
        <legend className="font-bold">¿Qué tipo de negocio es?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categorias?.map((c) => (
            <button
              key={c.slug}
              type="button"
              aria-pressed={b.categoria === c.slug}
              onClick={() => cambiar('categoria', c.slug)}
              className={`tap flex items-center gap-2 rounded-r border-2 px-3 text-left text-sm font-bold ${
                b.categoria === c.slug ? 'border-green bg-green/10' : 'border-line bg-surface'
              }`}
            >
              <span aria-hidden="true">{emojiCategoria(c.slug)}</span>
              {c.nombre}
            </button>
          ))}
        </div>
      </fieldset>
      <Campo etiqueta="WhatsApp del negocio" ayuda="Aquí te escribirán tus clientes.">
        <input
          required
          type="tel"
          inputMode="numeric"
          value={b.whatsapp}
          onChange={(e) => cambiar('whatsapp', e.target.value)}
          aria-invalid={b.whatsapp !== '' && !whatsappValido}
          className={INPUT}
          placeholder="300 123 4567"
        />
        {b.whatsapp !== '' && !whatsappValido && <span className="text-sm text-red">Debe tener 10 dígitos y empezar por 3.</span>}
      </Campo>
      <Campo etiqueta="Teléfono fijo (opcional)">
        <input type="tel" maxLength={20} value={b.telefono} onChange={(e) => cambiar('telefono', e.target.value)} className={INPUT} />
      </Campo>
      <Campo etiqueta="Cuéntale a tus vecinos qué vendes" ayuda={`${b.descripcion.length}/280`}>
        <textarea
          maxLength={280}
          rows={3}
          value={b.descripcion}
          onChange={(e) => cambiar('descripcion', e.target.value)}
          className="w-full rounded-r border border-line bg-surface px-4 py-3 text-base"
          placeholder="Pan caliente desde las 5 a. m., pandebono y tinto."
        />
      </Campo>
    </>
  )
}

function PasoUbicacion({
  b,
  cambiar,
  perfil,
  barrios,
}: {
  b: Borrador
  cambiar: Cambiar
  perfil: Perfil
  barrios?: Barrio[]
}) {
  const inicial = barrios?.find((x) => x.slug === perfil.barrio?.slug)?.centroide ?? CENTRO_PEREIRA
  const punto = b.ubicacion ?? inicial
  const alCambiar = useCallback((p: Punto) => cambiar('ubicacion', p), [cambiar])
  const [buscando, setBuscando] = useState(false)

  function usarGps() {
    if (!('geolocation' in navigator)) return
    setBuscando(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        alCambiar({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setBuscando(false)
      },
      () => setBuscando(false),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <>
      <div>
        <p className="font-bold">¿Dónde queda tu negocio?</p>
        <p className="text-sm text-muted">Arrastra el pin o toca el mapa justo donde está la puerta.</p>
      </div>
      <button type="button" onClick={usarGps} className="tap rounded-r border border-line px-4 font-bold">
        {buscando ? 'Buscando…' : '📍 Estoy en mi negocio, usar mi ubicación'}
      </button>
      <Suspense fallback={<div className="h-72 rounded-r bg-block" />}>
        <SelectorUbicacion punto={punto} alCambiar={alCambiar} />
      </Suspense>
      {!b.ubicacion && <p className="text-sm text-red">Mueve el pin para confirmar la ubicación.</p>}
      <Campo etiqueta="Dirección" ayuda='Como la diría un vecino: "Calle 72 # 25-10, frente al parque".'>
        <input
          required
          maxLength={120}
          value={b.direccion_texto}
          onChange={(e) => cambiar('direccion_texto', e.target.value)}
          className={INPUT}
          autoComplete="street-address"
        />
      </Campo>
    </>
  )
}

const PLANTILLAS: { nombre: string; dias: number[]; franjas: [string, string][] }[] = [
  { nombre: 'Todos los días 7 a. m.–9 p. m.', dias: [0, 1, 2, 3, 4, 5, 6], franjas: [['07:00', '21:00']] },
  { nombre: 'Lunes a sábado 8 a. m.–6 p. m.', dias: [1, 2, 3, 4, 5, 6], franjas: [['08:00', '18:00']] },
  { nombre: 'Lunes a sábado, cierra al almuerzo', dias: [1, 2, 3, 4, 5, 6], franjas: [['08:00', '12:00'], ['14:00', '19:00']] },
]

function PasoHorario({ horarios, alCambiar }: { horarios: Horario[]; alCambiar: (h: Horario[]) => void }) {
  const delDia = (dia: number) => horarios.filter((h) => h.dia_semana === dia)
  const ponerDia = (dia: number, franjas: Horario[]) =>
    alCambiar([...horarios.filter((h) => h.dia_semana !== dia), ...franjas].sort((a, c) => a.dia_semana - c.dia_semana))

  return (
    <>
      <div>
        <p className="font-bold">¿Qué días y a qué horas abres?</p>
        <p className="text-sm text-muted">Así tus vecinos saben si estás "Abierto ahora". Puedes cambiarlo después.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {PLANTILLAS.map((p) => (
          <button
            key={p.nombre}
            type="button"
            onClick={() =>
              alCambiar(p.dias.flatMap((d) => p.franjas.map(([abre, cierra]) => ({ dia_semana: d, abre, cierra }))))
            }
            className="tap rounded-full border border-line px-3 text-sm font-bold"
          >
            {p.nombre}
          </button>
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-r border border-line bg-surface">
        {ORDEN_DIAS.map((dia) => {
          const franjas = delDia(dia)
          const abierto = franjas.length > 0
          return (
            <li key={dia} className="flex flex-col gap-2 p-3">
              <label className="flex items-center justify-between gap-3 font-bold">
                {DIAS[dia]}
                <span className="flex items-center gap-2 text-sm font-normal text-muted">
                  {abierto ? 'Abierto' : 'Cerrado'}
                  <input
                    type="checkbox"
                    checked={abierto}
                    onChange={(e) => ponerDia(dia, e.target.checked ? [{ dia_semana: dia, abre: '08:00', cierra: '18:00' }] : [])}
                    className="size-5 accent-[var(--green)]"
                  />
                </span>
              </label>
              {franjas.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <input
                    type="time"
                    aria-label={`${DIAS[dia]}: abre`}
                    value={f.abre}
                    onChange={(e) => ponerDia(dia, franjas.map((x, j) => (j === i ? { ...x, abre: e.target.value } : x)))}
                    className="tap rounded-r border border-line bg-bg px-2"
                  />
                  a
                  <input
                    type="time"
                    aria-label={`${DIAS[dia]}: cierra`}
                    value={f.cierra}
                    onChange={(e) => ponerDia(dia, franjas.map((x, j) => (j === i ? { ...x, cierra: e.target.value } : x)))}
                    className="tap rounded-r border border-line bg-bg px-2"
                  />
                  {i === 1 && (
                    <button type="button" onClick={() => ponerDia(dia, franjas.slice(0, 1))} className="tap text-sm text-muted underline">
                      Quitar
                    </button>
                  )}
                </div>
              ))}
              {franjas.length === 1 && (
                <button
                  type="button"
                  onClick={() => ponerDia(dia, [...franjas, { dia_semana: dia, abre: '14:00', cierra: '19:00' }])}
                  className="self-start text-sm font-bold text-green underline"
                >
                  + Cierro al mediodía (segunda franja)
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function PasoRevisar({ b, categorias, irA }: { b: Borrador; categorias?: Categoria[]; irA: (paso: number) => void }) {
  const categoria = categorias?.find((c) => c.slug === b.categoria)
  const dias = ORDEN_DIAS.filter((d) => b.horarios.some((h) => h.dia_semana === d)).map((d) => DIAS[d])
  return (
    <div className="flex flex-col gap-3">
      <p className="font-bold">Revisa que todo esté bien</p>
      <Resumen titulo="Tu negocio" alEditar={() => irA(0)}>
        <p className="font-bold">
          {emojiCategoria(b.categoria)} {b.nombre}
        </p>
        <p className="text-sm text-muted">
          {categoria?.nombre} · WhatsApp {b.whatsapp}
        </p>
        {b.descripcion && <p className="mt-1 text-sm">{b.descripcion}</p>}
      </Resumen>
      <Resumen titulo="Ubicación" alEditar={() => irA(1)}>
        <p className="text-sm">{b.direccion_texto}</p>
      </Resumen>
      <Resumen titulo="Horario" alEditar={() => irA(2)}>
        <p className="text-sm">{dias.length ? `Abre: ${dias.join(', ')}` : 'Sin horario (lo puedes agregar después)'}</p>
      </Resumen>
      <p className="text-sm text-muted">
        Aparecer en MiCuadra es gratis. Revisamos cada negocio antes de publicarlo para que el mapa tenga solo
        negocios reales.
      </p>
    </div>
  )
}

function Resumen({ titulo, alEditar, children }: { titulo: string; alEditar: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-r border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold tracking-wide text-muted uppercase">{titulo}</p>
        <button type="button" onClick={alEditar} className="text-sm font-bold text-green underline">
          Editar
        </button>
      </div>
      <div className="mt-1">{children}</div>
    </div>
  )
}
