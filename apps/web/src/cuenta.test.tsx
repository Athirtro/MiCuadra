import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { Gate, NegocioAdmin, Perfil } from './lib/api'
import { ProveedorSesion } from './lib/sesion'
import { APARTADO, apiFalsa, BARRIOS, CATALOGO, CATEGORIAS, DETALLE } from './test/fixtures'

// Sesión de Supabase simulada: `conSesion` decide si hay alguien adentro.
const estado = vi.hoisted(() => ({ conSesion: true, google: vi.fn(), correo: vi.fn(), subir: vi.fn() }))
vi.mock('./lib/imagen', () => ({ comprimirFoto: async () => new Blob(['x'], { type: 'image/webp' }) }))
vi.mock('./lib/supabase', () => ({
  authDisponible: true,
  urlRegreso: () => 'http://localhost/cuenta',
  subirFoto: estado.subir,
  borrarArchivoFoto: vi.fn(),
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
    // El barrio se escribe libre: si no existe, el mapa lo agrega.
    fireEvent.change(screen.getByLabelText(/^Barrio/), { target: { value: 'Villa Verde' } })
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
      barrio: 'Villa Verde',
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

describe('Panel de administración', () => {
  const ADMIN: Perfil = { ...NUEVO, perfil_completo: true, roles: ['admin'] }
  const PENDIENTE: NegocioAdmin = {
    id: 'n9',
    slug: 'arepas-cuba',
    nombre: 'Arepas La Esquina',
    estado: 'pendiente',
    motivo_rechazo: null,
    categoria: { slug: 'panaderia', nombre: 'Panadería', icono: 'croissant', color: '#B7791F' },
    barrio: { slug: 'cuba', nombre: 'Cuba' },
    whatsapp: '3104567890',
    direccion_texto: 'Calle 72 # 25-10',
    descripcion: null,
    dueno: { nombre: 'Valeria Ospina', email: 'vale@gmail.com', celular: '3104567890' },
    creado_por_admin: false,
    reportes_abiertos: 1,
    created_at: '2026-11-03T15:00:00Z',
  }
  const GATE: Gate = {
    cumplidos: 1,
    listo: false,
    generado_at: '2026-11-03T15:00:00Z',
    criterios: [
      {
        id: 3,
        nombre: 'Demanda de mandados',
        meta: '≥ 40 clics en «Pedir mandado» en 14 días',
        valor: '25 clics',
        progreso: 0.625,
        estado: 'amarillo',
        detalle: 'Últimos 14 días.',
        serie: [],
      },
    ],
  }

  it('un vecino no entra al panel', async () => {
    apiFalsa({ '/yo': { ...NUEVO, perfil_completo: true } })
    renderEn('/admin')
    expect(await screen.findByRole('heading', { name: 'Esta parte es solo para el equipo' })).toBeInTheDocument()
  })

  it('muestra el gate con semáforo', async () => {
    apiFalsa({ '/yo': ADMIN, '/admin/metricas': GATE, '/admin/entrevistas': [] })
    renderEn('/admin')
    expect(await screen.findByText('1 de 6 criterios cumplidos. Los mandados siguen apagados.')).toBeInTheDocument()
    expect(screen.getByText('25 clics')).toBeInTheDocument()
    expect(screen.getByText('Va en camino')).toBeInTheDocument()
  })

  it('rechazar un negocio pide el motivo y lo envía', async () => {
    const { posts, fetchFalso } = apiFalsa({ '/yo': ADMIN, '/admin/negocios': [PENDIENTE] })
    renderEn('/admin/negocios')

    expect(await screen.findByRole('heading', { name: 'Arepas La Esquina' })).toBeInTheDocument()
    expect(screen.getByText('1 reporte abierto')).toBeInTheDocument()
    const pedido = fetchFalso.mock.calls.find(([url]) => String(url).includes('/admin/negocios'))
    expect(String(pedido?.[0])).toContain('estado=pendiente')
    expect(new Headers(pedido?.[1]?.headers).get('Authorization')).toBe('Bearer token-123')

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    fireEvent.change(screen.getByLabelText(/Motivo del rechazo/), { target: { value: 'Falta la dirección' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    await waitFor(() =>
      expect(posts).toContainEqual({ ruta: '/admin/negocios/n9/estado', cuerpo: { estado: 'rechazado', motivo: 'Falta la dirección' } }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(posts).toContainEqual({ ruta: '/admin/negocios/n9/estado', cuerpo: { estado: 'activo' } }))
  })
})

describe('Fotos del negocio', () => {
  it('sube la foto a Storage y la registra en el API', async () => {
    const DUENO: Perfil = { ...NUEVO, perfil_completo: true, roles: ['dueno', 'vecino'] }
    const URL_FOTO = 'https://x.supabase.co/storage/v1/object/public/negocio-fotos/n9/a.webp'
    estado.subir.mockResolvedValue(URL_FOTO)
    const { posts } = apiFalsa({ '/yo': DUENO, '/mis-negocios/n9/fotos': [], '/mis-negocios': [] })
    renderEn('/mi-negocio/n9/fotos')

    expect(await screen.findByText(/Todavía no hay fotos/)).toBeInTheDocument()
    const archivo = new File(['foto'], 'fachada.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Elegir fotos'), { target: { files: [archivo] } })

    await waitFor(() => expect(posts).toContainEqual({ ruta: '/mis-negocios/n9/fotos', cuerpo: { url: URL_FOTO } }))
    expect(estado.subir).toHaveBeenCalledWith('n9', expect.any(Blob), 'token-123')
  })
})

describe('Catálogo y apartados', () => {
  const VECINO: Perfil = { ...NUEVO, perfil_completo: true, celular: '3001112233' }
  const DUENO: Perfil = { ...VECINO, roles: ['dueno'] }
  const MI_NEGOCIO = {
    id: 'n1',
    slug: 'panaderia-el-trigal',
    nombre: 'Panadería El Trigal',
    estado: 'activo',
    motivo_rechazo: null,
    categoria: 'panaderia',
    barrio: null,
    apartados_pendientes: 1,
  }

  it('el vecino arma su carrito, aparta y avisa por WhatsApp con el código', async () => {
    const { posts } = apiFalsa({
      '/yo': VECINO,
      '/negocios/panaderia-el-trigal/catalogo': CATALOGO,
      '/negocios/': DETALLE,
      'POST /negocios/n1/apartados': APARTADO,
    })
    renderEn('/n/panaderia-el-trigal')

    expect(await screen.findByRole('heading', { name: 'Catálogo' })).toBeInTheDocument()
    expect(screen.getByText('Agotado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar Croissant' })).toBeDisabled()
    expect(screen.getByText('Pregunta el precio')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar Pan de bono' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar otro de Pan de bono' }))
    expect(screen.getByRole('group', { name: 'Cantidad de Pan de bono' })).toHaveTextContent('2')
    expect(JSON.parse(localStorage.getItem('micuadra.carrito.n1') ?? '{}')).toEqual({ i1: 2 })

    fireEvent.click(screen.getByRole('button', { name: /Apartar \(2\)/ }))
    fireEvent.change(await screen.findByLabelText(/Nota para el negocio/), { target: { value: 'Paso a las 5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apartar' }))

    expect(await screen.findByRole('heading', { name: '¡Apartado!' })).toBeInTheDocument()
    expect(posts).toContainEqual({
      ruta: '/negocios/n1/apartados',
      cuerpo: { items: [{ item_id: 'i1', cantidad: 2 }], nota: 'Paso a las 5' },
    })
    const wa = screen.getByRole('link', { name: /Avisar por WhatsApp/ }).getAttribute('href') ?? ''
    expect(decodeURIComponent(wa)).toContain('Código: *K7P2*')
    expect(decodeURIComponent(wa)).toContain('• 2 × Pan de bono — $3.000')
    expect(localStorage.getItem('micuadra.carrito.n1')).toBeNull()
  })

  it('sin cuenta, el carrito pide entrar y recuerda volver al negocio', async () => {
    estado.conSesion = false
    localStorage.setItem('micuadra.carrito.n1', JSON.stringify({ i1: 1 }))
    apiFalsa({ '/negocios/panaderia-el-trigal/catalogo': CATALOGO, '/negocios/': DETALLE })
    renderEn('/n/panaderia-el-trigal')

    fireEvent.click(await screen.findByRole('button', { name: /Apartar \(1\)/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar para apartar' }))
    expect(await screen.findByRole('button', { name: 'Continuar con Google' })).toBeInTheDocument()
    expect(sessionStorage.getItem('micuadra.volver')).toBe('/n/panaderia-el-trigal')
  })

  it('el dueño agrega un producto con precio e inventario', async () => {
    const { posts } = apiFalsa({
      '/yo': DUENO,
      '/mis-negocios/n1/catalogo': CATALOGO,
      '/mis-negocios': [MI_NEGOCIO],
      'POST /mis-negocios/n1/catalogo/items': CATALOGO.items[0],
    })
    renderEn('/mi-negocio/n1/catalogo')

    expect(await screen.findByRole('heading', { name: 'Catálogo de Panadería El Trigal' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /1 por confirmar/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Agregar producto o servicio/ }))
    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Pandebono' } })
    fireEvent.change(screen.getByPlaceholderText(/Pregunta el precio/), { target: { value: '1.800' } })
    fireEvent.click(screen.getByLabelText('Llevar inventario'))
    fireEvent.change(screen.getByLabelText(/Unidades disponibles/), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Sección'), { target: { value: 's1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(posts).toContainEqual({
        ruta: '/mis-negocios/n1/catalogo/items',
        cuerpo: expect.objectContaining({ nombre: 'Pandebono', precio: 1800, stock: 12, seccion_id: 's1', tipo: 'producto' }),
      }),
    )
  })

  it('el dueño confirma un apartado pendiente', async () => {
    const { posts } = apiFalsa({
      '/yo': DUENO,
      '/mis-negocios/n1/apartados': [APARTADO],
      '/mis-negocios': [MI_NEGOCIO],
      'POST /mis-negocios/n1/apartados/a1/estado': { ...APARTADO, estado: 'confirmado' },
    })
    renderEn('/mi-negocio/n1/apartados')

    expect(await screen.findByText('K7P2')).toBeInTheDocument()
    expect(screen.getByText('«Paso a las 5»')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() =>
      expect(posts).toContainEqual({ ruta: '/mis-negocios/n1/apartados/a1/estado', cuerpo: { estado: 'confirmado' } }),
    )
  })
})
