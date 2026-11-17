import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { inject } from '@vercel/analytics'
import { injectSpeedInsights } from '@vercel/speed-insights'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { noRastrear } from './lib/eventos'
import { ProveedorSesion } from './lib/sesion'
import { aplicarTema, seguirSistema } from './lib/tema'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
})

// La app instalada se actualiza sola: al publicar una versión nueva, el service worker la baja,
// toma el control y la página se recarga. Además revisa cada hora y al volver a la app.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (!registro) return
    const revisar = () => void registro.update().catch(() => undefined)
    setInterval(revisar, 60 * 60_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') revisar()
    })
  },
})

aplicarTema()
seguirSistema()

// Métricas de Vercel (visitas por página y velocidad real). Sin cookies; se manda solo la ruta, sin
// parámetros ni fragmento (ahí pueden ir códigos de inicio de sesión), y nada si el navegador pide
// no rastrear. Solo corre en el sitio publicado en Vercel.
const sinDatos = <T extends { url: string }>(evento: T): T | null => {
  if (noRastrear()) return null
  const url = new URL(evento.url)
  return { ...evento, url: url.origin + url.pathname }
}
inject({ beforeSend: sinDatos })
injectSpeedInsights({ beforeSend: sinDatos })

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Falta el elemento #root en index.html')

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ProveedorSesion>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ProveedorSesion>
    </QueryClientProvider>
  </StrictMode>,
)
