import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aplicarTema, guardarTema, leerTema } from './tema'

function sistemaOscuro(oscuro: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: oscuro, addEventListener: () => undefined, removeEventListener: () => undefined }))
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('tema', () => {
  it('es claro por defecto aunque el celular esté en modo oscuro', () => {
    sistemaOscuro(true)
    expect(leerTema()).toBe('claro')
    aplicarTema()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('recuerda oscuro y en automático sigue al celular', () => {
    sistemaOscuro(true)
    guardarTema('oscuro')
    expect(leerTema()).toBe('oscuro')
    expect(document.documentElement.dataset.theme).toBe('dark')

    sistemaOscuro(false)
    guardarTema('auto')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
