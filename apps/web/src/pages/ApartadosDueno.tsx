import { MessageCircle } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { TarjetaApartado } from '../components/TarjetaApartado'
import { apiEnviar, apiGet, type Apartado, type CambioEstadoApartado, type MiNegocio } from '../lib/api'
import { enlaceWhatsappTexto } from '../lib/negocio'
import { usePerfil } from '../lib/sesion'
import { Cargando } from './Cuenta'

type Vista = 'tablero' | 'entregado' | 'cancelado'

const VISTAS: { valor: Vista; texto: string }[] = [
  { valor: 'tablero', texto: 'En curso' },
  { valor: 'entregado', texto: 'Entregados' },
  { valor: 'cancelado', texto: 'Cancelados' },
]

/** Las columnas del tablero, en el orden en que avanza un pedido. */
const COLUMNAS: { estado: Apartado['estado']; titulo: string; vacio: string }[] = [
  { estado: 'pendiente', titulo: 'Nuevos', vacio: 'Sin pedidos nuevos.' },
  { estado: 'confirmado', titulo: 'Preparando', vacio: 'Nada en preparación.' },
  { estado: 'listo', titulo: 'Para entregar', vacio: 'Nada esperando entrega.' },
]

/** El siguiente paso de cada pedido, con el texto del botón según cómo se entrega. */
function siguiente(a: Apartado): { estado: CambioEstadoApartado['estado']; texto: string } | null {
  const domicilio = a.entrega === 'domicilio'
  switch (a.estado) {
    case 'pendiente':
      return { estado: 'confirmado', texto: 'Aceptar y preparar' }
    case 'confirmado':
      return { estado: 'listo', texto: domicilio ? 'Salió a entregar' : 'Listo para recoger' }
    case 'listo':
      return { estado: 'entregado', texto: 'Entregado y pagado' }
    default:
      return null
  }
}

/** Pedidos contra entrega del negocio, por etapas: nuevos → preparando → para entregar. */
export function ApartadosDueno() {
  const { id = '' } = useParams()
  const { sesion, token, cargandoSesion } = usePerfil()
  const [vista, setVista] = useState<Vista>('tablero')
  const filtro = vista === 'tablero' ? 'abiertos' : vista

  const negocios = useQuery({
    queryKey: ['mis-negocios', sesion?.user.id],
    queryFn: () => apiGet<MiNegocio[]>('/mis-negocios', undefined, token),
    enabled: Boolean(token),
  })
  const pedidos = useQuery({
    queryKey: ['apartados-negocio', id, filtro],
    queryFn: () => apiGet<Apartado[]>(`/mis-negocios/${id}/apartados?estado=${filtro}`, undefined, token),
    enabled: Boolean(token),
    refetchInterval: 30_000,
  })

  if (cargandoSesion) return <Cargando />
  if (!sesion || !token) return <Navigate to="/entrar" replace />
  const negocio = negocios.data?.find((n) => n.id === id)

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8">
      <div className="max-w-xl">
        <Link to="/cuenta" className="text-sm font-bold text-green underline">
          ← Mi cuenta
        </Link>
        <h1 className="mt-1 text-2xl font-black">Pedidos de {negocio?.nombre ?? 'tu negocio'}</h1>
        <p className="mt-1 text-muted">
          Todo es contra entrega: el vecino paga cuando recibe, en efectivo o por transferencia. Al aceptar un pedido se
          descuenta del inventario.
        </p>
        <Link to={`/mi-negocio/${id}/catalogo`} className="mt-2 inline-block font-bold text-green underline">
          Editar mi catálogo
        </Link>
      </div>

      <div className="grid max-w-xl grid-cols-3 gap-1 rounded-caja bg-block p-1" role="tablist" aria-label="Ver pedidos">
        {VISTAS.map((v) => (
          <button
            key={v.valor}
            type="button"
            role="tab"
            aria-selected={vista === v.valor}
            onClick={() => setVista(v.valor)}
            className={`tap rounded-[10px] text-sm font-bold ${vista === v.valor ? 'bg-surface shadow-1' : 'text-muted'}`}
          >
            {v.texto}
          </button>
        ))}
      </div>

      {pedidos.isPending ? (
        <Cargando />
      ) : pedidos.isError ? (
        <p role="alert" className="font-bold">
          {pedidos.error.message}
        </p>
      ) : vista === 'tablero' ? (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNAS.map((c) => {
            const lista = pedidos.data.filter((a) => a.estado === c.estado)
            return (
              <section key={c.estado} aria-labelledby={`columna-${c.estado}`} className="flex flex-col gap-2 rounded-caja bg-block/60 p-2">
                <h2 id={`columna-${c.estado}`} className="flex items-center justify-between px-1 font-black">
                  {c.titulo}
                  <span
                    className={`rounded-full px-2 font-mono text-sm ${
                      c.estado === 'pendiente' && lista.length ? 'bg-sun text-sun-ink' : 'bg-surface text-muted'
                    }`}
                  >
                    {lista.length}
                  </span>
                </h2>
                {lista.length === 0 ? (
                  <p className="px-1 py-3 text-center text-sm text-muted">{c.vacio}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {lista.map((a) => (
                      <PedidoDelNegocio key={a.id} a={a} negocioId={id} token={token} />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      ) : pedidos.data.length === 0 ? (
        <p className="py-6 text-center text-muted">Nada por aquí todavía.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {pedidos.data.map((a) => (
            <PedidoDelNegocio key={a.id} a={a} negocioId={id} token={token} />
          ))}
        </ul>
      )}
    </section>
  )
}

function PedidoDelNegocio({ a, negocioId, token }: { a: Apartado; negocioId: string; token: string }) {
  const queryClient = useQueryClient()
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const cambiar = useMutation({
    mutationFn: (cambio: CambioEstadoApartado) =>
      apiEnviar<Apartado>('POST', `/mis-negocios/${negocioId}/apartados/${a.id}/estado`, cambio, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['apartados-negocio', negocioId] })
      void queryClient.invalidateQueries({ queryKey: ['mis-negocios'] })
      void queryClient.invalidateQueries({ queryKey: ['mi-catalogo', negocioId] })
    },
  })
  const paso = siguiente(a)
  const vecino = a.vecino?.nombre?.split(' ')[0] ?? 'Vecino'
  const aviso =
    a.estado === 'pendiente'
      ? `Hola, ${vecino}. Recibimos tu pedido ${a.codigo} en ${a.negocio.nombre}.`
      : a.entrega === 'domicilio'
        ? `Hola, ${vecino}. Tu pedido ${a.codigo} de ${a.negocio.nombre} va en camino 🛵`
        : `Hola, ${vecino}. Tu pedido ${a.codigo} en ${a.negocio.nombre} ya está listo para recoger 🙌`

  return (
    <TarjetaApartado
      a={a}
      seguimiento={false}
      titulo={a.vecino?.nombre ?? 'Vecino'}
      acciones={
        cancelando ? (
          <form
            className="flex w-full flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              cambiar.mutate({ estado: 'cancelado', motivo: motivo.trim() || null })
            }}
          >
            <label className="flex flex-col gap-1 text-sm font-bold">
              ¿Por qué lo cancelas? (lo ve el vecino)
              <input
                autoFocus
                maxLength={200}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Se acabó el pan, no hacemos domicilio allá…"
                className="tap rounded-caja border border-line bg-bg px-3 text-base font-normal"
              />
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={cambiar.isPending} className="tap rounded-caja bg-red px-4 font-bold text-white">
                Cancelar pedido
              </button>
              <button type="button" onClick={() => setCancelando(false)} className="tap rounded-caja border border-line px-4 font-bold">
                Volver
              </button>
            </div>
            {cambiar.isError && (
              <p role="alert" className="text-sm font-bold text-red">
                {cambiar.error.message}
              </p>
            )}
          </form>
        ) : paso ? (
          <>
            <button
              type="button"
              disabled={cambiar.isPending}
              onClick={() => cambiar.mutate({ estado: paso.estado })}
              className="tap w-full rounded-caja bg-green px-4 font-bold text-green-ink disabled:opacity-50"
            >
              {paso.texto}
            </button>
            {a.vecino?.celular && (
              <a
                href={enlaceWhatsappTexto(a.vecino.celular, aviso)}
                target="_blank"
                rel="noopener noreferrer"
                className="tap inline-flex items-center rounded-caja border border-line px-4 font-bold"
              >
                <MessageCircle className="mr-1.5 size-4" aria-hidden="true" /> Escribirle
              </a>
            )}
            <button type="button" onClick={() => setCancelando(true)} className="tap px-2 text-sm font-bold text-red underline">
              Cancelar
            </button>
            {cambiar.isError && (
              <p role="alert" className="w-full text-sm font-bold text-red">
                {cambiar.error.message}
              </p>
            )}
          </>
        ) : null
      }
    />
  )
}
