import { Link, Route, Routes } from 'react-router-dom'
import { Inicio } from './pages/Inicio'

export function App() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-4">
          <Link to="/" className="tap flex items-center gap-2 font-display text-xl font-black">
            <img src="/icono.svg" alt="" width={28} height={28} />
            MiCuadra
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Inicio />} />
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
        Volver al inicio
      </Link>
    </section>
  )
}
