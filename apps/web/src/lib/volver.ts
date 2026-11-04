/** Página a la que se vuelve después de entrar (p. ej. el perfil con el carrito a medias). */
const CLAVE = 'micuadra.volver'

export function guardarVolver(ruta: string): void {
  try {
    sessionStorage.setItem(CLAVE, ruta)
  } catch {
    // sin almacenamiento: después de entrar se va a la cuenta
  }
}

/** Ruta guardada, solo si es interna. No la borra: la borra `<Volver>` al navegar. */
export function leerVolver(): string | null {
  try {
    const ruta = sessionStorage.getItem(CLAVE)
    return ruta?.startsWith('/') && !ruta.startsWith('//') ? ruta : null
  } catch {
    return null
  }
}

export function olvidarVolver(): void {
  try {
    sessionStorage.removeItem(CLAVE)
  } catch {
    // nada que borrar
  }
}
