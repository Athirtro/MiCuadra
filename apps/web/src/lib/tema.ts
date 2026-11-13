/** Apariencia de la app. Claro por defecto: así se ve igual en todos los celulares. */
export type Tema = 'claro' | 'oscuro' | 'auto'

const CLAVE = 'micuadra.tema'
const consulta = () => matchMedia('(prefers-color-scheme: dark)')

export function leerTema(): Tema {
  try {
    const t = localStorage.getItem(CLAVE)
    return t === 'oscuro' || t === 'auto' ? t : 'claro'
  } catch {
    return 'claro'
  }
}

/** Pone `data-theme` en <html> (los tokens de styles.css lo leen) y el color de la barra del celular. */
export function aplicarTema(t: Tema = leerTema()): void {
  const oscuro = t === 'oscuro' || (t === 'auto' && consulta().matches)
  document.documentElement.dataset.theme = oscuro ? 'dark' : 'light'
  document.querySelector<HTMLMetaElement>('meta[name=theme-color]')?.setAttribute('content', oscuro ? '#1A2620' : '#FFFFFF')
}

export function guardarTema(t: Tema): void {
  try {
    localStorage.setItem(CLAVE, t)
  } catch {
    // sin almacenamiento: vale solo por esta visita
  }
  aplicarTema(t)
}

/** En automático, sigue al celular si cambia de claro a oscuro con la app abierta. */
export function seguirSistema(): () => void {
  const alCambiar = () => {
    if (leerTema() === 'auto') aplicarTema('auto')
  }
  const q = consulta()
  q.addEventListener('change', alCambiar)
  return () => q.removeEventListener('change', alCambiar)
}
