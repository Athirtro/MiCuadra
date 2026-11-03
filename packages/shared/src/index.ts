/**
 * Constantes de dominio compartidas. Los tipos del API están en `./api` (generados con
 * `pnpm gen:types` desde el OpenAPI de FastAPI; no editar a mano).
 * Las cifras de negocio (tarifas, radios, topes) NO viven aquí: las calcula el servidor
 * desde la tabla `config`.
 */

export const BARRIOS_PILOTO = ['cuba', 'alamos', 'boston', 'el-jardin'] as const

export const CATEGORIAS = [
  'tienda',
  'panaderia',
  'barberia',
  'drogueria',
  'fruver',
  'papeleria',
  'taller',
  'gimnasio',
  'lavanderia',
  'comida-casera',
] as const
export type CategoriaSlug = (typeof CATEGORIAS)[number]

export const ROLES = ['vecino', 'mensajero', 'dueno', 'admin'] as const
export type Rol = (typeof ROLES)[number]

export const ESTADOS_NEGOCIO = ['borrador', 'pendiente', 'activo', 'rechazado', 'inactivo'] as const
export type EstadoNegocio = (typeof ESTADOS_NEGOCIO)[number]

export const ESTADOS_MANDADO = [
  'creado',
  'aceptado',
  'recogido',
  'comprado',
  'en_camino',
  'entregado',
  'cancelado',
  'expirado',
  'con_incidencia',
] as const
export type EstadoMandado = (typeof ESTADOS_MANDADO)[number]

export const TIPOS_EVENTO = [
  'vista_perfil',
  'click_whatsapp',
  'click_pedir_mandado',
  'click_como_llegar',
  'busqueda',
  'sesion',
] as const
export type TipoEvento = (typeof TIPOS_EVENTO)[number]
