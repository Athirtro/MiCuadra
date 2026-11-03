import { useEffect, useState } from 'react'

// Evento no estándar de Chrome/Edge/Android: permite mostrar nuestro propio botón de instalar.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function yaInstalada(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function esIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** Botón "Instalar app" (Android/escritorio) o instrucciones para iPhone, que no tiene prompt. */
export function InstalarApp() {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null)
  const [instalada, setInstalada] = useState(yaInstalada)

  useEffect(() => {
    const alOfrecer = (e: Event) => {
      e.preventDefault()
      setEvento(e as BeforeInstallPromptEvent)
    }
    const alInstalar = () => {
      setInstalada(true)
      setEvento(null)
    }
    window.addEventListener('beforeinstallprompt', alOfrecer)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alOfrecer)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [])

  if (instalada) return null

  if (evento) {
    return (
      <button
        type="button"
        className="tap inline-flex items-center justify-center gap-2 rounded-r bg-green px-5 font-bold text-green-ink"
        onClick={async () => {
          await evento.prompt()
          const { outcome } = await evento.userChoice
          if (outcome === 'accepted') setInstalada(true)
          setEvento(null)
        }}
      >
        Instalar app
      </button>
    )
  }

  if (esIOS()) {
    return (
      <p className="text-sm text-muted">
        Para tenerla como app en tu iPhone: toca <strong>Compartir</strong> y luego{' '}
        <strong>Agregar a inicio</strong>.
      </p>
    )
  }

  return null
}
