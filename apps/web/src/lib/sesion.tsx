import type { Session } from '@supabase/auth-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiGet, type Perfil } from './api'
import { auth, authDisponible } from './supabase'

interface EstadoSesion {
  sesion: Session | null
  cargando: boolean
  salir: () => Promise<void>
}

const ContextoSesion = createContext<EstadoSesion>({ sesion: null, cargando: false, salir: async () => {} })

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(authDisponible)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!authDisponible) return
    // onAuthStateChange avisa también la sesión inicial (INITIAL_SESSION), incluida la que
    // llega en la URL al volver de Google o del correo.
    const { data } = auth.onAuthStateChange((evento, nueva) => {
      setSesion(nueva)
      setCargando(false)
      if (evento === 'SIGNED_OUT') queryClient.removeQueries({ queryKey: ['yo'] })
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const salir = async () => {
    await auth.signOut()
    queryClient.removeQueries({ queryKey: ['yo'] })
    queryClient.removeQueries({ queryKey: ['mis-negocios'] })
  }

  return <ContextoSesion.Provider value={{ sesion, cargando, salir }}>{children}</ContextoSesion.Provider>
}

export function useSesion() {
  return useContext(ContextoSesion)
}

/** Perfil del usuario autenticado (null sin sesión). */
export function usePerfil() {
  const { sesion, cargando } = useSesion()
  const token = sesion?.access_token
  const perfil = useQuery({
    queryKey: ['yo', sesion?.user.id],
    queryFn: () => apiGet<Perfil>('/yo', undefined, token),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  })
  return { sesion, token, cargandoSesion: cargando, perfil }
}
