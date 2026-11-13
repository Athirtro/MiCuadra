import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { mensajeApartado, textoTotal } from '../lib/apartado'
import { apiEnviar, type Apartado, type ApartadoEntrada, type Catalogo, type Item, type NegocioDetalle } from '../lib/api'
import { precioFinal, resumenCarrito, type Carrito } from '../lib/carrito'
import { registrarEvento } from '../lib/eventos'
import { formatoCOP } from '../lib/formato'
import { emojiCategoria, enlaceWhatsappTexto } from '../lib/negocio'
import { usePerfil } from '../lib/sesion'
import { guardarVolver } from '../lib/volver'
import { Dialogo } from './Dialogo'
import { Precio } from './Precio'

type Poner = (itemId: string, cantidad: number, tope?: number | null) => void

/** Grupos en el orden del dueño; lo que no tiene sección va al final en "Otros". */
function agrupar(c: Catalogo): { id: string; nombre: string; items: Item[] }[] {
  const grupos = c.secciones.map((s) => ({ id: s.id, nombre: s.nombre, items: c.items.filter((i) => i.seccion_id === s.id) }))
  const sueltos = c.items.filter((i) => !i.seccion_id || !c.secciones.some((s) => s.id === i.seccion_id))
  if (sueltos.length) grupos.push({ id: 'otros', nombre: grupos.length ? 'Otros' : '', items: sueltos })
  return grupos.filter((g) => g.items.length)
}

export function CatalogoNegocio({
  n,
  catalogo,
  carrito,
  poner,
}: {
  n: NegocioDetalle
  catalogo: Catalogo
  carrito: Carrito
  poner: Poner
}) {
  const grupos = agrupar(catalogo)
  const conNombre = grupos.filter((g) => g.nombre)
  return (
    <section className="tarjeta mt-5 overflow-hidden" aria-labelledby="titulo-catalogo">
      <div className="p-4 pb-2">
        <h2 id="titulo-catalogo" className="text-lg font-black">
          Catálogo
        </h2>
        <p className="text-sm text-muted">Agrega lo que quieras y apártalo. Pagas al recoger.</p>
      </div>
      {conNombre.length > 1 && (
        <nav aria-label="Secciones del catálogo" className="flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
          {conNombre.map((g) => (
            <a
              key={g.id}
              href={`#seccion-${g.id}`}
              className="tap inline-flex shrink-0 items-center rounded-full border border-line px-3 text-sm font-bold"
            >
              {g.nombre}
            </a>
          ))}
        </nav>
      )}
      {grupos.map((g) => (
        <div key={g.id} id={`seccion-${g.id}`} className="scroll-mt-20">
          {g.nombre && <h3 className="bg-bg px-4 py-1.5 font-mono text-[11px] tracking-wider text-muted uppercase">{g.nombre}</h3>}
          <ul className="divide-y divide-line">
            {g.items.map((i) => (
              <FilaItem key={i.id} i={i} n={n} cantidad={carrito[i.id] ?? 0} poner={poner} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function FilaItem({ i, n, cantidad, poner }: { i: Item; n: NegocioDetalle; cantidad: number; poner: Poner }) {
  const agotado = i.stock === 0
  const tope = i.stock
  return (
    <li className={`flex gap-3 px-4 py-3 ${agotado ? 'opacity-60' : ''}`}>
      <span
        className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-caja text-2xl"
        style={{ background: `${n.categoria.color}1a` }}
        aria-hidden="true"
      >
        {i.foto_url ? (
          <img src={i.foto_url} alt="" loading="lazy" className="size-full object-cover" width={64} height={64} />
        ) : (
          emojiCategoria(n.categoria.slug)
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-tight">{i.nombre}</p>
        {i.descripcion && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{i.descripcion}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
          <Precio precio={i.precio} oferta={i.precio_oferta} />
          {i.precio_oferta !== null && <span className="rounded-full bg-red/10 px-2 text-xs font-bold text-red">🔥 Oferta</span>}
          {i.tipo === 'servicio' && <span className="rounded bg-block px-1.5 text-xs font-bold">Servicio</span>}
          {agotado ? (
            <span className="font-bold text-red">Agotado</span>
          ) : (
            tope !== null && tope <= 5 && <span className="text-muted">Quedan {tope}</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        {cantidad > 0 ? (
          <div className="flex items-center rounded-full bg-green text-green-ink" role="group" aria-label={`Cantidad de ${i.nombre}`}>
            <button
              type="button"
              onClick={() => poner(i.id, cantidad - 1, tope)}
              aria-label={`Quitar uno de ${i.nombre}`}
              className="tap grid place-items-center text-xl font-black"
            >
              −
            </button>
            <span className="min-w-5 text-center font-mono font-bold" aria-live="polite">
              {cantidad}
            </span>
            <button
              type="button"
              onClick={() => poner(i.id, cantidad + 1, tope)}
              disabled={tope !== null && cantidad >= tope}
              aria-label={`Agregar otro de ${i.nombre}`}
              className="tap grid place-items-center text-xl font-black disabled:opacity-40"
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={agotado}
            onClick={() => poner(i.id, 1, tope)}
            aria-label={`Agregar ${i.nombre}`}
            className="tap rounded-full border-2 border-green px-4 text-sm font-bold text-green disabled:border-line disabled:text-muted"
          >
            Agregar
          </button>
        )}
      </div>
    </li>
  )
}

export function DialogoCarrito({
  n,
  catalogo,
  carrito,
  poner,
  vaciar,
  alCerrar,
}: {
  n: NegocioDetalle
  catalogo: Catalogo
  carrito: Carrito
  poner: Poner
  vaciar: () => void
  alCerrar: () => void
}) {
  const { sesion, token } = usePerfil()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  const [nota, setNota] = useState('')
  const r = resumenCarrito(catalogo, carrito)

  const apartar = useMutation({
    mutationFn: () => {
      const cuerpo: ApartadoEntrada = {
        items: r.lineas.map((l) => ({ item_id: l.item.id, cantidad: l.cantidad })),
        nota: nota.trim() || null,
      }
      return apiEnviar<Apartado>('POST', `/negocios/${n.id}/apartados`, cuerpo, token)
    },
    onSuccess: () => {
      vaciar()
      void queryClient.invalidateQueries({ queryKey: ['mis-apartados'] })
    },
    // Si algo se agotó mientras tanto, el catálogo se recarga para mostrarlo.
    onError: () => void queryClient.invalidateQueries({ queryKey: ['catalogo', n.slug] }),
  })

  if (apartar.isSuccess) {
    const a = apartar.data
    return (
      <Dialogo titulo="Apartado listo" alCerrar={alCerrar}>
        <div role="status" className="entra text-center">
          <p className="text-4xl" aria-hidden="true">
            <span className="celebra">🛒</span>
          </p>
          <h2 className="mt-2 text-2xl font-black">¡Apartado!</h2>
          <p className="mt-1 text-muted">
            Tu código es <strong className="font-mono text-ink">{a.codigo}</strong>. Avísale a {n.nombre} por WhatsApp para
            que lo prepare. Pagas al recoger.
          </p>
          {a.negocio.whatsapp && (
            <a
              href={enlaceWhatsappTexto(a.negocio.whatsapp, mensajeApartado(a))}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => registrarEvento('click_whatsapp', n.id, { apartado: a.codigo })}
              className="tap mt-5 flex items-center justify-center gap-2 rounded-caja bg-green px-4 font-bold text-green-ink"
            >
              💬 Avisar por WhatsApp
            </a>
          )}
          <Link to="/mis-apartados" className="tap mt-2 flex items-center justify-center rounded-caja border border-line px-4 font-bold">
            Ver mis apartados
          </Link>
        </div>
      </Dialogo>
    )
  }

  return (
    <Dialogo titulo="Tu apartado" alCerrar={alCerrar}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-2xl font-black">Tu apartado</h2>
        <button type="button" onClick={alCerrar} aria-label="Cerrar" className="tap -m-2 grid place-items-center text-2xl text-muted">
          ×
        </button>
      </div>
      <p className="text-sm text-muted">En {n.nombre}. Pagas al recoger.</p>

      {r.lineas.length === 0 ? (
        <p className="mt-4 text-muted">Tu carrito está vacío.</p>
      ) : (
        <ul className="mt-3 flex max-h-[45vh] flex-col divide-y divide-line overflow-y-auto">
          {r.lineas.map(({ item, cantidad }) => (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{item.nombre}</p>
                <p className="text-sm text-muted">
                  {item.precio !== null ? formatoCOP(precioFinal(item) * cantidad) : 'Precio por confirmar'}
                </p>
              </div>
              <div className="flex items-center rounded-full border border-line" role="group" aria-label={`Cantidad de ${item.nombre}`}>
                <button
                  type="button"
                  onClick={() => poner(item.id, cantidad - 1, item.stock)}
                  aria-label={`Quitar uno de ${item.nombre}`}
                  className="tap grid place-items-center text-xl font-black"
                >
                  −
                </button>
                <span className="min-w-5 text-center font-mono font-bold">{cantidad}</span>
                <button
                  type="button"
                  onClick={() => poner(item.id, cantidad + 1, item.stock)}
                  disabled={item.stock !== null && cantidad >= item.stock}
                  aria-label={`Agregar otro de ${item.nombre}`}
                  className="tap grid place-items-center text-xl font-black disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {r.lineas.length > 0 && (
        <>
          <label className="mt-3 flex flex-col gap-1 text-sm font-bold">
            Nota para el negocio (opcional)
            <textarea
              rows={2}
              maxLength={280}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Paso a las 5 p. m., el pan bien tostado…"
              className="rounded-caja border border-line bg-bg px-3 py-2 text-base font-normal"
            />
          </label>
          <p className="mt-3 flex items-baseline justify-between text-lg font-black">
            <span>Total</span>
            <span>{textoTotal({ total: r.total, hay_sin_precio: r.hay_sin_precio })}</span>
          </p>
          {apartar.isError && (
            <p role="alert" className="mt-2 text-sm font-bold text-red">
              {apartar.error.message}
            </p>
          )}
          {sesion ? (
            <button
              type="button"
              disabled={apartar.isPending}
              onClick={() => apartar.mutate()}
              className="tap mt-3 w-full rounded-caja bg-green px-4 font-bold text-green-ink disabled:opacity-50"
            >
              {apartar.isPending ? 'Apartando…' : 'Apartar'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  guardarVolver(pathname)
                  navigate('/entrar')
                }}
                className="tap mt-3 w-full rounded-caja bg-green px-4 font-bold text-green-ink"
              >
                Entrar para apartar
              </button>
              <p className="mt-2 text-center text-xs text-muted">Tu carrito te espera aquí cuando vuelvas.</p>
            </>
          )}
        </>
      )}
    </Dialogo>
  )
}
