import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { Perfil } from './lib/api'
import { ProveedorSesion } from './lib/sesion'
import { apiFalsa, BARRIOS, CATEGORIAS } from './test/fixtures'

// Sesión de Supabase simulada: `conSesion` decide si hay alguien adentro.
const estado = vi.hoisted(() => ({ conSesion: true, google: vi.fn(), correo: vi.fn() }))
vi.mock('./lib/supabase', () => ({
  authDisponible: true,
  urlRegreso: () => 'http://localhost/cuenta',
  auth: {
    onAuthStateChange: (cb: (evento: string, sesion: unknown) => void) => {
      const sesion = estado.conSesion ? { access_token: 'token-123', user: { id: 'u1', email: 'vale@gmail.com' } } : null
      queueMicrotask(() => cb('INITIAL_SESSION', sesion))
      return { data: { subscription: { unsubscribe: () => {} } } }
    },
    signInWithOAuth: estado.google,
    signInWithOtp: estado.correo,
    signOut: vi.fn(),
  },
}))

const NUEVO: Perfil = {
  id: 'u1',
  email: 'vale@gmail.com',
  nombre: 'Valeria Ospina',
  celular: null,
  foto_url: null,
  barrio: null,
  roles: ['vecino'],
  perfil_completo: false,
}

function renderEn(ruta: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ProveedorSesion>
        <MemoryRouter initialEntries={[ruta]}>
          <App />
        </MemoryRouter>
      </ProveedorSesion>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  estado.conSesion = true
  estado.google.mockResolvedValue({ error: null })
  estado.correo.mockResolvedValue({ error: null })
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('Entrar', () => {
  it('ofrece Google y enlace por correo', async () => {
    estado.conSesion = false
    apiFalsa({})
    renderEn('/entrar')

    fireEvent.click(await screen.findByRole('button', { name: 'Continuar con Google' }))
    expect(estado.google).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', options: expect.objectContaining({ redirectTo: 'http://localhost/cuenta' }) }),
    )

    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'vale@gmail.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviarme un enlace para entrar' }))
    expect(await screen.findByText('📬 Revisa tu correo')).toBeInTheDocument()
    expect(estado.correo).toHaveBeenCalledWith(expect.objectContaining({ email: 'vale@gmail.com' }))
  })

  it('sin sesión el encabezado muestra "Entrar"', async () => {
    estado.conSesion = false
    apiFalsa({})
    renderEn('/conoce')
    expect(await screen.findByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar')
  })
})

describe('Después de registrarse', () => {
  it('un usuario nuevo va al formulario de bienvenida', async () => {
    apiFalsa({ '/yo': NUEVO, '/barrios': BARRIOS })
    renderEn('/cuenta')
    expect(await screen.findByRole('heading', { name: '¡Bienvenido a MiCuadra!' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tu nombre')).toHaveValue('Valeria Ospina') // viene de Google
  })

  it('como empresario guarda el perfil y sigue al registro del negocio', async () => {
    const { posts, fetchFalso } = apiFalsa({ '/yo': NUEVO, '/barrios': BARRIOS, '/categorias': CATEGORIAS })
    // PUT /yo/perfil responde el perfil ya completo
    fetchFalso.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        posts.push({ ruta: url, cuerpo: JSON.parse(String(init.body)) })
        return new Response(JSON.stringify({ ...NUEVO, perfil_completo: true, roles: ['dueno', 'vecino'] }), { status: 200 })
      }
      const ruta = url.replace('/api/v1', '')
      const datos = ruta.startsWith('/yo') ? NUEVO : ruta.startsWith('/barrios') ? BARRIOS : CATEGORIAS
      return new Response(JSON.stringify(datos), { status: 200 })
    })
    renderEn('/bienvenida')

    const enviar = await screen.findByRole('button', { name: /Listo|Seguir/ })
    expect(enviar).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /Tengo un negocio/ }))
    fireEvent.change(screen.getByLabelText(/Tu celular/), { target: { value: '310 456 7890' } })
    fireEvent.change(screen.getByLabelText(/barrio/), { target: { value: 'cuba' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Seguir con mi negocio →' }))

    await waitFor(() =>
      expect(posts[0]?.cuerpo).toEqual({
        tipo: 'dueno',
        nombre: 'Valeria Ospina',
        celular: '3104567890',
        barrio: 'cuba',
        acepta_datos: true,
      }),
    )
    // Header de autorización con el token de Supabase
    const put = fetchFalso.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(new Headers(put?.[1]?.headers).get('Authorization')).toBe('Bearer token-123')
    expect(await screen.findByRole('heading', { name: 'Registra tu negocio' })).toBeInTheDocument()
  })

  it('no deja continuar con un celular inválido ni sin autorizar los datos', async () => {
    apiFalsa({ '/yo': NUEVO, '/barrios': BARRIOS })
    renderEn('/bienvenida')
    fireEvent.click(await screen.findByRole('button', { name: /Soy vecino/ }))
    fireEvent.change(screen.getByLabelText(/Tu celular/), { target: { value: '6063334455' } })
    expect(screen.getByText(/debe tener 10 dígitos y empezar por 3/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Listo, ir al mapa' })).toBeDisabled()
  })
})

describe('Registro del negocio', () => {
  const DUENO: Perfil = { ...NUEVO, celular: '3104567890', perfil_completo: true, roles: ['dueno', 'vecino'] }

  it('recorre los 4 pasos y envía el negocio a revisión', async () => {
    const { posts, fetchFalso } = apiFalsa({ '/yo': DUENO, '/barrios': BARRIOS, '/categorias': CATEGORIAS })
    fetchFalso.mockImplementation(async (url: string, init?: RequestInit) => {
      const ruta = url.replace('/api/v1', '')
      if (init?.method === 'POST') {
        posts.push({ ruta, cuerpo: JSON.parse(String(init.body)) })
        const respuesta = { id: 'n9', slug: 'arepas-cuba', nombre: 'Arepas La Esquina', estado: 'pendiente', motivo_rechazo: null, categoria: 'panaderia', barrio: null }
        return new Response(JSON.stringify(respuesta), { status: 201 })
      }
      const datos = ruta.startsWith('/yo') ? DUENO : ruta.startsWith('/barrios') ? BARRIOS : CATEGORIAS
      return new Response(JSON.stringify(datos), { status: 200 })
    })
    renderEn('/mi-negocio/nuevo')

    // Paso 1: datos (el WhatsApp viene del perfil)
    fireEvent.change(await screen.findByLabelText('Nombre del negocio'), { target: { value: 'Arepas La Esquina' } })
    fireEvent.click(await screen.findByRole('button', { name: /Panadería/ }))
    expect(screen.getByLabelText(/WhatsApp del negocio/)).toHaveValue('3104567890')
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    // Paso 2: ubicación — hasta mover el pin no deja seguir
    const siguiente = await screen.findByRole('button', { name: 'Siguiente' })
    expect(siguiente).toBeDisabled()
    fireEvent.click(await screen.findByRole('button', { name: 'Mover pin' }))
    fireEvent.change(screen.getByLabelText(/Dirección/), { target: { value: 'Calle 72 # 25-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    // Paso 3: horario con plantilla
    fireEvent.click(await screen.findByRole('button', { name: 'Lunes a sábado 8 a. m.–6 p. m.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    // Paso 4: revisar y enviar
    expect(await screen.findByText('Revisa que todo esté bien')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revisión' }))

    expect(await screen.findByRole('heading', { name: '¡Recibimos tu negocio!' })).toBeInTheDocument()
    const cuerpo = posts.find((p) => p.ruta === '/mis-negocios')?.cuerpo
    expect(cuerpo).toMatchObject({
      nombre: 'Arepas La Esquina',
      categoria: 'panaderia',
      whatsapp: '3104567890',
      direccion_texto: 'Calle 72 # 25-10',
      ubicacion: { lat: 4.7985, lng: -75.7305 },
    })
    expect(cuerpo?.horarios).toHaveLength(6)
    expect(localStorage.getItem('micuadra.borrador-negocio')).toBeNull()
  })

  it('guarda el borrador si sale a mitad del registro', async () => {
    apiFalsa({ '/yo': DUENO, '/barrios': BARRIOS, '/categorias': CATEGORIAS })
    renderEn('/mi-negocio/nuevo')
    fireEvent.change(await screen.findByLabelText('Nombre del negocio'), { target: { value: 'Fruver Don Arcesio' } })
    await waitFor(() => expect(localStorage.getItem('micuadra.borrador-negocio')).toContain('Fruver Don Arcesio'))
  })

  it('un vecino puede convertirse en empresario', async () => {
    apiFalsa({ '/yo': { ...NUEVO, celular: '3104567890', perfil_completo: true } })
    renderEn('/mi-negocio/nuevo')
    expect(await screen.findByRole('button', { name: 'Sí, quiero registrar mi negocio' })).toBeInTheDocument()
  })
})
