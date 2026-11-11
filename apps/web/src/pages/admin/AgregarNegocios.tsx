import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router'
import { apiEnviar, apiGet, type Barrio, type Categoria, type LoteEntrada, type LoteResultado, type Punto } from '../../lib/api'
import { filasDesdeCsv, PLANTILLA, type FilaCsv } from '../../lib/csv'
import { emojiCategoria } from '../../lib/negocio'
import { Dialogo } from '../../components/Dialogo'
import { Filtro, useToken } from './Admin'

const SelectorUbicacion = lazy(() => import('../../components/MapaBarrio').then((m) => ({ default: m.SelectorUbicacion })))

const CENTRO_PEREIRA: Punto = { lat: 4.8133, lng: -75.6961 }
const ENTRADA = 'tap w-full rounded-caja border border-line bg-bg px-3 text-base'

type Modo = 'uno' | 'csv'
type EstadoInicial = LoteEntrada['estado']

/** Ambas formas usan el mismo lote del API: así el horario y la ubicación se leen igual. */
function useLote() {
  const token = useToken()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (lote: { filas: FilaCsv[]; estado: EstadoInicial; simular: boolean }) =>
      apiEnviar<LoteResultado>('POST', '/admin/negocios/lote', lote, token),
    onSuccess: (r) => {
      if (r.creados) void queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })
}

/** Carga de negocios que el equipo visitó (SPEC §6.5): uno por uno o por CSV. */
export function AgregarNegocios() {
  const [modo, setModo] = useState<Modo>('uno')
  return (
    <div className="flex flex-col gap-4">
      <Link to="/admin/negocios" className="text-sm font-bold text-green underline">
        ← Negocios
      </Link>
      <h2 className="text-xl font-black">Agregar negocios</h2>
      <p className="text-sm text-muted">
        Para negocios que el equipo visitó. Quedan sin dueño hasta que lo reclamen. Publica el WhatsApp solo si el dueño
        lo autorizó.
      </p>
      <Filtro
        etiqueta="Cómo agregarlos"
        valor={modo}
        opciones={[
          { valor: 'uno', texto: 'Uno por uno' },
          { valor: 'csv', texto: 'Desde un archivo CSV' },
        ]}
        onChange={setModo}
      />
      {modo === 'uno' ? <UnoPorUno /> : <DesdeCsv />}
    </div>
  )
}

function SelectorEstado({ valor, onChange }: { valor: EstadoInicial; onChange: (v: EstadoInicial) => void }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="font-bold">¿Cómo quedan?</legend>
      <Filtro
        etiqueta="Estado inicial"
        valor={valor}
        opciones={[
          { valor: 'activo', texto: 'Publicados en el mapa' },
          { valor: 'pendiente', texto: 'Por aprobar' },
        ]}
        onChange={onChange}
      />
    </fieldset>
  )
}

const faltaUbicacion = (mensajes: string[]) => mensajes.some((m) => /ubicaci[oó]n/i.test(m))

function Errores({ r, alUbicar }: { r: LoteResultado; alUbicar?: (fila: number) => void }) {
  if (!r.errores.length) return null
  return (
    <div role="alert" className="tarjeta border-red/40 p-4">
      <p className="font-bold text-red">
        {r.errores.length === 1 ? 'Hay 1 fila por corregir' : `Hay ${r.errores.length} filas por corregir`}
      </p>
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {r.errores.map((e) => (
          <li key={e.fila}>
            <span className="font-bold">
              Fila {e.fila} · {e.nombre}
            </span>
            <ul className="ml-4 list-disc text-muted">
              {e.mensajes.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            {alUbicar && faltaUbicacion(e.mensajes) && (
              <button
                type="button"
                onClick={() => alUbicar(e.fila)}
                className="tap mt-1 inline-flex items-center gap-1 rounded-full bg-green px-4 text-sm font-bold text-green-ink"
              >
                📍 Ubicar en el mapa
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function UnoPorUno() {
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: () => apiGet<Categoria[]>('/categorias'), staleTime: Infinity })
  const barrios = useQuery({ queryKey: ['barrios'], queryFn: () => apiGet<Barrio[]>('/barrios'), staleTime: Infinity })
  const lote = useLote()
  const vacio = { nombre: '', categoria: '', barrio: '', direccion: '', whatsapp: '', telefono: '', descripcion: '', horario: '' }
  const [f, setF] = useState(vacio)
  const [punto, setPunto] = useState<Punto | null>(null)
  const [autorizo, setAutorizo] = useState(false)
  const [estado, setEstado] = useState<EstadoInicial>('activo')
  const [buscando, setBuscando] = useState(false)
  const cambiar = (campo: keyof typeof vacio) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [campo]: e.target.value }))

  function aqui() {
    if (!('geolocation' in navigator)) return
    setBuscando(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPunto({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setBuscando(false)
      },
      () => setBuscando(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const listo = f.nombre.trim().length >= 2 && f.categoria && f.direccion.trim().length >= 3 && punto && (!f.whatsapp || autorizo)

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (!listo || !punto) return
    lote.mutate(
      { filas: [{ ...f, ubicacion: `${punto.lat}, ${punto.lng}` }], estado, simular: false },
      {
        onSuccess: (r) => {
          if (r.creados) {
            setF(vacio)
            setPunto(null)
            setAutorizo(false)
          }
        },
      },
    )
  }

  return (
    <form onSubmit={enviar} className="flex max-w-xl flex-col gap-4">
      {lote.data?.creados ? (
        <p role="status" className="entra rounded-caja bg-green/15 p-3 font-bold text-green">
          ✓ Agregado «{lote.data.validas[0]?.nombre}». Puedes seguir con el siguiente.
        </p>
      ) : null}
      {lote.data && <Errores r={lote.data} />}

      <label className="flex flex-col gap-1 font-bold">
        Nombre del negocio
        <input required minLength={2} maxLength={80} value={f.nombre} onChange={cambiar('nombre')} className={ENTRADA} />
      </label>
      <label className="flex flex-col gap-1 font-bold">
        Categoría
        <select required value={f.categoria} onChange={cambiar('categoria')} className={ENTRADA}>
          <option value="" disabled>
            Elige la categoría
          </option>
          {categorias.data?.map((c) => (
            <option key={c.slug} value={c.slug}>
              {emojiCategoria(c.slug)} {c.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-bold">
        Dirección
        <input required minLength={3} maxLength={120} value={f.direccion} onChange={cambiar('direccion')} placeholder="Cra 27 # 71-08" className={ENTRADA} />
      </label>
      <label className="flex flex-col gap-1 font-bold">
        Barrio
        <input list="barrios-admin" maxLength={60} value={f.barrio} onChange={cambiar('barrio')} className={ENTRADA} autoComplete="off" />
        <datalist id="barrios-admin">
          {barrios.data?.map((b) => (
            <option key={b.slug} value={b.nombre} />
          ))}
        </datalist>
      </label>

      <div className="flex flex-col gap-2">
        <p className="font-bold">Ubicación</p>
        <button type="button" onClick={aqui} className="tap rounded-caja border border-line px-4 font-bold">
          {buscando ? 'Buscando…' : '📍 Estoy en el negocio, usar mi ubicación'}
        </button>
        <Suspense fallback={<div className="esqueleto h-72 rounded-caja" />}>
          <SelectorUbicacion punto={punto ?? CENTRO_PEREIRA} alCambiar={setPunto} emoji={f.categoria ? emojiCategoria(f.categoria) : '📍'} />
        </Suspense>
        <p className={`text-sm ${punto ? 'text-muted' : 'text-red'}`}>
          {punto ? `${punto.lat.toFixed(5)}, ${punto.lng.toFixed(5)}` : 'Toca el mapa o mueve el pin justo donde está la puerta.'}
        </p>
      </div>

      <label className="flex flex-col gap-1 font-bold">
        WhatsApp (opcional)
        <input inputMode="numeric" value={f.whatsapp} onChange={cambiar('whatsapp')} placeholder="310 456 7890" className={ENTRADA} />
      </label>
      {f.whatsapp && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={autorizo} onChange={(e) => setAutorizo(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--green)]" />
          <span>El dueño autorizó publicar este WhatsApp en MiCuadra (Ley 1581).</span>
        </label>
      )}
      <label className="flex flex-col gap-1 font-bold">
        Teléfono fijo (opcional)
        <input maxLength={20} value={f.telefono} onChange={cambiar('telefono')} className={ENTRADA} />
      </label>
      <label className="flex flex-col gap-1 font-bold">
        Descripción (opcional)
        <textarea maxLength={280} rows={2} value={f.descripcion} onChange={cambiar('descripcion')} className="rounded-caja border border-line bg-bg px-3 py-2 text-base font-normal" />
      </label>
      <label className="flex flex-col gap-1 font-bold">
        Horario (opcional)
        <input value={f.horario} onChange={cambiar('horario')} placeholder="lun-sab 6:00-20:00; dom 7:00-13:00" className={ENTRADA} />
        <span className="text-sm font-normal text-muted">Días: lun mar mie jue vie sab dom, «todos» o rangos como lun-sab. Dos franjas: 7-12 y 14-19.</span>
      </label>
      <SelectorEstado valor={estado} onChange={setEstado} />

      <button type="submit" disabled={!listo || lote.isPending} className="tap rounded-caja bg-green px-4 font-bold text-green-ink disabled:opacity-50">
        {lote.isPending ? 'Guardando…' : 'Agregar negocio'}
      </button>
      {lote.isError && (
        <p role="alert" className="text-sm font-bold text-red">
          {lote.error.message}
        </p>
      )}
    </form>
  )
}

function DesdeCsv() {
  const lote = useLote()
  const [filas, setFilas] = useState<FilaCsv[]>([])
  const [ignoradas, setIgnoradas] = useState<string[]>([])
  const [archivo, setArchivo] = useState('')
  const [estado, setEstado] = useState<EstadoInicial>('activo')
  const [ubicando, setUbicando] = useState<number | null>(null)
  // Filas que ubicó Google: su punto se guarda en la fila para que crear use el mismo que se revisó.
  const [deGoogle, setDeGoogle] = useState<Map<number, string>>(new Map())
  const plantilla = `data:text/csv;charset=utf-8,${encodeURIComponent('\uFEFF' + PLANTILLA)}`

  async function elegir(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const leido = filasDesdeCsv(await f.text())
    setArchivo(f.name)
    setFilas(leido.filas)
    setIgnoradas(leido.ignoradas)
    setDeGoogle(new Map())
    lote.reset()
    if (leido.filas.length) revisar(leido.filas)
  }

  function revisar(nuevas: FilaCsv[]) {
    lote.mutate(
      { filas: nuevas, estado, simular: true },
      {
        onSuccess: (res) => {
          const auto = res.validas.filter((v) => v.ubicacion_automatica)
          if (!auto.length) return
          setDeGoogle((m) => new Map([...m, ...auto.map((v) => [v.fila, v.direccion_google ?? ''] as const)]))
          setFilas((actuales) =>
            actuales.map((f, i) => {
              const v = auto.find((x) => x.fila === i + 2)
              return v ? { ...f, ubicacion: `${v.ubicacion.lat.toFixed(6)}, ${v.ubicacion.lng.toFixed(6)}` } : f
            }),
          )
        },
      },
    )
  }

  // Pone la ubicación elegida en la fila y vuelve a revisar todo el archivo.
  function ubicar(fila: number, punto: Punto) {
    const nuevas = filas.map((f, i) => (i === fila - 2 ? { ...f, ubicacion: `${punto.lat.toFixed(6)}, ${punto.lng.toFixed(6)}` } : f))
    setFilas(nuevas)
    setUbicando(null)
    // Si la ajustaron a mano, ya no es «de Google».
    setDeGoogle((m) => new Map([...m].filter(([f]) => f !== fila)))
    revisar(nuevas)
  }

  const r = lote.data
  const revisado = r && !r.creados
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <ol className="ml-5 list-decimal text-sm">
        <li>
          Descarga la{' '}
          <a href={plantilla} download="plantilla-negocios.csv" className="font-bold text-green underline">
            plantilla
          </a>{' '}
          y llénala en Excel o Google Sheets (una fila por negocio).
        </li>
        <li>
          La columna <strong>ubicacion</strong> puede ir vacía: la buscamos con la dirección y el barrio, y la que no
          encontremos con precisión la ubicas en el mapa. Si ya tienes las coordenadas, pega «latitud, longitud» (en Google
          Maps, mantén presionado el punto y copia los números).
        </li>
        <li>Guárdala como CSV y súbela aquí. Primero la revisamos; no se crea nada hasta que confirmes.</li>
      </ol>

      <label className="tap flex cursor-pointer items-center justify-center rounded-caja border-2 border-dashed border-line bg-surface px-4 font-bold">
        📄 {archivo ? `Cambiar archivo (${archivo})` : 'Elegir archivo CSV'}
        <input type="file" accept=".csv,text/csv" hidden onChange={elegir} aria-label="Elegir archivo CSV" />
      </label>
      {ignoradas.length > 0 && <p className="text-sm text-muted">Columnas que no usamos: {ignoradas.join(', ')}.</p>}
      {archivo && filas.length === 0 && <p className="font-bold text-red">El archivo no tiene filas con datos.</p>}
      {lote.isPending && <p className="text-muted">Revisando {filas.length} filas…</p>}
      {lote.isError && (
        <p role="alert" className="font-bold text-red">
          {lote.error.message}
        </p>
      )}

      {r?.creados ? (
        <p role="status" className="entra rounded-caja bg-green/15 p-4 font-bold text-green">
          ✓ Se agregaron {r.creados} negocios.{' '}
          <Link to="/admin/negocios" className="underline">
            Verlos
          </Link>
        </p>
      ) : null}

      {revisado && (
        <>
          <Errores r={r} alUbicar={setUbicando} />
          {r.validas.length > 0 && (
            <div className="tarjeta overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="p-3 text-left font-bold">
                  {r.validas.length} {r.validas.length === 1 ? 'fila lista' : 'filas listas'}
                </caption>
                <thead className="bg-bg text-xs text-muted uppercase">
                  <tr>
                    <th className="p-2">Fila</th>
                    <th className="p-2">Nombre</th>
                    <th className="p-2">Categoría</th>
                    <th className="p-2">Barrio</th>
                    <th className="p-2">WhatsApp</th>
                    <th className="p-2">Horario</th>
                    <th className="p-2">Ubicación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.validas.map((v) => (
                    <tr key={v.fila}>
                      <td className="p-2 font-mono">{v.fila}</td>
                      <td className="p-2 font-bold">{v.nombre}</td>
                      <td className="p-2">
                        {emojiCategoria(v.categoria)} {v.categoria}
                      </td>
                      <td className="p-2">{v.barrio ?? '—'}</td>
                      <td className="p-2 font-mono">{v.whatsapp ?? '—'}</td>
                      <td className="p-2">{v.franjas ? `${v.franjas} franjas` : '—'}</td>
                      <td className="p-2">
                        {deGoogle.has(v.fila) ? (
                          <span className="flex flex-col items-start gap-1">
                            <span className="rounded-full bg-sun px-2 text-xs font-bold text-sun-ink">Ubicada por Google</span>
                            {deGoogle.get(v.fila) && <span className="text-xs text-muted">{deGoogle.get(v.fila)}</span>}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">Del archivo</span>
                        )}
                        <button type="button" onClick={() => setUbicando(v.fila)} className="mt-1 block text-xs font-bold text-green underline">
                          Ver o ajustar el pin
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <SelectorEstado valor={estado} onChange={setEstado} />
          <p className="text-sm text-muted">
            Al agregarlos confirmas que los dueños autorizaron publicar sus WhatsApp en MiCuadra (Ley 1581).
          </p>
          <button
            type="button"
            disabled={r.errores.length > 0 || r.validas.length === 0 || lote.isPending}
            onClick={() => lote.mutate({ filas, estado, simular: false })}
            className="tap rounded-caja bg-green px-4 font-bold text-green-ink disabled:opacity-50"
          >
            {r.errores.length
              ? 'Ubica o corrige las filas marcadas para continuar'
              : `Agregar ${r.validas.length} ${r.validas.length === 1 ? 'negocio' : 'negocios'}`}
          </button>
        </>
      )}
      {ubicando !== null && filas[ubicando - 2] && (
        <UbicarFila fila={ubicando} datos={filas[ubicando - 2] as FilaCsv} alGuardar={(p) => ubicar(ubicando, p)} alCerrar={() => setUbicando(null)} />
      )}
    </div>
  )
}

/** Mapa para poner el pin de una fila del CSV que no traía ubicación (o la traía mal). */
function UbicarFila({
  fila,
  datos,
  alGuardar,
  alCerrar,
}: {
  fila: number
  datos: FilaCsv
  alGuardar: (p: Punto) => void
  alCerrar: () => void
}) {
  const barrios = useQuery({ queryKey: ['barrios'], queryFn: () => apiGet<Barrio[]>('/barrios'), staleTime: Infinity })
  const normal = (t = '') => t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const delBarrio = barrios.data?.find((b) => datos.barrio && normal(b.nombre) === normal(datos.barrio))?.centroide
  const [punto, setPunto] = useState<Punto | null>(() => {
    const m = datos.ubicacion?.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/)
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null
  })
  return (
    <Dialogo titulo={`Ubicar ${datos.nombre ?? 'negocio'}`} alCerrar={alCerrar}>
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm text-muted">Fila {fila}</p>
          <h2 className="text-xl font-black">{datos.nombre || '(sin nombre)'}</h2>
          <p className="text-sm">
            {datos.direccion || 'Sin dirección'}
            {datos.barrio && ` · ${datos.barrio}`}
          </p>
        </div>
        <p className="text-sm text-muted">Toca el mapa o mueve el pin justo donde está la puerta.</p>
        <Suspense fallback={<div className="esqueleto h-72 rounded-caja" />}>
          <SelectorUbicacion
            punto={punto ?? delBarrio ?? CENTRO_PEREIRA}
            alCambiar={setPunto}
            emoji={emojiCategoria(normal(datos.categoria).replace(/\s+/g, '-'))}
          />
        </Suspense>
        <button
          type="button"
          disabled={!punto}
          onClick={() => punto && alGuardar(punto)}
          className="tap rounded-caja bg-green px-4 font-bold text-green-ink disabled:opacity-50"
        >
          {punto ? 'Guardar ubicación' : 'Primero pon el pin'}
        </button>
        <button type="button" onClick={alCerrar} className="tap font-bold text-muted">
          Cancelar
        </button>
      </div>
    </Dialogo>
  )
}
