import {
  Apple,
  CookingPot,
  Croissant,
  Dumbbell,
  Hammer,
  MapPin,
  Pencil,
  Pill,
  Scissors,
  Shirt,
  Store,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

/**
 * Ícono de cada categoría (Lucide, lucide.dev: trazo fino, licencia ISC). Coincide con la
 * columna `categorias.icono` de la base.
 */
export const ICONO_CATEGORIA: Record<string, LucideIcon> = {
  tienda: Store,
  panaderia: Croissant,
  barberia: Scissors,
  drogueria: Pill,
  fruver: Apple,
  papeleria: Pencil,
  taller: Wrench,
  gimnasio: Dumbbell,
  lavanderia: Shirt,
  'comida-casera': CookingPot,
  ferreteria: Hammer,
}

export function iconoCategoria(slug: string | null | undefined): LucideIcon {
  return (slug && ICONO_CATEGORIA[slug]) || MapPin
}
