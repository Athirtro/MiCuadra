import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router'
import { TarjetaApartado } from '../components/TarjetaApartado'
import { mensajeApartado } from '../lib/apartado'
import { apiEnviar, apiGet, type Apartado } from '../lib/api'
import { enlaceWhatsappTexto } from '../lib/negocio'
import { usePerfil } from '../lib/sesion'
import { Cargando } from './Cuenta'

/** Lo que el vecino ha apartado, con su estado y la opción de cancelar mientras no lo recoja. */
export function MisApartados() {
  const { sesion, token, cargandoSesion } = usePerfil()
  const apartados = useQuery({
    queryKey: ['mis-apartados', sesion?.user.id],
    queryFn: () => apiGet<Apartado[]>('/mis-apartados', undefined, token),
    enabled: Boolean(token),
    refetchInterval: 60_000,
  })

  if (cargandoSesion) return <Cargando />
  if (!sesion || !token) return <Navigate to="/entrar" replace />

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8">
      <div>
        <Link to="/cuenta" className="text-sm font-bold text-green underline">
          ← Mi cuenta
        </Link>
        <h1 className="mt-1 text-2xl font-black">Mis apartados</h1>
        <p className="mt-1 text-muted">Lo que separaste en los negocios del barrio. Pagas al recoger.</p>
      </div>
      {apartados.isPending ? (
        <Cargando />
      ) : apartados.isError ? (
        <p role="alert" className="font-bold">
          {apartados.error.message}
        </p>
      ) : apartados.data.length === 0 ? (
        <div className="tarjeta p-6 text-center">
          <p className="text-3xl" aria-hidden="true">
            🛒
          </p>
          <p className="mt-2 font-bold">Todavía no has apartado nada</p>
          <p className="mt-1 text-sm text-muted">En el perfil de cada negocio verás su catálogo.</p>
          <Link to="/" className="mt-3 inline-block font-bold text-green underline">
            Ir al mapa
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {apartados.data.map((a) => (
            <MiApartado key={a.id} a={a} token={token} />
          ))}
        </ul>
      )}
    </section>
  )
}

function MiApartado({ a, token }: { a: Apartado; token: string }) {
  const queryClient = useQueryClient()
  const cancelar = useMutation({
    mutationFn: () => apiEnviar<Apartado>('POST', `/mis-apartados/${a.id}/cancelar`, {}, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mis-apartados'] }),
  })
  const abierto = a.estado !== 'entregado' && a.estado !== 'cancelado'
  return (
    <TarjetaApartado
      a={a}
      titulo={
        <Link to={`/n/${a.negocio.slug}`} className="underline">
          {a.negocio.nombre}
        </Link>
      }
      acciones={
        abierto && (
          <>
            {a.negocio.whatsapp && (
              <a
                href={enlaceWhatsappTexto(a.negocio.whatsapp, mensajeApartado(a))}
                target="_blank"
                rel="noopener noreferrer"
                className="tap inline-flex items-center rounded-caja bg-green px-4 font-bold text-green-ink"
              >
                💬 Escribirle
              </a>
            )}
            <button
              type="button"
              disabled={cancelar.isPending}
              onClick={() => cancelar.mutate()}
              className="tap rounded-caja border border-line px-4 font-bold text-red disabled:opacity-50"
            >
              Cancelar
            </button>
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
