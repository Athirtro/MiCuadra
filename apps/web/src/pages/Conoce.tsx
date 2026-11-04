import { useQuery } from '@tanstack/react-query'
import { useEffect, type CSSProperties } from 'react'
import { useLocation } from 'react-router'
import { InstalarApp } from '../components/InstalarApp'
import { BarraMetas, ListaEspera } from '../components/ListaEspera'
import { apiGet, type Barrio, type Health } from '../lib/api'

/** "Conoce MiCuadra": qué es, instalar la app, metas y lista de espera (SPEC §6.1). */
export function Conoce() {
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#lista') document.getElementById('lista')?.scrollIntoView?.({ block: 'start' })
  }, [hash])

  return (
    <section className="escalonado mx-auto flex max-w-xl flex-col gap-6 px-4 py-10">
      <div className="tarjeta p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Pereira · Conoce MiCuadra</p>
        <h1 className="mt-2 text-4xl font-black leading-none">El mapa vivo de tu cuadra</h1>
        <p className="mt-3 text-muted">
          Encuentra en segundos los negocios de tu barrio — y si no puedes salir, un vecino va por
          ti.
        </p>
        <BarriosVivos />
        <p className="mt-5 text-sm">
          Cada tienda, panadería, barbería o droguería que se suma pone su barrio en el mapa. Instala
          la app para tenerla a mano y entra a la lista de espera de los mandados.
        </p>
        <div className="mt-5">
          <InstalarApp />
        </div>
      </div>

      <div className="empty:hidden" style={{ '--i': 1 } as CSSProperties}>
        <BarraMetas />
      </div>

      <div id="lista" className="scroll-mt-20" style={{ '--i': 2 } as CSSProperties}>
        <ListaEspera />
      </div>

      {import.meta.env.DEV && <EstadoApi />}
    </section>
  )
}

/** Los barrios que ya tienen negocios, del más poblado al menos: la lista crece con el mapa. */
function BarriosVivos() {
  const barrios = useQuery({ queryKey: ['barrios'], queryFn: () => apiGet<Barrio[]>('/barrios'), staleTime: Infinity })
  const primeros = barrios.data?.slice(0, 4) ?? []
  if (!primeros.length) return null
  return (
    <ul className="mt-5 grid grid-cols-4 gap-1" aria-label="Barrios con más negocios">
      {primeros.map((b, i) => (
        <li
          key={b.slug}
          className={`flex aspect-square flex-col justify-end rounded-md p-1.5 font-mono text-[10px] leading-tight ${
            i === 0 ? 'bg-sun text-sun-ink' : 'bg-block text-muted'
          }`}
        >
          <span className="truncate">{b.nombre}</span>
          <span className="opacity-70">{b.negocios}</span>
        </li>
      ))}
    </ul>
  )
}

/** Solo en desarrollo: confirma que la web llega al API y a PostGIS. */
function EstadoApi() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<Health>('/health'),
    retry: false,
  })

  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <span
        className={`inline-block size-2.5 rounded-full ${
          health.isSuccess ? 'bg-green' : health.isError ? 'bg-red' : 'bg-line'
        }`}
      />
      {health.isPending && 'Conectando con el API…'}
      {health.isSuccess && `API conectado (${health.data.entorno}, PostGIS ${health.data.postgis})`}
      {health.isError && 'El API no responde todavía.'}
    </p>
  )
}
