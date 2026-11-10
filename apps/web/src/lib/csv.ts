import type { FilaCsv as FilaApi } from './api'

/** Fila del archivo: cada columna es opcional (el API marca lo que falte). */
export type FilaCsv = Partial<FilaApi>

/** Columnas de la plantilla, en orden. */
export const COLUMNAS: (keyof FilaCsv)[] = [
  'nombre',
  'categoria',
  'barrio',
  'direccion',
  'ubicacion',
  'whatsapp',
  'telefono',
  'descripcion',
  'horario',
]

export const PLANTILLA = [
  COLUMNAS.join(','),
  '"Panadería Ejemplo",Panadería,Cuba,"Cra 27 # 71-08","4.7966, -75.7301",3101234567,,"Pan de bono y café","lun-sab 6:00-20:00; dom 7:00-13:00"',
].join('\n')

/** Encabezados con tildes, mayúsculas o sinónimos → columna de la plantilla. */
const SINONIMOS: Record<string, keyof FilaCsv> = {
  nombre: 'nombre',
  negocio: 'nombre',
  categoria: 'categoria',
  tipo: 'categoria',
  barrio: 'barrio',
  direccion: 'direccion',
  ubicacion: 'ubicacion',
  coordenadas: 'ubicacion',
  'lat lng': 'ubicacion',
  mapa: 'ubicacion',
  whatsapp: 'whatsapp',
  celular: 'whatsapp',
  telefono: 'telefono',
  fijo: 'telefono',
  descripcion: 'descripcion',
  horario: 'horario',
  horarios: 'horario',
}

const normalizar = (t: string) =>
  t
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Separa un CSV en filas y celdas: comillas dobles, saltos de línea dentro de comillas y "" escapado. */
export function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^\uFEFF/, '')
  const primera = limpio.split(/\r?\n/, 1)[0] ?? ''
  // Excel en español guarda con punto y coma.
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ','
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let comillas = false
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"'
        i++
      } else if (c === '"') comillas = false
      else celda += c
    } else if (c === '"') comillas = true
    else if (c === sep) {
      fila.push(celda)
      celda = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else celda += c
  }
  if (celda || fila.length) {
    fila.push(celda)
    filas.push(fila)
  }
  return filas.filter((f) => f.some((c) => c.trim()))
}

/** Convierte el CSV en filas para el API. Avisa las columnas que no reconoce. */
export function filasDesdeCsv(texto: string): { filas: FilaCsv[]; ignoradas: string[] } {
  const [encabezado = [], ...resto] = leerCsv(texto)
  const columnas = encabezado.map((h) => SINONIMOS[normalizar(h)] ?? null)
  const ignoradas = encabezado.filter((_, i) => columnas[i] === null).map((h) => h.trim()).filter(Boolean)
  const filas = resto.map((celdas) => {
    const fila: FilaCsv = {}
    columnas.forEach((col, i) => {
      if (col) fila[col] = (celdas[i] ?? '').trim()
    })
    return fila
  })
  return { filas, ignoradas }
}
