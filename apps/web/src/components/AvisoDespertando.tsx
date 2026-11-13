import { useIsFetching } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

const ESPERA_MS = 4000

/**
 * El API (plan gratis de Render) se duerme tras un rato sin visitas y la primera consulta
 * tarda hasta un minuto. Si algo lleva más de 4 s cargando, se explica en vez de dejar la
 * pantalla quieta.
 */
export function AvisoDespertando() {
  const cargando = useIsFetching() > 0
  const [tardando, setTardando] = useState(false)

  useEffect(() => {
    if (!cargando) return
    const t = window.setTimeout(() => setTardando(true), ESPERA_MS)
    return () => {
      window.clearTimeout(t)
      setTardando(false)
    }
  }, [cargando])

  if (!cargando || !tardando) return null
  return (
    <div
      role="status"
      className="entra fixed inset-x-3 top-3 z-[2000] mx-auto flex max-w-md items-center gap-3 rounded-caja bg-surface p-3 text-sm shadow-2"
    >
      <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-green" aria-hidden="true" />
      <span>
        <span className="font-bold">Despertando MiCuadra…</span> La primera visita del rato puede tardar hasta un minuto.
      </span>
    </div>
  )
}
