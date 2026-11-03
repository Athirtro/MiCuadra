import { useQuery } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router'
import { apiGet, type MiNegocio } from '../lib/api'
import { usePerfil, useSesion } from '../lib/sesion'

const ESTADOS: Record<MiNegocio['estado'], { texto: string; clase: string }> = {
  pendiente: { texto: 'En revisión', clase: 'bg-sun text-sun-ink' },
  activo: { texto: 'Publicado en el mapa', clase: 'bg-green text-green-ink' },
  rechazado: { texto: 'No aprobado', clase: 'bg-red text-white' },
  inactivo: { texto: 'Pausado', clase: 'bg-block text-muted' },
  borrador: { texto: 'Borrador', clase: 'bg-block text-muted' },
}

/** Aquí vuelve el usuario después de entrar: decide si falta el formulario de bienvenida. */
export function Cuenta() {
  const { salir } = useSesion()
  const { sesion, token, cargandoSesion, perfil } = usePerfil()
  const esDueno = perfil.data?.roles.some((r) => r === 'dueno' || r === 'admin') ?? false
  const negocios = useQuery({
    queryKey: ['mis-negocios', sesion?.user.id],
    queryFn: () => apiGet<MiNegocio[]>('/mis-negocios', undefined, token),
    enabled: Boolean(token) && esDueno,
  })

  if (cargandoSesion || (sesion && perfil.isPending)) return <Cargando />
  if (!sesion) return <Navigate to="/entrar" replace />
  if (perfil.isError) {
    return (
      <section className="mx-auto max-w-md px-4 py-10">
        <p className="font-bold">No pudimos cargar tu cuenta.</p>
        <p className="text-sm text-muted">{perfil.error.message}</p>
        <button type="button" onClick={() => perfil.refetch()} className="tap mt-3 rounded-r border border-line px-4 font-bold">
          Reintentar
        </button>
      </section>
    )
  }
  const p = perfil.data
  if (!p) return <Cargando />
  if (!p.perfil_completo) return <Navigate to="/bienvenida" replace />

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex items-center gap-4">
        {p.foto_url ? (
          <img src={p.foto_url} alt="" className="size-16 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid size-16 place-items-center rounded-full bg-block text-2xl font-black" aria-hidden="true">
            {(p.nombre ?? '?').charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black">Hola, {p.nombre?.split(' ')[0] ?? 'vecino'}</h1>
          <p className="truncate text-sm text-muted">{p.email}</p>
          <p className="text-sm text-muted">
            {esDueno ? 'Empresario' : 'Vecino'}
            {p.barrio && ` · ${p.barrio.nombre}`}
          </p>
        </div>
      </div>

      {esDueno ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-black">Mis negocios</h2>
          {negocios.isPending && <p className="text-muted">Cargando…</p>}
          {negocios.data?.length === 0 && <p className="text-muted">Todavía no has registrado tu negocio.</p>}
          <ul className="flex flex-col gap-2">
            {negocios.data?.map((n) => (
              <li key={n.id} className="rounded-r border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold">{n.nombre}</p>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${ESTADOS[n.estado].clase}`}>
                    {ESTADOS[n.estado].texto}
                  </span>
                </div>
                {n.barrio && <p className="text-sm text-muted">{n.barrio.nombre}</p>}
                {n.estado === 'pendiente' && (
                  <p className="mt-2 text-sm">El equipo de MiCuadra lo revisa y te avisamos cuando esté en el mapa.</p>
                )}
                {n.estado === 'rechazado' && n.motivo_rechazo && (
                  <p className="mt-2 text-sm">Motivo: {n.motivo_rechazo}</p>
                )}
                {n.estado === 'activo' && (
                  <Link to={`/n/${n.slug}`} className="mt-2 inline-block text-sm font-bold text-green underline">
                    Ver mi perfil público
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <Link
            to="/mi-negocio/nuevo"
            className="tap flex items-center justify-center rounded-r bg-green px-4 font-bold text-green-ink"
          >
            {negocios.data?.length ? 'Registrar otro negocio' : 'Registrar mi negocio'}
          </Link>
        </div>
      ) : (
        <div className="rounded-r border border-line bg-surface p-4">
          <p className="font-bold">¿Tienes un negocio en el barrio?</p>
          <p className="mt-1 text-sm text-muted">Aparecer en el mapa es gratis, siempre.</p>
          <Link to="/mi-negocio/nuevo" className="mt-3 inline-block font-bold text-green underline">
            Registrar mi negocio
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link to="/" className="tap inline-flex items-center rounded-r border border-line px-4 font-bold">
          Ir al mapa
        </Link>
        <button type="button" onClick={() => void salir()} className="tap rounded-r border border-line px-4 font-bold">
          Salir
        </button>
      </div>
    </section>
  )
}

export function Cargando() {
  return (
    <p role="status" className="mx-auto max-w-md px-4 py-10 text-muted">
      Cargando…
    </p>
  )
}
