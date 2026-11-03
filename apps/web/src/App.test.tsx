import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { apiFalsa, BARRIOS, CATEGORIAS, DETALLE, gpsNegado, LISTA } from './test/fixtures'

function renderEn(ruta: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[ruta]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('Mapa del barrio (/)', () => {
  it('sin GPS pide el barrio y muestra los negocios cercanos con distancia en cuadras', async () => {
    gpsNegado()
    const { fetchFalso } = apiFalsa({ '/categorias': CATEGORIAS, '/barrios': BARRIOS, '/negocios': LISTA })
    renderEn('/')

    fireEvent.click(await screen.findByRole('button', { name: 'Cuba' }))

    expect(await screen.findByText('Panadería El Trigal')).toBeInTheDocument()
    expect(screen.getByText('Panadería · 1 cuadra · 120 m')).toBeInTheDocument()
    expect(screen.getByText('Destacado')).toBeInTheDocument()
    expect(screen.getByText('Abierto ahora', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Cerrado')).toBeInTheDocument()
    expect(screen.getByTestId('mapa')).toHaveTextContent('2 pines')
    const consulta = fetchFalso.mock.calls.map(([url]) => url).find((u) => u.includes('/negocios?'))
    expect(consulta).toContain('lat=4.798000')
    expect(consulta).toContain('radio_m=1000')
  })

  it('recuerda el barrio elegido en la siguiente visita', async () => {
    gpsNegado()
    localStorage.setItem('micuadra.barrio', 'alamos')
    const { fetchFalso } = apiFalsa({ '/categorias': CATEGORIAS, '/barrios': BARRIOS, '/negocios': LISTA })
    renderEn('/')
    await screen.findByText('Panadería El Trigal')
    expect(fetchFalso.mock.calls.some(([url]) => url.includes('lat=4.800000'))).toBe(true)
  })

  it('filtra por categoría, abierto ahora y radio de 5 cuadras', async () => {
    gpsNegado()
    const { fetchFalso } = apiFalsa({ '/categorias': CATEGORIAS, '/barrios': BARRIOS, '/negocios': LISTA })
    renderEn('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Cuba' }))
    await screen.findByText('Panadería El Trigal')

    fireEvent.click(screen.getByRole('button', { name: /Panadería/, pressed: false }))
    fireEvent.click(screen.getByRole('button', { name: /Abierto ahora/, pressed: false }))
    fireEvent.click(screen.getByRole('button', { name: '5 cuadras' }))

    await waitFor(() => {
      const ultima = String(fetchFalso.mock.calls.at(-1)?.[0])
      expect(ultima).toContain('categoria=panaderia')
      expect(ultima).toContain('abierto_ahora=true')
      expect(ultima).toContain('radio_m=500')
    })
  })

  it('muestra el estado vacío con invitación a agregar un negocio', async () => {
    gpsNegado()
    apiFalsa({
      '/categorias': CATEGORIAS,
      '/barrios': BARRIOS,
      '/negocios': { items: [], total: 0, siguiente_cursor: null },
    })
    renderEn('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Cuba' }))
    expect(await screen.findByText('Todavía no hay negocios en esta cuadra.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Agrégalo' })).toBeInTheDocument()
  })
})

describe('Perfil del negocio (/n/:slug)', () => {
  it('muestra datos, horario agrupado y WhatsApp con saludo', async () => {
    const { posts } = apiFalsa({ '/negocios/panaderia-el-trigal': DETALLE })
    renderEn('/n/panaderia-el-trigal')

    expect(await screen.findByRole('heading', { name: 'Panadería El Trigal' })).toBeInTheDocument()
    expect(screen.getByText('5:30–12:00 · 14:00–20:00')).toBeInTheDocument()
    expect(screen.getByText('Domingo').nextSibling).toHaveTextContent('Cerrado')
    const whatsapp = screen.getByRole('link', { name: 'Escribir por WhatsApp' })
    expect(whatsapp).toHaveAttribute('href', expect.stringContaining('https://wa.me/573001234567?text=Hola'))

    await waitFor(() => expect(posts.map((p) => p.cuerpo.tipo)).toContain('vista_perfil'))
    fireEvent.click(whatsapp)
    await waitFor(() => expect(posts.map((p) => p.cuerpo.tipo)).toContain('click_whatsapp'))
  })

  it('"Pedir mandado" registra el clic y abre el modal de próximamente', async () => {
    const { posts } = apiFalsa({ '/negocios/panaderia-el-trigal': DETALLE })
    renderEn('/n/panaderia-el-trigal')

    fireEvent.click(await screen.findByRole('button', { name: /Pedir mandado/ }))

    const modal = await screen.findByRole('dialog')
    expect(within(modal).getByText('Los mandados llegan muy pronto')).toBeInTheDocument()
    expect(within(modal).getByRole('link', { name: 'Quiero estar en la lista' })).toHaveAttribute('href', '/conoce#lista')
    await waitFor(() =>
      expect(posts).toContainEqual(
        expect.objectContaining({ cuerpo: expect.objectContaining({ tipo: 'click_pedir_mandado', negocio_id: 'n1' }) }),
      ),
    )
  })

  it('respeta "No rastrear"', async () => {
    vi.stubGlobal('navigator', { ...navigator, doNotTrack: '1' })
    const { posts } = apiFalsa({ '/negocios/panaderia-el-trigal': DETALLE })
    renderEn('/n/panaderia-el-trigal')
    fireEvent.click(await screen.findByRole('button', { name: /Pedir mandado/ }))
    await screen.findByRole('dialog')
    expect(posts).toEqual([])
  })

  it('negocio que no existe', async () => {
    apiFalsa({})
    renderEn('/n/no-existe')
    expect(await screen.findByRole('heading', { name: 'Este negocio no está en el mapa' })).toBeInTheDocument()
  })
})

describe('Otras rutas', () => {
  it('/conoce muestra la portada', () => {
    apiFalsa({})
    renderEn('/conoce')
    expect(screen.getByRole('heading', { name: 'El mapa vivo de tu cuadra' })).toBeInTheDocument()
  })

  it('tiene página 404 en español', () => {
    apiFalsa({})
    renderEn('/no-existe/de-verdad')
    expect(screen.getByRole('heading', { name: 'Esta cuadra no existe' })).toBeInTheDocument()
  })
})
