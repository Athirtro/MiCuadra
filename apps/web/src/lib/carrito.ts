import { useCallback, useEffect, useState } from 'react'
import type { Catalogo, Item } from './api'

/** Carrito de un negocio: id del ítem → cantidad. Se guarda en el celular hasta apartar. */
export type Carrito = Record<string, number>

const clave = (negocioId: string) => `micuadra.carrito.${negocioId}`
export const MAX_POR_ITEM = 99

function leer(negocioId: string): Carrito {
  try {
    const guardado = localStorage.getItem(clave(negocioId))
    return guardado ? (JSON.parse(guardado) as Carrito) : {}
  } catch {
    return {}
  }
}

export function useCarrito(negocioId: string) {
  const [carrito, setCarrito] = useState<Carrito>(() => leer(negocioId))

  useEffect(() => {
    try {
      if (Object.keys(carrito).length) localStorage.setItem(clave(negocioId), JSON.stringify(carrito))
      else localStorage.removeItem(clave(negocioId))
    } catch {
      // sin almacenamiento: el carrito dura mientras la página esté abierta
    }
  }, [negocioId, carrito])

  /** Fija la cantidad (0 la quita), sin pasar del tope ni del stock si lo hay. */
  const poner = useCallback((itemId: string, cantidad: number, tope: number | null = null) => {
    const limite = Math.min(MAX_POR_ITEM, tope ?? MAX_POR_ITEM)
    setCarrito((c) => {
      const resto = Object.fromEntries(Object.entries(c).filter(([id]) => id !== itemId))
      const n = Math.max(0, Math.min(limite, Math.round(cantidad)))
      return n ? { ...resto, [itemId]: n } : resto
    })
  }, [])

  const vaciar = useCallback(() => setCarrito({}), [])

  return { carrito, poner, vaciar }
}

/** Líneas del carrito con su ítem del catálogo, unidades y total (los ítems que ya no están se ignoran). */
export function resumenCarrito(catalogo: Catalogo | undefined, carrito: Carrito) {
  const lineas = Object.entries(carrito)
    .map(([id, cantidad]) => ({ item: catalogo?.items.find((i) => i.id === id), cantidad }))
    .filter((l): l is { item: Item; cantidad: number } => Boolean(l.item))
  return {
    lineas,
    unidades: lineas.reduce((s, l) => s + l.cantidad, 0),
    // Con oferta se aparta al precio rebajado (igual que en el servidor).
    total: lineas.reduce((s, l) => s + precioFinal(l.item) * l.cantidad, 0),
    hay_sin_precio: lineas.some((l) => l.item.precio === null),
  }
}

/** Lo que se cobra por unidad: el precio de oferta si hay, si no el normal (0 si no tiene precio). */
export function precioFinal(item: Item): number {
  return item.precio_oferta ?? item.precio ?? 0
}
