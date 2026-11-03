import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ChangeEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { apiEnviar, apiGet, type Foto, type MiNegocio } from '../lib/api'
import { comprimirFoto } from '../lib/imagen'
import { usePerfil } from '../lib/sesion'
import { borrarArchivoFoto, subirFoto } from '../lib/supabase'
import { Cargando } from './Cuenta'

const MAX_FOTOS = 5

/** Fotos del negocio (SPEC §6.4 paso de fotos, máximo 5). */
export function FotosNegocio() {
  const { id = '' } = useParams()
  const { sesion, token, cargandoSesion } = usePerfil()
  const queryClient = useQueryClient()
  const entrada = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const negocios = useQuery({
    queryKey: ['mis-negocios', sesion?.user.id],
    queryFn: () => apiGet<MiNegocio[]>('/mis-negocios', undefined, token),
    enabled: Boolean(token),
  })
  const fotos = useQuery({
    queryKey: ['fotos', id],
    queryFn: () => apiGet<Foto[]>(`/mis-negocios/${id}/fotos`, undefined, token),
    enabled: Boolean(token),
  })
  const borrar = useMutation({
    mutationFn: async (f: Foto) => {
      await apiEnviar<null>('DELETE', `/mis-negocios/${id}/fotos/${f.orden}`, undefined, token)
      if (token) await borrarArchivoFoto(f.url, token)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['fotos', id] }),
  })

  if (cargandoSesion) return <Cargando />
  if (!sesion || !token) return <Navigate to="/entrar" replace />
  if (fotos.isPending) return <Cargando />
  if (fotos.isError) {
    return (
      <section className="mx-auto max-w-md px-4 py-10">
        <p role="alert" className="font-bold">
          {fotos.error.message}
        </p>
        <Link to="/cuenta" className="mt-3 inline-block font-bold text-green underline">
          Volver a mi cuenta
        </Link>
      </section>
    )
  }

  const nombre = negocios.data?.find((n) => n.id === id)?.nombre ?? 'tu negocio'
  const lista = fotos.data
  const espacio = MAX_FOTOS - lista.length

  async function elegir(e: ChangeEvent<HTMLInputElement>) {
    const archivos = [...(e.target.files ?? [])].slice(0, espacio)
    e.target.value = ''
    if (!archivos.length || !token) return
    setError(null)
    setSubiendo(archivos.length)
    try {
      for (const archivo of archivos) {
        const url = await subirFoto(id, await comprimirFoto(archivo), token)
        await apiEnviar<Foto>('POST', `/mis-negocios/${id}/fotos`, { url }, token)
        setSubiendo((n) => n - 1)
        await queryClient.invalidateQueries({ queryKey: ['fotos', id] })
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubiendo(0)
    }
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4 px-4 py-8">
      <div>
        <h1 className="text-2xl font-black">Fotos de {nombre}</h1>
        <p className="mt-1 text-muted">
          Hasta {MAX_FOTOS} fotos. La primera es la portada: muestra la fachada para que los vecinos te reconozcan.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-2">
        {lista.map((f, i) => (
          <li key={f.orden} className="relative overflow-hidden rounded-r border border-line bg-block">
            <img src={f.url} alt={`Foto ${i + 1} de ${nombre}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
            {i === 0 && <span className="absolute top-2 left-2 rounded bg-sun px-1.5 text-xs font-bold text-sun-ink">Portada</span>}
            <button
              type="button"
              disabled={borrar.isPending}
              onClick={() => borrar.mutate(f)}
              aria-label={`Quitar la foto ${i + 1}`}
              className="absolute top-1 right-1 grid size-11 place-items-center rounded-full bg-black/60 text-xl font-bold text-white"
            >
              ×
            </button>
          </li>
        ))}
        {Array.from({ length: subiendo }, (_, i) => (
          <li key={`subiendo-${i}`} className="grid aspect-[4/3] place-items-center rounded-r bg-block text-sm text-muted" role="status">
            Subiendo…
          </li>
        ))}
      </ul>

      {lista.length === 0 && !subiendo && <p className="text-muted">Todavía no hay fotos. Los negocios con fotos reciben más mensajes.</p>}
      {(error || borrar.isError) && (
        <p role="alert" className="text-sm font-bold text-red">
          {error ?? borrar.error?.message}
        </p>
      )}

      <input ref={entrada} type="file" accept="image/*" multiple hidden onChange={elegir} aria-label="Elegir fotos" />
      <button
        type="button"
        disabled={espacio <= 0 || subiendo > 0}
        onClick={() => entrada.current?.click()}
        className="tap rounded-r bg-green px-4 font-bold text-green-ink disabled:opacity-50"
      >
        {espacio <= 0 ? 'Ya tienes las 5 fotos' : subiendo ? 'Subiendo…' : '📷 Agregar fotos'}
      </button>
      <Link to="/cuenta" className="tap flex items-center justify-center rounded-r border border-line px-4 font-bold">
        Listo
      </Link>
    </section>
  )
}
