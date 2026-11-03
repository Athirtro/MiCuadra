import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InstalarApp } from './InstalarApp'

describe('InstalarApp', () => {
  it('no muestra nada si el navegador no ofrece instalar', () => {
    const { container } = render(<InstalarApp />)
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el botón cuando el navegador ofrece instalar y abre el prompt', async () => {
    render(<InstalarApp />)
    const prompt = vi.fn().mockResolvedValue(undefined)
    const evento = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    act(() => {
      window.dispatchEvent(evento)
    })

    const boton = screen.getByRole('button', { name: 'Instalar app' })
    await act(async () => {
      fireEvent.click(boton)
    })
    expect(prompt).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument()
  })
})
