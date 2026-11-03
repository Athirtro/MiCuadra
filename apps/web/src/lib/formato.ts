const cop = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

/** Pesos enteros → `$2.000` (separador de miles con punto, sin decimales). */
export function formatoCOP(pesos: number): string {
  return `$${cop.format(Math.round(pesos))}`
}

/** 1 cuadra ≈ 100 m (configurable en el API: `metros_por_cuadra`). */
export function formatoDistancia(metros: number, metrosPorCuadra = 100): string {
  const cuadras = Math.max(1, Math.round(metros / metrosPorCuadra))
  return `${cuadras} ${cuadras === 1 ? 'cuadra' : 'cuadras'} · ${Math.round(metros)} m`
}
