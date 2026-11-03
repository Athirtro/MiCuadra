import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

function renderEn(ruta: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[ruta]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('App', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('muestra el inicio y el estado del API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ estado: 'ok', entorno: 'dev', version: '0.1.0', db: 'ok', postgis: '3.6' })),
      ),
    )
    renderEn('/')
    expect(screen.getByRole('heading', { name: 'El mapa vivo de tu cuadra' })).toBeInTheDocument()
    expect(await screen.findByText(/API conectado \(dev, PostGIS 3.6\)/)).toBeInTheDocument()
  })

  it('avisa cuando el API no responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('sin red')))
    renderEn('/')
    expect(await screen.findByText('El API no responde todavía.')).toBeInTheDocument()
  })

  it('tiene página 404 en español', () => {
    renderEn('/no-existe')
    expect(screen.getByRole('heading', { name: 'Esta cuadra no existe' })).toBeInTheDocument()
  })
})
