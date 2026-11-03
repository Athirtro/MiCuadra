import { useQuery } from '@tanstack/react-query'
import { InstalarApp } from '../components/InstalarApp'
import { apiGet, type Health } from '../lib/api'

/** "Conoce MiCuadra": qué es, instalar la app y (pronto) la lista de espera. */
export function Conoce() {
  return (
    <section id="lista" className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10">
      <div className="rounded-r border border-line bg-surface p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Pereira · Conoce MiCuadra</p>
        <h1 className="mt-2 text-4xl font-black leading-none">El mapa vivo de tu cuadra</h1>
        <p className="mt-3 text-muted">
          Encuentra en segundos los negocios de tu barrio — y si no puedes salir, un vecino va por
          ti.
        </p>
        <div className="mt-5 grid grid-cols-4 gap-1" aria-hidden="true">
          {['Cuba', 'Álamos', 'Boston', 'El Jardín'].map((barrio, i) => (
            <div
              key={barrio}
              className={`flex aspect-square items-end rounded-md p-1.5 font-mono text-[10px] ${
                i === 1 ? 'bg-sun text-sun-ink' : 'bg-block text-muted'
              }`}
            >
              {barrio}
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm">
          Estamos cargando las tiendas, panaderías, barberías y droguerías de Cuba, Álamos, Boston
          y El Jardín. Instala la app para tenerla a mano. Muy pronto podrás inscribirte aquí en la lista de espera de mandados.
        </p>
        <div className="mt-5">
          <InstalarApp />
        </div>
      </div>

      {import.meta.env.DEV && <EstadoApi />}
    </section>
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
