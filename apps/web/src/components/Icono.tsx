import type { LucideProps } from 'lucide-react'
import { createElement } from 'react'
import { iconoCategoria } from '../lib/iconos'

/** Ícono de la categoría del negocio (decorativo: el nombre siempre va al lado o en el título). */
export function IconoCategoria({ slug, ...props }: { slug: string | null | undefined } & LucideProps) {
  return createElement(iconoCategoria(slug), { 'aria-hidden': true, ...props })
}
