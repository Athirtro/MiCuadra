import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Sin `globals: true`, Testing Library no limpia el DOM solo entre pruebas.
afterEach(cleanup)

// jsdom no implementa <dialog> modal.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open')
}

// Leaflet no funciona en jsdom: las pruebas de pantallas usan un mapa falso.
vi.mock('../components/MapaBarrio', () => ({
  MapaBarrio: ({ negocios }: { negocios: { nombre: string }[] }) => (
    <div data-testid="mapa">{negocios.length} pines</div>
  ),
  MiniMapa: () => <div data-testid="mini-mapa" />,
  SelectorUbicacion: ({ alCambiar }: { alCambiar: (p: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => alCambiar({ lat: 4.7985, lng: -75.7305 })}>
      Mover pin
    </button>
  ),
}))
