import { useEffect } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router'
import { registrarSesion } from './lib/eventos'
import { Conoce } from './pages/Conoce'
import { Mapa } from './pages/Mapa'
import { Perfil } from './pages/Perfil'

export function App() {
  useEffect(registrarSesion, [])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-[1100] border-b border-line bg-surface">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="tap flex items-center gap-2 font-display text-xl font-black">
            <img src="/icono.svg" alt="" width={28} height={28} />
            MiCuadra
          </Link>
          <NavLink
            to="/conoce"
            className={({ isActive }) => `tap flex items-center px-2 text-sm font-bold ${isActive ? 'text-green' : 'text-muted'}`}
          >
            Conoce MiCuadra
          </NavLink>
        </nav>
      </header>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Mapa />} />
          <Route path="/n/:slug" element={<Perfil />} />
          <Route path="/conoce" element={<Conoce />} />
          <Route path="*" element={<NoEncontrado />} />
        </Routes>
      </main>
    </div>
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
