import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, NavLink, Outlet, useOutletContext } from 'react-router'
import { apiEnviar, apiGet } from '../../lib/api'
import { usePerfil } from '../../lib/sesion'
import { Cargando } from '../Cuenta'

const SECCIONES = [
  { ruta: 'metricas', texto: 'Gate' },
  { ruta: 'negocios', texto: 'Negocios' },
  { ruta: 'lista-espera', texto: 'Lista de espera' },
  { ruta: 'reportes', texto: 'Reportes' },
]

/** Panel de administración (SPEC §6.5). Solo rol `admin`; el API lo vuelve a verificar. */
export function Admin() {
  const { sesion, token, cargandoSesion, perfil } = usePerfil()
  if (cargandoSesion || (sesion && perfil.isPending)) return <Cargando />
  if (!sesion) return <Navigate to="/entrar" replace />
  if (!perfil.data?.roles.includes('admin')) {
    return (
      <section className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Esta parte es solo para el equipo</h1>
        <p className="mt-2 text-muted">Tu cuenta no tiene permiso de administración.</p>
      </section>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-black">Administración</h1>
      <nav className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4" aria-label="Secciones del panel">
        {SECCIONES.map((s) => (
          <NavLink
            key={s.ruta}
            to={s.ruta}
            className={({ isActive }) =>
              `tap flex shrink-0 items-center rounded-caja px-4 text-sm font-bold ${isActive ? 'bg-green text-green-ink' : 'border border-line bg-surface'}`
            }
          >
            {s.texto}
          </NavLink>
        ))}
      </nav>
      <div className="mt-6">
        <Outlet context={token} />
      </div>
    </div>
  )
}

export function useToken() {
  return useOutletContext<string | undefined>()
}

/** GET del panel con la sesión del admin. */
export function useAdminQuery<T>(ruta: string) {
  const token = useToken()
  return useQuery({
    queryKey: ['admin', ruta],
    queryFn: () => apiGet<T>(`/admin${ruta}`, undefined, token),
    enabled: Boolean(token),
  })
}

/** POST/PATCH del panel; al terminar refresca todo lo del admin. */
export function useAdminMutation<V>(metodo: 'POST' | 'PATCH', ruta: (v: V) => string, cuerpo: (v: V) => unknown) {
  const token = useToken()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: V) => apiEnviar<unknown>(metodo, `/admin${ruta(v)}`, cuerpo(v), token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function Filtro<T extends string>({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string
  valor: T
  opciones: { valor: T; texto: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-1">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={`min-h-9 rounded-full px-3 text-sm font-bold ${
            valor === o.valor ? 'bg-ink text-bg' : 'border border-line bg-surface'
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  )
}

export function Estado({ cargando, error, vacio, children }: { cargando: boolean; error: Error | null; vacio: boolean; children: React.ReactNode }) {
  if (cargando) return <p className="text-muted">Cargando…</p>
  if (error) return <p role="alert" className="font-bold text-red">{error.message}</p>
  if (vacio) return <p className="text-muted">No hay nada por aquí.</p>
  return <>{children}</>
}

export function fecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })
}
