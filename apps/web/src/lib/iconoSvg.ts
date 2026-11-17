import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { iconoCategoria } from './iconos'

const cache = new Map<string, string>()

/** SVG de la categoría como texto, para los pines de Leaflet (que se arman con HTML). */
export function svgCategoria(slug: string | null | undefined, tamano = 18): string {
  const clave = `${slug ?? ''}:${tamano}`
  let svg = cache.get(clave)
  if (!svg) {
    svg = renderToStaticMarkup(
      createElement(iconoCategoria(slug), { size: tamano, strokeWidth: 2.25, 'aria-hidden': true }),
    )
    cache.set(clave, svg)
  }
  return svg
}
