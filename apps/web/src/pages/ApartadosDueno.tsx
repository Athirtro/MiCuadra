import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { TarjetaApartado } from '../components/TarjetaApartado'
import { apiEnviar, apiGet, type Apartado, type CambioEstadoApartado, type MiNegocio } from '../lib/api'
import { enlaceWhatsappTexto } from '../lib/negocio'
import { usePerfil } from '../lib/sesion'
import { Cargando } from './Cuenta'

type Filtro = 'abiertos' | 'entregado' | 'cancelado'

const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: 'abiertos', texto: 'Por atender' },
  { valor: 'entregado', texto: 'Entregados' },
  { valor: 'cancelado', texto: 'Cancelados' },
]

// El siguiente paso natural de cada estado, con el texto del botón.
const SIGUIENTE: Partial<Record<Apartado['estado'], { estado: CambioEstadoApartado['estado']; texto: string }>> = {
  pendiente: { estado: 'confirmado', texto: 'Confirmar' },
  confirmado: { estado: 'listo', texto: 'Ya está listo' },
  listo: { estado: 'entregado', texto: 'Entregado' },
}

/** Apartados que recibió el negocio: confirmar (descuenta inventario), avisar que está listo, entregar. */
export function ApartadosDueno() {
  const { id = '' } = useParams()
  const { sesion, token, cargandoSesion } = usePerfil()
  const [filtro, setFiltro] = useState<Filtro>('abiertos')

  const negocios = useQuery({
    queryKey: ['mis-negocios', sesion?.user.id],
    queryFn: () => apiGet<MiNegocio[]>('/mis-negocios', undefined, token),
    enabled: Boolean(token),
  })
  const apartados = useQuery({
    queryKey: ['apartados-negocio', id, filtro],
    queryFn: () => apiGet<Apartado[]>(`/mis-negocios/${id}/apartados?estado=${filtro}`, undefined, token),
    enabled: Boolean(token),
    refetchInterval: 60_000,
  })

  if (cargandoSesion) return <Cargando />
  if (!sesion || !token) return <Navigate to="/entrar" replace />
  const negocio = negocios.data?.find((n) => n.id === id)

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8">
      <div>
        <Link to="/cuenta" className="text-sm font-bold text-green underline">
          ← Mi cuenta
        </Link>
        <h1 className="mt-1 text-2xl font-black">Apartados de {negocio?.nombre ?? 'tu negocio'}</h1>
        <p className="mt-1 text-muted">
          Confirma lo que puedas preparar: al confirmar se descuenta del inventario. El vecino paga al recoger.
        </p>
        <Link to={`/mi-negocio/${id}/catalogo`} className="mt-2 inline-block font-bold text-green underline">
          Editar mi catálogo
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-caja bg-block p-1" role="tablist" aria-label="Filtrar apartados">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            role="tab"
            aria-selected={filtro === f.valor}
            onClick={() => setFiltro(f.valor)}
            className={`tap rounded-[10px] text-sm font-bold ${filtro === f.valor ? 'bg-surface shadow-1' : 'text-muted'}`}
          >
            {f.texto}
          </button>
        ))}
      </div>

      {apartados.isPending ? (
        <Cargando />
      ) : apartados.isError ? (
        <p role="alert" className="font-bold">
          {apartados.error.message}
        </p>
      ) : apartados.data.length === 0 ? (
        <p className="py-6 text-center text-muted">
          {filtro === 'abiertos' ? 'No tienes apartados por atender.' : 'Nada por aquí todavía.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {apartados.data.map((a) => (
            <ApartadoDelNegocio key={a.id} a={a} negocioId={id} token={token} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ApartadoDelNegocio({ a, negocioId, token }: { a: Apartado; negocioId: string; token: string }) {
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
  const siguiente = SIGUIENTE[a.estado]
  const vecino = a.vecino?.nombre?.split(' ')[0] ?? 'Vecino'
  const avisoListo = `Hola, ${vecino}. Tu apartado ${a.codigo} en ${a.negocio.nombre} ya está listo para recoger 🙌`

  return (
    <TarjetaApartado
      a={a}
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
                placeholder="Se acabó el pan, no vino a recogerlo…"
                className="tap rounded-caja border border-line bg-bg px-3 text-base font-normal"
              />
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={cambiar.isPending} className="tap rounded-caja bg-red px-4 font-bold text-white">
                Cancelar apartado
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
        ) : siguiente ? (
          <>
            <button
              type="button"
              disabled={cambiar.isPending}
              onClick={() => cambiar.mutate({ estado: siguiente.estado })}
              className="tap rounded-caja bg-green px-4 font-bold text-green-ink disabled:opacity-50"
            >
              {siguiente.texto}
            </button>
            {a.vecino?.celular && (
              <a
                href={enlaceWhatsappTexto(a.vecino.celular, a.estado === 'pendiente' ? `Hola, ${vecino}. Vi tu apartado ${a.codigo} en ${a.negocio.nombre}.` : avisoListo)}
                target="_blank"
                rel="noopener noreferrer"
                className="tap inline-flex items-center rounded-caja border border-line px-4 font-bold"
              >
                💬 {a.estado === 'listo' || a.estado === 'confirmado' ? 'Avisar que está listo' : 'Escribirle'}
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
