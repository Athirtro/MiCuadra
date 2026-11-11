import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { Dialogo } from '../components/Dialogo'
import { apiEnviar, apiGet, type Catalogo, type Item, type ItemEntrada, type MiNegocio, type Seccion } from '../lib/api'
import { formatoCOP } from '../lib/formato'
import { comprimirFoto } from '../lib/imagen'
import { usePerfil } from '../lib/sesion'
import { borrarArchivoFoto, subirFoto } from '../lib/supabase'
import { Cargando } from './Cuenta'

/** Panel del dueño: secciones, productos y servicios, precios, fotos e inventario. */
export function CatalogoDueno() {
  const { id = '' } = useParams()
  const { sesion, token, cargandoSesion } = usePerfil()
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState<Item | 'nuevo' | null>(null)
  const [seccionEditando, setSeccionEditando] = useState<Seccion | 'nueva' | null>(null)

  const negocios = useQuery({
    queryKey: ['mis-negocios', sesion?.user.id],
    queryFn: () => apiGet<MiNegocio[]>('/mis-negocios', undefined, token),
    enabled: Boolean(token),
  })
  const catalogo = useQuery({
    queryKey: ['mi-catalogo', id],
    queryFn: () => apiGet<Catalogo>(`/mis-negocios/${id}/catalogo`, undefined, token),
    enabled: Boolean(token),
  })
  const stock = useMutation({
    mutationFn: ({ item, delta }: { item: Item; delta: number }) =>
      apiEnviar<Item>('POST', `/mis-negocios/${id}/catalogo/items/${item.id}/stock`, { delta }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mi-catalogo', id] }),
  })

  if (cargandoSesion) return <Cargando />
  if (!sesion || !token) return <Navigate to="/entrar" replace />
  if (catalogo.isPending) return <Cargando />
  if (catalogo.isError) {
    return (
      <section className="mx-auto max-w-md px-4 py-10">
        <p role="alert" className="font-bold">
          {catalogo.error.message}
        </p>
        <Link to="/cuenta" className="mt-3 inline-block font-bold text-green underline">
          Volver a mi cuenta
        </Link>
      </section>
    )
  }

  const negocio = negocios.data?.find((n) => n.id === id)
  const { secciones, items } = catalogo.data
  const grupos = [
    ...secciones.map((s) => ({ seccion: s as Seccion | null, items: items.filter((i) => i.seccion_id === s.id) })),
    { seccion: null, items: items.filter((i) => !i.seccion_id) },
  ].filter((g) => g.seccion || g.items.length)

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8 pb-28">
      <div>
        <Link to="/cuenta" className="text-sm font-bold text-green underline">
          ← Mi cuenta
        </Link>
        <h1 className="mt-1 text-2xl font-black">Catálogo de {negocio?.nombre ?? 'este negocio'}</h1>
        <p className="mt-1 text-muted">
          Lo que agregues aquí lo ven los vecinos en tu perfil y lo pueden apartar. Si llevas inventario, se descuenta solo
          cuando confirmas un apartado.
        </p>
        <Link to={`/mi-negocio/${id}/apartados`} className="mt-2 inline-block font-bold text-green underline">
          Ver apartados{negocio?.apartados_pendientes ? ` (${negocio.apartados_pendientes} por confirmar)` : ''}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Secciones">
        {secciones.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSeccionEditando(s)}
            className="tap inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 text-sm font-bold"
          >
            {s.nombre} <span aria-hidden="true" className="text-muted">✎</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSeccionEditando('nueva')}
          className="tap inline-flex items-center rounded-full border border-dashed border-line px-3 text-sm font-bold text-muted"
        >
          ＋ Sección
        </button>
      </div>

      {items.length === 0 && (
        <div className="tarjeta p-6 text-center">
          <p className="text-3xl" aria-hidden="true">
            🧺
          </p>
          <p className="mt-2 font-bold">Tu catálogo está vacío</p>
          <p className="mt-1 text-sm text-muted">
            Empieza por lo que más te piden. Puedes crear secciones como «Panes» o «Bebidas» para ordenarlo.
          </p>
        </div>
      )}

      {grupos.map((g) => (
        <div key={g.seccion?.id ?? 'sin'} className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] tracking-wider text-muted uppercase">{g.seccion?.nombre ?? 'Sin sección'}</h2>
          {g.items.length === 0 ? (
            <p className="text-sm text-muted">Nada en esta sección todavía.</p>
          ) : (
            <ul className="tarjeta divide-y divide-line">
              {g.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 p-3">
                  <button type="button" onClick={() => setEditando(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-caja bg-block text-xl" aria-hidden="true">
                      {i.foto_url ? <img src={i.foto_url} alt="" className="size-full object-cover" /> : i.tipo === 'servicio' ? '✂️' : '📦'}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{i.nombre}</span>
                      <span className="block text-sm text-muted">
                        {i.precio !== null ? formatoCOP(i.precio) : 'Sin precio'}
                        {i.tipo === 'servicio' && ' · Servicio'}
                        {!i.visible && ' · Oculto'}
                      </span>
                    </span>
                  </button>
                  {i.tipo === 'producto' && i.stock !== null && (
                    <div className="flex shrink-0 items-center rounded-full border border-line" role="group" aria-label={`Inventario de ${i.nombre}`}>
                      <button
                        type="button"
                        disabled={stock.isPending || i.stock === 0}
                        onClick={() => stock.mutate({ item: i, delta: -1 })}
                        aria-label={`Restar uno a ${i.nombre}`}
                        className="tap grid place-items-center text-lg font-black disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className={`min-w-6 text-center font-mono text-sm font-bold ${i.stock === 0 ? 'text-red' : ''}`}>
                        {i.stock}
                      </span>
                      <button
                        type="button"
                        disabled={stock.isPending}
                        onClick={() => stock.mutate({ item: i, delta: 1 })}
                        aria-label={`Sumar uno a ${i.nombre}`}
                        className="tap grid place-items-center text-lg font-black disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {stock.isError && (
        <p role="alert" className="text-sm font-bold text-red">
          {stock.error.message}
        </p>
      )}

      <div className="barra-inferior fixed inset-x-0 bottom-0 z-[1050] border-t border-line bg-surface/90 px-4 pt-3 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setEditando('nuevo')}
          className="tap mx-auto flex w-full max-w-xl items-center justify-center rounded-caja bg-green px-4 font-bold text-green-ink shadow-1"
        >
          ＋ Agregar producto o servicio
        </button>
      </div>

      {editando && (
        <FormItem
          negocioId={id}
          token={token}
          item={editando === 'nuevo' ? null : editando}
          secciones={secciones}
          alCerrar={() => setEditando(null)}
        />
      )}
      {seccionEditando && (
        <FormSeccion
          negocioId={id}
          token={token}
          seccion={seccionEditando === 'nueva' ? null : seccionEditando}
          alCerrar={() => setSeccionEditando(null)}
        />
      )}
    </section>
  )
}

const ENTRADA = 'tap w-full rounded-caja border border-line bg-bg px-3 text-base'

function FormSeccion({
  negocioId,
  token,
  seccion,
  alCerrar,
}: {
  negocioId: string
  token: string
  seccion: Seccion | null
  alCerrar: () => void
}) {
  const queryClient = useQueryClient()
  const [nombre, setNombre] = useState(seccion?.nombre ?? '')
  const base = `/mis-negocios/${negocioId}/catalogo/secciones`
  const listo = () => {
    void queryClient.invalidateQueries({ queryKey: ['mi-catalogo', negocioId] })
    alCerrar()
  }
  const guardar = useMutation({
    mutationFn: () =>
      seccion
        ? apiEnviar<Seccion>('PUT', `${base}/${seccion.id}`, { nombre: nombre.trim(), orden: seccion.orden }, token)
        : apiEnviar<Seccion>('POST', base, { nombre: nombre.trim() }, token),
    onSuccess: listo,
  })
  const borrar = useMutation({
    mutationFn: () => apiEnviar<null>('DELETE', `${base}/${seccion?.id}`, undefined, token),
    onSuccess: listo,
  })

  return (
    <Dialogo titulo={seccion ? 'Editar sección' : 'Nueva sección'} alCerrar={alCerrar}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (nombre.trim()) guardar.mutate()
        }}
      >
        <h2 className="text-xl font-black">{seccion ? 'Editar sección' : 'Nueva sección'}</h2>
        <label className="flex flex-col gap-1 font-bold">
          Nombre
          <input
            required
            autoFocus
            maxLength={40}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Panes, Bebidas, Cortes…"
            className={ENTRADA}
          />
        </label>
        {(guardar.isError || borrar.isError) && (
          <p role="alert" className="text-sm font-bold text-red">
            {(guardar.error ?? borrar.error)?.message}
          </p>
        )}
        <button type="submit" disabled={!nombre.trim() || guardar.isPending} className="tap rounded-caja bg-green px-4 font-bold text-green-ink disabled:opacity-50">
          Guardar
        </button>
        {seccion && (
          <button
            type="button"
            disabled={borrar.isPending}
            onClick={() => borrar.mutate()}
            className="tap rounded-caja border border-line px-4 font-bold text-red"
          >
            Borrar sección (los productos quedan sin sección)
          </button>
        )}
        <button type="button" onClick={alCerrar} className="tap font-bold text-muted">
          Cancelar
        </button>
      </form>
    </Dialogo>
  )
}

function FormItem({
  negocioId,
  token,
  item,
  secciones,
  alCerrar,
}: {
  negocioId: string
  token: string
  item: Item | null
  secciones: Seccion[]
  alCerrar: () => void
}) {
  const queryClient = useQueryClient()
  const archivo = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState<Item['tipo']>(item?.tipo ?? 'producto')
  const [nombre, setNombre] = useState(item?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(item?.descripcion ?? '')
  const [precio, setPrecio] = useState(item?.precio !== null && item?.precio !== undefined ? String(item.precio) : '')
  const [conStock, setConStock] = useState(item ? item.stock !== null : false)
  const [cantidad, setCantidad] = useState(item?.stock !== null && item?.stock !== undefined ? String(item.stock) : '')
  const [seccion, setSeccion] = useState(item?.seccion_id ?? '')
  const [visible, setVisible] = useState(item?.visible ?? true)
  const [foto, setFoto] = useState<string | null>(item?.foto_url ?? null)
  const [subiendo, setSubiendo] = useState(false)
  const [errorFoto, setErrorFoto] = useState<string | null>(null)

  const base = `/mis-negocios/${negocioId}/catalogo/items`
  const listo = () => {
    void queryClient.invalidateQueries({ queryKey: ['mi-catalogo', negocioId] })
    alCerrar()
  }
  const soloDigitos = (v: string) => v.replace(/\D/g, '')

  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo: ItemEntrada = {
        tipo,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        precio: precio ? Number(precio) : null,
        stock: tipo === 'producto' && conStock ? Number(cantidad || 0) : null,
        seccion_id: seccion || null,
        foto_url: foto,
        visible,
        orden: item?.orden ?? 0,
      }
      return item ? apiEnviar<Item>('PUT', `${base}/${item.id}`, cuerpo, token) : apiEnviar<Item>('POST', base, cuerpo, token)
    },
    onSuccess: () => {
      // La foto anterior, si se cambió, ya no se usa.
      if (item?.foto_url && item.foto_url !== foto) void borrarArchivoFoto(item.foto_url, token)
      listo()
    },
  })
  const borrar = useMutation({
    mutationFn: () => apiEnviar<{ foto_url: string | null }>('DELETE', `${base}/${item?.id}`, undefined, token),
    onSuccess: (r) => {
      if (r.foto_url) void borrarArchivoFoto(r.foto_url, token)
      listo()
    },
  })

  async function elegirFoto(e: ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0]
    e.target.value = ''
    if (!elegido) return
    setErrorFoto(null)
    setSubiendo(true)
    try {
      setFoto(await subirFoto(negocioId, await comprimirFoto(elegido), token, 'catalogo'))
    } catch (err) {
      setErrorFoto((err as Error).message)
    } finally {
      setSubiendo(false)
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (nombre.trim().length >= 2 && !subiendo) guardar.mutate()
  }

  return (
    <Dialogo titulo={item ? 'Editar' : 'Agregar al catálogo'} alCerrar={alCerrar}>
      <form onSubmit={enviar} className="flex max-h-[80vh] flex-col gap-3 overflow-y-auto">
        <h2 className="text-xl font-black">{item ? 'Editar' : 'Agregar al catálogo'}</h2>

        <div className="grid grid-cols-2 gap-1 rounded-caja bg-block p-1" role="radiogroup" aria-label="Tipo">
          {(['producto', 'servicio'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tipo === t}
              onClick={() => setTipo(t)}
              className={`tap rounded-[10px] font-bold ${tipo === t ? 'bg-surface shadow-1' : 'text-muted'}`}
            >
              {t === 'producto' ? '📦 Producto' : '✂️ Servicio'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => archivo.current?.click()}
            className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-caja border border-dashed border-line bg-bg text-sm text-muted"
            aria-label={foto ? 'Cambiar foto' : 'Agregar foto'}
          >
            {subiendo ? 'Subiendo…' : foto ? <img src={foto} alt="" className="size-full object-cover" /> : '📷 Foto'}
          </button>
          <div className="text-sm text-muted">
            <p>Foto opcional. Se comprime en tu celular.</p>
            {foto && (
              <button type="button" onClick={() => setFoto(null)} className="mt-1 font-bold text-red underline">
                Quitar foto
              </button>
            )}
          </div>
          <input ref={archivo} type="file" accept="image/*" hidden onChange={elegirFoto} aria-label="Elegir foto" />
        </div>
        {errorFoto && <p className="text-sm font-bold text-red">{errorFoto}</p>}

        <label className="flex flex-col gap-1 font-bold">
          Nombre
          <input required minLength={2} maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} className={ENTRADA} />
        </label>
        <label className="flex flex-col gap-1 font-bold">
          Descripción (opcional)
          <textarea
            maxLength={200}
            rows={2}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="rounded-caja border border-line bg-bg px-3 py-2 text-base font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 font-bold">
          Precio
          <span className="flex items-center gap-2">
            <span className="text-muted">$</span>
            <input
              inputMode="numeric"
              value={precio ? Number(precio).toLocaleString('es-CO') : ''}
              onChange={(e) => setPrecio(soloDigitos(e.target.value).slice(0, 8))}
              placeholder="Vacío = «Pregunta el precio»"
              className={ENTRADA}
            />
          </span>
        </label>

        {tipo === 'producto' && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3 font-bold">
              <input type="checkbox" checked={conStock} onChange={(e) => setConStock(e.target.checked)} className="size-5 accent-[var(--green)]" />
              Llevar inventario
            </label>
            {conStock && (
              <label className="flex flex-col gap-1 text-sm font-bold">
                Unidades disponibles
                <input
                  inputMode="numeric"
                  value={cantidad}
                  onChange={(e) => setCantidad(soloDigitos(e.target.value).slice(0, 6))}
                  className={ENTRADA}
                />
                <span className="font-normal text-muted">Con 0 sale «Agotado». Se descuenta al confirmar un apartado.</span>
              </label>
            )}
          </div>
        )}

        {secciones.length > 0 && (
          <label className="flex flex-col gap-1 font-bold">
            Sección
            <select value={seccion} onChange={(e) => setSeccion(e.target.value)} className={ENTRADA}>
              <option value="">Sin sección</option>
              {secciones.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="size-5 accent-[var(--green)]" />
          Mostrar en mi perfil
        </label>

        {(guardar.isError || borrar.isError) && (
          <p role="alert" className="text-sm font-bold text-red">
            {(guardar.error ?? borrar.error)?.message}
          </p>
        )}
        <button
          type="submit"
          disabled={nombre.trim().length < 2 || guardar.isPending || subiendo}
          className="tap rounded-caja bg-green px-4 font-bold text-green-ink disabled:opacity-50"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        {item && (
          <button
            type="button"
            disabled={borrar.isPending}
            onClick={() => borrar.mutate()}
            className="tap rounded-caja border border-line px-4 font-bold text-red"
          >
            Borrar del catálogo
          </button>
        )}
        <button type="button" onClick={alCerrar} className="tap font-bold text-muted">
          Cancelar
        </button>
      </form>
    </Dialogo>
  )
}
