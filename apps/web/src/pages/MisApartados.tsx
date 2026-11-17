import { MessageCircle, ShoppingBasket } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router'
import { TarjetaApartado } from '../components/TarjetaApartado'
import { mensajeApartado } from '../lib/apartado'
import { apiEnviar, apiGet, type Apartado } from '../lib/api'
import { enlaceWhatsappTexto } from '../lib/negocio'
import { usePerfil } from '../lib/sesion'
import { Cargando } from './Cuenta'

/** Los pedidos del vecino con su seguimiento; se puede cancelar mientras la tienda no lo acepte. */
export function MisApartados() {
  const { sesion, token, cargandoSesion } = usePerfil()
  const apartados = useQuery({
    queryKey: ['mis-apartados', sesion?.user.id],
    queryFn: () => apiGet<Apartado[]>('/mis-apartados', undefined, token),
    enabled: Boolean(token),
    refetchInterval: 30_000,
  })

  if (cargandoSesion) return <Cargando />
  if (!sesion || !token) return <Navigate to="/entrar" replace />

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8">
      <div>
        <Link to="/cuenta" className="text-sm font-bold text-green underline">
          ← Mi cuenta
        </Link>
        <h1 className="mt-1 text-2xl font-black">Mis pedidos</h1>
        <p className="mt-1 text-muted">Sigue cada pedido paso a paso. Pagas cuando lo recibes.</p>
      </div>
      {apartados.isPending ? (
        <Cargando />
      ) : apartados.isError ? (
        <p role="alert" className="font-bold">
          {apartados.error.message}
        </p>
      ) : apartados.data.length === 0 ? (
        <div className="tarjeta p-6 text-center">
          <ShoppingBasket className="mx-auto size-9 text-muted" strokeWidth={1.5} aria-hidden="true" />
          <p className="mt-2 font-bold">Todavía no has hecho pedidos</p>
          <p className="mt-1 text-sm text-muted">En el perfil de cada negocio verás su catálogo para pedir.</p>
          <Link to="/" className="mt-3 inline-block font-bold text-green underline">
            Ir al mapa
          </Link>
        </div>
      ) : (
        <>
          {[
            { titulo: 'En curso', lista: apartados.data.filter(abierto) },
            { titulo: 'Anteriores', lista: apartados.data.filter((a) => !abierto(a)) },
          ]
            .filter((g) => g.lista.length)
            .map((g) => (
              <div key={g.titulo} className="flex flex-col gap-3">
                <h2 className="font-mono text-xs tracking-wider text-muted uppercase">{g.titulo}</h2>
                <ul className="flex flex-col gap-3">
                  {g.lista.map((a) => (
                    <MiApartado key={a.id} a={a} token={token} />
                  ))}
                </ul>
              </div>
            ))}
        </>
      )}
    </section>
  )
}

const abierto = (a: Apartado) => a.estado !== 'entregado' && a.estado !== 'cancelado'

function MiApartado({ a, token }: { a: Apartado; token: string }) {
  const queryClient = useQueryClient()
  const cancelar = useMutation({
    mutationFn: () => apiEnviar<Apartado>('POST', `/mis-apartados/${a.id}/cancelar`, {}, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mis-apartados'] }),
  })
  return (
    <TarjetaApartado
      a={a}
      titulo={
        <Link to={`/n/${a.negocio.slug}`} className="underline">
          {a.negocio.nombre}
        </Link>
      }
      acciones={
        abierto(a) && (
          <>
            {a.negocio.whatsapp && (
              <a
                href={enlaceWhatsappTexto(a.negocio.whatsapp, mensajeApartado(a))}
                target="_blank"
                rel="noopener noreferrer"
                className="tap inline-flex items-center rounded-caja bg-green px-4 font-bold text-green-ink"
              >
                <MessageCircle className="mr-1.5 size-4" aria-hidden="true" /> Escribirle
              </a>
            )}
            {a.estado === 'pendiente' && (
            <button
              type="button"
              disabled={cancelar.isPending}
              onClick={() => cancelar.mutate()}
              className="tap rounded-caja border border-line px-4 font-bold text-red disabled:opacity-50"
            >
              Cancelar pedido
            </button>
            )}
            {cancelar.isError && (
              <p role="alert" className="w-full text-sm font-bold text-red">
                {cancelar.error.message}
              </p>
            )}
          </>
        )
      }
    />
  )
}
