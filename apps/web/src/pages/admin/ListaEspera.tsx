import { useState } from 'react'
import { apiDescargar, type InscritoEspera } from '../../lib/api'
import { enlaceWhatsapp } from '../../lib/negocio'
import { Estado, fecha, Filtro, useAdminMutation, useAdminQuery, useToken } from './Admin'

type FiltroRol = InscritoEspera['rol'] | 'todos'
type FiltroContacto = 'todos' | 'false' | 'true'

const ROLES: { valor: FiltroRol; texto: string }[] = [
  { valor: 'todos', texto: 'Todos' },
  { valor: 'vecino', texto: 'Vecinos' },
  { valor: 'negocio', texto: 'Negocios' },
  { valor: 'mensajero', texto: 'Mensajeros' },
]
const CONTACTO: { valor: FiltroContacto; texto: string }[] = [
  { valor: 'todos', texto: 'Todos' },
  { valor: 'false', texto: 'Sin contactar' },
  { valor: 'true', texto: 'Contactados' },
]

export function ListaEsperaAdmin() {
  const token = useToken()
  const [rol, setRol] = useState<FiltroRol>('todos')
  const [contactado, setContactado] = useState<FiltroContacto>('todos')
  const [errorCsv, setErrorCsv] = useState<string | null>(null)
  const params = new URLSearchParams()
  if (rol !== 'todos') params.set('rol', rol)
  if (contactado !== 'todos') params.set('contactado', contactado)
  const lista = useAdminQuery<InscritoEspera[]>(`/lista-espera?${params}`)
  const marcar = useAdminMutation<{ id: string; contactado: boolean }>(
    'PATCH',
    (v) => `/lista-espera/${v.id}`,
    (v) => ({ contactado: v.contactado }),
  )

  async function exportar() {
    setErrorCsv(null)
    try {
      await apiDescargar(`/admin/lista-espera.csv?${params}`, 'lista-espera.csv', token)
    } catch (e) {
      setErrorCsv((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Filtro etiqueta="Rol" valor={rol} opciones={ROLES} onChange={setRol} />
        <Filtro etiqueta="Contacto" valor={contactado} opciones={CONTACTO} onChange={setContactado} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{lista.data?.length ?? 0} inscritos</p>
        <button type="button" onClick={exportar} className="tap rounded-caja border border-line bg-surface px-4 font-bold">
          Exportar CSV
        </button>
      </div>
      {errorCsv && (
        <p role="alert" className="text-sm font-bold text-red">
          {errorCsv}
        </p>
      )}
      <Estado cargando={lista.isPending} error={lista.error} vacio={lista.data?.length === 0}>
        <ul className="flex flex-col gap-2">
          {lista.data?.map((i) => (
            <li key={i.id} className="flex flex-col gap-1 tarjeta p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <p>
                  <span className="text-base font-bold">{i.nombre}</span>
                  <span className="ml-2 rounded bg-block px-1.5 text-xs font-bold">{i.rol}</span>
                </p>
                <p className="text-muted">
                  {i.barrio_texto} · {fecha(i.created_at)}
                  {i.negocio_nombre && ` · ${i.negocio_nombre} (${i.negocio_tipo})`}
                </p>
                {i.que_pediria && <p>Pediría: {i.que_pediria}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <a
                  href={enlaceWhatsapp(i.whatsapp, 'MiCuadra')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm font-bold text-green underline"
                >
                  {i.whatsapp}
                </a>
                <label className="tap flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={i.contactado}
                    disabled={marcar.isPending}
                    onChange={(e) => marcar.mutate({ id: i.id, contactado: e.target.checked })}
                    className="size-5 accent-[var(--green)]"
                  />
                  Contactado
                </label>
              </div>
            </li>
          ))}
        </ul>
      </Estado>
    </div>
  )
}
