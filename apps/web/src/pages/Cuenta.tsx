import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { apiGet, type MiNegocio } from '../lib/api'
import { usePerfil, useSesion } from '../lib/sesion'
import { guardarTema, leerTema, type Tema } from '../lib/tema'
import { leerVolver, olvidarVolver } from '../lib/volver'

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
        <button type="button" onClick={() => perfil.refetch()} className="tap mt-3 rounded-caja border border-line px-4 font-bold">
          Reintentar
        </button>
      </section>
    )
  }
  const p = perfil.data
  if (!p) return <Cargando />
  if (!p.perfil_completo) return <Navigate to="/bienvenida" replace />
  // Venía de apartar sin cuenta: vuelve al perfil con su carrito.
  const volver = leerVolver()
  if (volver) return <Volver a={volver} />

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
              <li key={n.id} className="tarjeta p-4">
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
                {n.apartados_pendientes > 0 && (
                  <Link
                    to={`/mi-negocio/${n.id}/apartados`}
                    className="mt-2 flex items-center justify-between rounded-lg bg-sun px-3 py-2 text-sm font-bold text-sun-ink"
                  >
                    🛒 {n.apartados_pendientes} {n.apartados_pendientes === 1 ? 'apartado' : 'apartados'} por confirmar
                    <span aria-hidden="true">›</span>
                  </Link>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-green">
                  <Link to={`/mi-negocio/${n.id}/estadisticas`} className="underline">
                    📊 Estadísticas
                  </Link>
                  <Link to={`/mi-negocio/${n.id}/catalogo`} className="underline">
                    Catálogo
                  </Link>
                  <Link to={`/mi-negocio/${n.id}/apartados`} className="underline">
                    Apartados
                  </Link>
                  <Link to={`/mi-negocio/${n.id}/fotos`} className="underline">
                    Fotos
                  </Link>
                  {n.estado === 'activo' && (
                    <Link to={`/n/${n.slug}`} className="underline">
                      Ver mi perfil público
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Link
            to="/mi-negocio/nuevo"
            className="tap flex items-center justify-center rounded-caja bg-green px-4 font-bold text-green-ink"
          >
            {negocios.data?.length ? 'Registrar otro negocio' : 'Registrar mi negocio'}
          </Link>
        </div>
      ) : (
        <div className="tarjeta p-4">
          <p className="font-bold">¿Tienes un negocio en el barrio?</p>
          <p className="mt-1 text-sm text-muted">Aparecer en el mapa es gratis, siempre.</p>
          <Link to="/mi-negocio/nuevo" className="mt-3 inline-block font-bold text-green underline">
            Registrar mi negocio
          </Link>
        </div>
      )}

      <Link to="/mis-apartados" className="tarjeta flex items-center justify-between p-4 font-bold">
        <span>🛒 Mis apartados</span>
        <span aria-hidden="true" className="text-muted">
          ›
        </span>
      </Link>

      {p.roles.includes('admin') && (
        <Link to="/admin" className="tap flex items-center justify-center rounded-caja bg-ink px-4 font-bold text-bg">
          Panel de administración
        </Link>
      )}

      <Apariencia />

      <div className="flex flex-wrap gap-2">
        <Link to="/" className="tap inline-flex items-center rounded-caja border border-line px-4 font-bold">
          Ir al mapa
        </Link>
        <button type="button" onClick={() => void salir()} className="tap rounded-caja border border-line px-4 font-bold">
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

/** Vuelve a la página guardada antes de entrar y la olvida. */
function Volver({ a }: { a: string }) {
  useEffect(olvidarVolver, [])
  return <Navigate to={a} replace />
}

const TEMAS: { valor: Tema; texto: string }[] = [
  { valor: 'claro', texto: '☀️ Claro' },
  { valor: 'oscuro', texto: '🌙 Oscuro' },
  { valor: 'auto', texto: 'Como el celular' },
]

function Apariencia() {
  const [tema, setTema] = useState<Tema>(leerTema)
  return (
    <div className="flex flex-col gap-2">
      <h2 id="titulo-apariencia" className="text-lg font-black">
        Apariencia
      </h2>
      <div className="grid grid-cols-3 gap-1 rounded-caja bg-block p-1" role="radiogroup" aria-labelledby="titulo-apariencia">
        {TEMAS.map((t) => (
          <button
            key={t.valor}
            type="button"
            role="radio"
            aria-checked={tema === t.valor}
            onClick={() => {
              guardarTema(t.valor)
              setTema(t.valor)
            }}
            className={`tap rounded-[10px] text-sm font-bold ${tema === t.valor ? 'bg-surface shadow-1' : 'text-muted'}`}
          >
            {t.texto}
          </button>
        ))}
      </div>
    </div>
  )
}
