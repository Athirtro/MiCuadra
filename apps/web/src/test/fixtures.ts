import { vi } from 'vitest'
import type { Apartado, Barrio, Catalogo, Categoria, ListaNegocios, NegocioDetalle } from '../lib/api'

export const CATEGORIAS: Categoria[] = [
  { id: 'c1', slug: 'tienda', nombre: 'Tienda', icono: 'store', color: '#1E6B4E', orden: 1 },
  { id: 'c2', slug: 'panaderia', nombre: 'Panadería', icono: 'croissant', color: '#B7791F', orden: 2 },
]

export const BARRIOS: Barrio[] = [
  { id: 'b1', slug: 'cuba', nombre: 'Cuba', es_piloto: true, negocios: 7, centroide: { lat: 4.798, lng: -75.73 } },
  { id: 'b2', slug: 'alamos', nombre: 'Álamos', es_piloto: true, negocios: 3, centroide: { lat: 4.8, lng: -75.683 } },
]

export const LISTA: ListaNegocios = {
  total: 2,
  siguiente_cursor: null,
  items: [
    {
      id: 'n1',
      slug: 'panaderia-el-trigal',
      nombre: 'Panadería El Trigal',
      descripcion: 'Pan caliente',
      categoria: { slug: 'panaderia', nombre: 'Panadería', icono: 'croissant', color: '#B7791F' },
      barrio: { slug: 'cuba', nombre: 'Cuba' },
      ubicacion: { lat: 4.798, lng: -75.73 },
      distancia_m: 120,
      abierto_ahora: true,
      destacado: true,
      foto_url: null,
    },
    {
      id: 'n2',
      slug: 'tienda-dona-rosa',
      nombre: 'Tienda Doña Rosa',
      descripcion: null,
      categoria: { slug: 'tienda', nombre: 'Tienda', icono: 'store', color: '#1E6B4E' },
      barrio: { slug: 'cuba', nombre: 'Cuba' },
      ubicacion: { lat: 4.799, lng: -75.731 },
      distancia_m: 430,
      abierto_ahora: false,
      destacado: false,
      foto_url: null,
    },
  ],
}

export const DETALLE: NegocioDetalle = {
  id: 'n1',
  slug: 'panaderia-el-trigal',
  nombre: 'Panadería El Trigal',
  descripcion: 'Pan caliente desde la madrugada.',
  categoria: { slug: 'panaderia', nombre: 'Panadería', icono: 'croissant', color: '#B7791F' },
  barrio: { slug: 'cuba', nombre: 'Cuba' },
  ubicacion: { lat: 4.798, lng: -75.73 },
  direccion_texto: 'Carrera 10 # 20-30',
  whatsapp: '3001234567',
  telefono: null,
  fotos: ['https://placehold.co/800x600'],
  horarios: [
    { dia_semana: 1, abre: '05:30', cierra: '12:00' },
    { dia_semana: 1, abre: '14:00', cierra: '20:00' },
  ],
  abierto_ahora: true,
  cerrado_hoy: false,
  destacado: false,
  mandados: { disponible: false, razon: 'proximamente', mensajeros_activos: null, tarifa_desde: null },
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

/** fetch falso que responde según la ruta y guarda los POST recibidos. */
export function apiFalsa(rutas: Record<string, unknown> = {}) {
  const posts: { ruta: string; cuerpo: Record<string, unknown> }[] = []
  const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
    const ruta = url.replace('/api/v1', '')
    if (init?.method === 'POST') {
      posts.push({ ruta, cuerpo: JSON.parse(String(init.body)) })
      // Respuesta propia del POST si la prueba la da como 'POST /ruta'.
      const respuesta = Object.keys(rutas).find((r) => r.startsWith('POST ') && ruta.startsWith(r.slice(5)))
      return respuesta ? json(rutas[respuesta], 201) : new Response(null, { status: 204 })
    }
    // La ruta más específica gana: '/negocios/x/catalogo' antes que '/negocios/'.
    const clave = Object.keys(rutas)
      .filter((r) => ruta.startsWith(r))
      .sort((a, b) => b.length - a.length)[0]
    const pideCatalogo = /^\/negocios\/[^/]+\/catalogo/.test(ruta)
    if (pideCatalogo && !clave?.includes('/catalogo')) return json({ secciones: [], items: [] })
    if (clave === undefined) return json({ error: { codigo: 'no_encontrado', mensaje: 'No existe' } }, 404)
    return json(rutas[clave])
  })
  vi.stubGlobal('fetch', fetchFalso)
  return { fetchFalso, posts }
}

/** Geolocalización que el usuario niega. */
export function gpsNegado() {
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: { getCurrentPosition: (_ok: unknown, error: () => void) => error() },
  })
}

export const CATALOGO: Catalogo = {
  secciones: [{ id: 's1', nombre: 'Panes', orden: 0 }],
  items: [
    { id: 'i1', seccion_id: 's1', tipo: 'producto', nombre: 'Pan de bono', descripcion: 'Recién horneado', precio: 1500, foto_url: null, stock: 3, visible: true, orden: 0 },
    { id: 'i2', seccion_id: 's1', tipo: 'producto', nombre: 'Croissant', descripcion: null, precio: 3000, foto_url: null, stock: 0, visible: true, orden: 1 },
    { id: 'i3', seccion_id: null, tipo: 'servicio', nombre: 'Torta por encargo', descripcion: null, precio: null, foto_url: null, stock: null, visible: true, orden: 0 },
  ],
}

export const APARTADO: Apartado = {
  id: 'a1',
  codigo: 'K7P2',
  estado: 'pendiente',
  negocio: { id: 'n1', slug: 'panaderia-el-trigal', nombre: 'Panadería El Trigal', whatsapp: '3001234567' },
  vecino: { nombre: 'Valeria Ospina', celular: '3001112233' },
  items: [{ item_id: 'i1', nombre: 'Pan de bono', precio: 1500, cantidad: 2 }],
  nota: 'Paso a las 5',
  total: 3000,
  hay_sin_precio: false,
  motivo_cancelacion: null,
  cancelado_por: null,
  created_at: '2026-11-04T15:00:00Z',
  updated_at: '2026-11-04T15:00:00Z',
}
