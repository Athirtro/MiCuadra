import { lazy, Suspense, useEffect } from 'react'
import { Link, Navigate, NavLink, Route, Routes } from 'react-router'
import { registrarSesion } from './lib/eventos'
import { usePerfil } from './lib/sesion'
import { authDisponible } from './lib/supabase'
import { Bienvenida } from './pages/Bienvenida'
import { Conoce } from './pages/Conoce'
import { Cuenta } from './pages/Cuenta'
import { Entrar } from './pages/Entrar'
import { FotosNegocio } from './pages/FotosNegocio'
import { Mapa } from './pages/Mapa'
import { Perfil } from './pages/Perfil'
import { Privacidad } from './pages/Privacidad'
import { RegistrarNegocio } from './pages/RegistrarNegocio'

// El panel de administración va en su propio paquete: los vecinos nunca lo descargan.
const Admin = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.Admin })))
const Metricas = lazy(() => import('./pages/admin/Metricas').then((m) => ({ default: m.Metricas })))
const NegociosAdmin = lazy(() => import('./pages/admin/Negocios').then((m) => ({ default: m.Negocios })))
const ListaEsperaAdmin = lazy(() => import('./pages/admin/ListaEspera').then((m) => ({ default: m.ListaEsperaAdmin })))
const Reportes = lazy(() => import('./pages/admin/Reportes').then((m) => ({ default: m.Reportes })))

export function App() {
  useEffect(registrarSesion, [])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-[1100] border-b border-line bg-surface/90 backdrop-blur-md">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="tap flex items-center gap-2 font-display text-xl font-black">
            <img src="/icono.svg" alt="" width={28} height={28} />
            MiCuadra
          </Link>
          <div className="flex items-center gap-1">
            <NavLink
              to="/conoce"
              className={({ isActive }) => `tap hidden items-center px-2 text-sm font-bold sm:flex ${isActive ? 'text-green' : 'text-muted'}`}
            >
              Conoce MiCuadra
            </NavLink>
            {authDisponible && <BotonCuenta />}
          </div>
        </nav>
      </header>
      <main className="flex-1">
        <Suspense fallback={<p className="p-4 text-muted">Cargando…</p>}>
        <Routes>
          <Route path="/" element={<Mapa />} />
          <Route path="/n/:slug" element={<Perfil />} />
          <Route path="/conoce" element={<Conoce />} />
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/cuenta" element={<Cuenta />} />
          <Route path="/bienvenida" element={<Bienvenida />} />
          <Route path="/mi-negocio/nuevo" element={<RegistrarNegocio />} />
            <Route path="/mi-negocio/:id/fotos" element={<FotosNegocio />} />
          <Route path="/privacidad" element={<Privacidad />} />
          <Route path="/admin" element={<Admin />}>
            <Route index element={<Navigate to="metricas" replace />} />
            <Route path="metricas" element={<Metricas />} />
            <Route path="negocios" element={<NegociosAdmin />} />
            <Route path="lista-espera" element={<ListaEsperaAdmin />} />
            <Route path="reportes" element={<Reportes />} />
          </Route>
          <Route path="*" element={<NoEncontrado />} />
        </Routes>
        </Suspense>
      </main>
    </div>
  )
}

function BotonCuenta() {
  const { sesion, cargandoSesion, perfil } = usePerfil()
  if (cargandoSesion) return null
  if (!sesion) {
    return (
      <Link to="/entrar" className="tap flex items-center rounded-r bg-green px-4 text-sm font-bold text-green-ink">
        Entrar
      </Link>
    )
  }
  const foto = perfil.data?.foto_url
  const inicial = (perfil.data?.nombre ?? sesion.user.email ?? '?').charAt(0).toUpperCase()
  return (
    <Link to="/cuenta" className="tap flex items-center gap-2 px-1 text-sm font-bold" aria-label="Mi cuenta">
      {foto ? (
        <img src={foto} alt="" width={32} height={32} className="size-8 rounded-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="grid size-8 place-items-center rounded-full bg-green text-green-ink" aria-hidden="true">
          {inicial}
        </span>
      )}
      <span className="hidden sm:inline">Mi cuenta</span>
    </Link>
  )
}

function NoEncontrado() {
  return (
    <section className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-3xl font-black">Esta cuadra no existe</h1>
      <p className="mt-2 text-muted">La página que buscas no está en el mapa.</p>
      <Link to="/" className="tap mt-6 inline-flex items-center rounded-r bg-green px-5 font-bold text-green-ink">
        Volver al mapa
      </Link>
    </section>
  )
}
