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
  it('el menú inferior lleva a las pantallas principales y no sale en el perfil', async () => {
    gpsNegado()
    apiFalsa({ '/categorias': CATEGORIAS, '/barrios': BARRIOS, '/negocios': LISTA })
    const { unmount } = renderEn('/')
    const menu = await screen.findByRole('navigation', { name: 'Menú principal' })
    expect(within(menu).getByRole('link', { name: 'Mapa' })).toHaveAttribute('aria-current', 'page')
    expect(within(menu).getByRole('link', { name: 'Apartados' })).toHaveAttribute('href', '/mis-apartados')
    expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument()
    unmount()

    apiFalsa({ '/negocios/': DETALLE })
    renderEn('/n/panaderia-el-trigal')
    expect(await screen.findByRole('heading', { name: 'Panadería El Trigal' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Menú principal' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument()
  })

  it('"Ir" muestra la tarjeta del camino y, sin ubicación, pide activarla', async () => {
    gpsNegado()
    apiFalsa({ '/categorias': CATEGORIAS, '/barrios': BARRIOS, '/negocios': LISTA })
    renderEn('/')
    fireEvent.click(await screen.findByRole('button', { name: /^Cuba/ }))

    fireEvent.click(await screen.findByRole('button', { name: 'Cómo llegar a Panadería El Trigal' }))
    const tarjeta = await screen.findByText('Activa tu ubicación para ver el camino.')
    expect(tarjeta.closest('[role="status"]')).toHaveTextContent('Panadería El Trigal')
    fireEvent.click(screen.getByRole('button', { name: 'Quitar el camino' }))
    expect(screen.queryByText('Activa tu ubicación para ver el camino.')).not.toBeInTheDocument()
  })

  it('la lista sube al desplazarla y baja con la manija', async () => {
    gpsNegado()
    apiFalsa({ '/categorias': CATEGORIAS, '/barrios': BARRIOS, '/negocios': LISTA })
    renderEn('/')
    fireEvent.click(await screen.findByRole('button', { name: /^Cuba/ }))
    await screen.findByText('Panadería El Trigal')

    const hoja = screen.getByRole('region', { name: 'Resultados' })
    expect(hoja).toHaveAttribute('data-expandida', 'false')
    const lista = screen.getByText('Panadería El Trigal').closest('.overflow-y-auto') as HTMLElement
    lista.scrollTop = 40
    fireEvent.scroll(lista)
    expect(hoja).toHaveAttribute('data-expandida', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Bajar la lista y ver el mapa' }))
    expect(hoja).toHaveAttribute('data-expandida', 'false')
  })

  it('sin GPS pide el barrio y muestra los negocios cercanos con distancia en cuadras', async () => {
    gpsNegado()
    const { fetchFalso } = apiFalsa({ '/categorias': CATEGORIAS, '/barrios': BARRIOS, '/negocios': LISTA })
    renderEn('/')

    fireEvent.click(await screen.findByRole('button', { name: /^Cuba/ }))

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
    fireEvent.click(await screen.findByRole('button', { name: /^Cuba/ }))
    await screen.findByText('Panadería El Trigal')

    fireEvent.click(screen.getByRole('button', { name: /Panadería/, pressed: false }))
    fireEvent.click(screen.getByRole('button', { name: /Abierto ahora/, pressed: false }))
    fireEvent.click(screen.getByRole('radio', { name: '5 cuadras' }))

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
    fireEvent.click(await screen.findByRole('button', { name: /^Cuba/ }))
    expect(await screen.findByText('Todavía no hay negocios en esta cuadra.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Agrégalo' })).toBeInTheDocument()
  })
})

describe('Perfil del negocio (/n/:slug)', () => {
  it('"Cómo llegar" dibuja el camino a pie en la página, sin abrir Google Maps', async () => {
    const posicion = { coords: { latitude: 4.797, longitude: -75.731, accuracy: 20 } }
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (ok: (p: unknown) => void) => ok(posicion),
        watchPosition: () => 1,
        clearWatch: () => undefined,
      },
    })
    const { fetchFalso } = apiFalsa({
      '/negocios/': DETALLE,
      'https://routing.openstreetmap.de': {
        code: 'Ok',
        routes: [{ distance: 230, duration: 170, geometry: { coordinates: [[-75.731, 4.797], [-75.7305, 4.7985]] } }],
      },
    })
    const abrir = vi.spyOn(window, 'open')
    renderEn('/n/panaderia-el-trigal')

    fireEvent.click(await screen.findByRole('button', { name: /Cómo llegar/ }))
    expect(await screen.findByText('🚶 3 min')).toBeInTheDocument()
    expect(screen.getByText(/230 m a pie desde donde estás/)).toBeInTheDocument()
    expect(fetchFalso.mock.calls.some(([url]) => url.includes('/foot/-75.731,4.797;'))).toBe(true)
    expect(abrir).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: /Cómo llegar/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar camino' }))
    expect(screen.getByRole('button', { name: /Cómo llegar/ })).toBeInTheDocument()
  })

  it('"Cómo llegar" sin permiso de ubicación lo explica', async () => {
    gpsNegado()
    apiFalsa({ '/negocios/': DETALLE })
    renderEn('/n/panaderia-el-trigal')
    fireEvent.click(await screen.findByRole('button', { name: /Cómo llegar/ }))
    expect(await screen.findByText(/No pudimos ver tu ubicación/)).toBeInTheDocument()
  })

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
    await waitFor(() =>
      expect(posts).toContainEqual(
        expect.objectContaining({ cuerpo: expect.objectContaining({ tipo: 'click_pedir_mandado', negocio_id: 'n1' }) }),
      ),
    )

    // "¿Qué le habrías pedido?" llega prellenado a la lista de espera
    fireEvent.change(within(modal).getByLabelText('¿Qué le habrías pedido?'), { target: { value: '6 panes' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Quiero estar en la lista' }))
    expect(await screen.findByLabelText('¿Qué mandado pedirías? (opcional)')).toHaveValue('6 panes (en Panadería El Trigal)')
    expect(screen.getByRole('button', { name: /Soy vecino/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reportar información incorrecta', async () => {
    const { posts } = apiFalsa({ '/negocios/panaderia-el-trigal': DETALLE })
    renderEn('/n/panaderia-el-trigal')

    fireEvent.click(await screen.findByRole('button', { name: 'Reportar información incorrecta' }))
    const modal = await screen.findByRole('dialog')
    const enviar = within(modal).getByRole('button', { name: 'Enviar reporte' })
    expect(enviar).toBeDisabled()
    fireEvent.click(within(modal).getByLabelText('El horario está mal'))
    fireEvent.change(within(modal).getByLabelText(/Cuéntanos más/), { target: { value: 'Abre a las 5' } })
    fireEvent.click(enviar)

    expect(await within(modal).findByText('¡Gracias por avisar!')).toBeInTheDocument()
    expect(posts).toContainEqual({ ruta: '/negocios/n1/reportes', cuerpo: { motivo: 'horario', detalle: 'Abre a las 5' } })
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

  it('/conoce: metas y lista de espera sin duplicar datos', async () => {
    const metas = {
      negocios_activos: { valor: 12, meta: 40 },
      vecinos_semana: { valor: 80, meta: 200 },
      mensajeros_listos: { valor: 3, meta: 15 },
    }
    const { posts } = apiFalsa({ '/lista-espera/metas': metas, '/barrios': BARRIOS })
    renderEn('/conoce')

    expect(await screen.findByRole('progressbar', { name: 'Negocios en el mapa' })).toHaveAttribute('aria-valuenow', '12')
    expect(screen.getByText('3 / 15')).toBeInTheDocument()

    const inscribirme = screen.getByRole('button', { name: 'Inscribirme' })
    fireEvent.click(screen.getByRole('button', { name: /Tengo un negocio/ }))
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Arcesio' } })
    fireEvent.change(screen.getByLabelText(/Tu WhatsApp/), { target: { value: '311 222 3344' } })
    fireEvent.change(screen.getByLabelText('Tu barrio'), { target: { value: 'otro' } })
    fireEvent.change(screen.getByLabelText('¿Cuál barrio?'), { target: { value: 'Villa Santana' } })
    fireEvent.change(screen.getByLabelText('Nombre del negocio'), { target: { value: 'Fruver Don Arcesio' } })
    expect(inscribirme).toBeDisabled() // falta el tipo y la autorización
    fireEvent.change(screen.getByLabelText(/tipo de negocio/), { target: { value: 'Fruver' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(inscribirme)

    expect(await screen.findByText('¡Quedaste en la lista!')).toBeInTheDocument()
    expect(posts.find((p) => p.ruta === '/lista-espera')?.cuerpo).toEqual({
      rol: 'negocio',
      nombre: 'Arcesio',
      whatsapp: '3112223344',
      barrio: 'Villa Santana',
      negocio_nombre: 'Fruver Don Arcesio',
      negocio_tipo: 'Fruver',
      que_pediria: null,
      acepta_datos: true,
    })
  })

  it('tiene página 404 en español', () => {
    apiFalsa({})
    renderEn('/no-existe/de-verdad')
    expect(screen.getByRole('heading', { name: 'Esta cuadra no existe' })).toBeInTheDocument()
  })
})
