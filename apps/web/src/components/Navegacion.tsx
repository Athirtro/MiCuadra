import type { ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { useSesion } from '../lib/sesion'
import { authDisponible } from '../lib/supabase'

/** Pantallas principales: llevan el menú inferior en el celular y no muestran "volver". */
const PRINCIPALES = ['/', '/mis-apartados', '/conoce', '/cuenta', '/entrar']

function esPrincipal(ruta: string): boolean {
  return PRINCIPALES.includes(ruta)
}

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function Icono({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...trazo}>
      {children}
    </svg>
  )
}

const ICONOS = {
  mapa: (
    <Icono>
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5V4l-6 2.5L9 4Z" />
      <path d="M9 4v13M15 6.5v13" />
    </Icono>
  ),
  apartados: (
    <Icono>
      <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6" />
      <circle cx="9.5" cy="20" r="1.2" />
      <circle cx="17" cy="20" r="1.2" />
    </Icono>
  ),
  conoce: (
    <Icono>
      <path d="M12 3.5 14.4 9l5.6.5-4.3 3.7 1.3 5.6L12 15.9l-5 2.9 1.3-5.6L4 9.5 9.6 9 12 3.5Z" />
    </Icono>
  ),
  cuenta: (
    <Icono>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c1.3-3.4 4.2-5 7.5-5s6.2 1.6 7.5 5" />
    </Icono>
  ),
}

/**
 * Menú inferior del celular, al alcance del pulgar. Solo en las pantallas principales: en el
 * perfil de un negocio la barra de abajo es para WhatsApp y el carrito.
 */
export function NavInferior() {
  const { pathname } = useLocation()
  const { sesion } = useSesion()
  if (!esPrincipal(pathname)) return null

  const items = [
    { a: '/', texto: 'Mapa', icono: ICONOS.mapa },
    { a: '/mis-apartados', texto: 'Apartados', icono: ICONOS.apartados },
    { a: '/conoce', texto: 'Conoce', icono: ICONOS.conoce },
    ...(authDisponible ? [{ a: sesion ? '/cuenta' : '/entrar', texto: sesion ? 'Mi cuenta' : 'Entrar', icono: ICONOS.cuenta }] : []),
  ]

  return (
    <nav
      aria-label="Menú principal"
      className="nav-inferior barra-inferior fixed inset-x-0 bottom-0 z-[1100] border-t border-line bg-surface/95 pt-1.5 backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {items.map((i) => (
          <li key={i.a} className="flex-1">
            <NavLink
              to={i.a}
              end
              className={({ isActive }) =>
                `tap flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${isActive ? 'text-green' : 'text-muted'}`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`grid h-7 w-14 place-items-center rounded-full ${isActive ? 'bg-green/15' : ''}`}>{i.icono}</span>
                  {i.texto}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** "Volver" en las páginas internas: a la anterior si se llegó navegando, si no al mapa. */
export function BotonVolver() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  if (esPrincipal(pathname)) return null
  return (
    <button
      type="button"
      onClick={() => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/'))}
      aria-label="Volver"
      className="tap -ml-2 grid place-items-center rounded-full text-ink"
    >
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" {...trazo} strokeWidth={2.4}>
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  )
}
