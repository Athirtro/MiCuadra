import { useEffect, useRef, type ReactNode } from 'react'

/** `<dialog>` modal que se abre al montarse y avisa `alCerrar` con Escape o el fondo. */
export function Dialogo({ titulo, alCerrar, children }: { titulo: string; alCerrar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    // Sin cleanup que llame close(): dispararía onClose y cerraría el modal recién abierto
    // (StrictMode monta los efectos dos veces). El <dialog> sale del DOM al desmontarse.
    const dialogo = ref.current
    if (dialogo && !dialogo.open) dialogo.showModal?.()
  }, [])

  return (
    <dialog
      ref={ref}
      onClose={alCerrar}
      aria-label={titulo}
      className="m-auto w-[min(92vw,26rem)] rounded-caja bg-surface p-6 text-ink shadow-2xl backdrop:bg-black/50"
    >
      {children}
    </dialog>
  )
}
