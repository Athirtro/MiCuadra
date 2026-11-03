import { describe, expect, it } from 'vitest'
import { formatoCOP, formatoDistancia } from './formato'

describe('formatoCOP', () => {
  it.each([
    [1500, '$1.500'],
    [2000, '$2.000'],
    [50000, '$50.000'],
    [300, '$300'],
  ])('%i → %s', (pesos, esperado) => {
    expect(formatoCOP(pesos)).toBe(esperado)
  })
})

describe('formatoDistancia', () => {
  it('convierte metros a cuadras', () => {
    expect(formatoDistancia(420)).toBe('4 cuadras · 420 m')
    expect(formatoDistancia(30)).toBe('1 cuadra · 30 m')
  })
})
