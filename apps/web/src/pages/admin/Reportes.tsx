import { useState } from 'react'
import { Link } from 'react-router'
import type { Reporte } from '../../lib/api'
import { Estado, fecha, Filtro, useAdminMutation, useAdminQuery } from './Admin'

const MOTIVOS: Record<string, string> = {
  cerro: 'Ya no existe o cerró',
  horario: 'Horario mal',
  ubicacion: 'Ubicación mal',
  contacto: 'WhatsApp o teléfono no sirven',
  otro: 'Otra cosa',
}

const ESTADOS: { valor: Reporte['estado']; texto: string }[] = [
  { valor: 'abierta', texto: 'Abiertos' },
  { valor: 'resuelta', texto: 'Resueltos' },
  { valor: 'descartada', texto: 'Descartados' },
]

/** Cola de moderación de "Reportar información incorrecta". */
export function Reportes() {
  const [estado, setEstado] = useState<Reporte['estado']>('abierta')
  const reportes = useAdminQuery<Reporte[]>(`/reportes?estado=${estado}`)
  const cambiar = useAdminMutation<{ id: string; estado: Reporte['estado'] }>(
    'PATCH',
    (v) => `/reportes/${v.id}`,
    (v) => ({ estado: v.estado }),
  )

  return (
    <div className="flex flex-col gap-4">
      <Filtro etiqueta="Estado" valor={estado} opciones={ESTADOS} onChange={setEstado} />
      <Estado cargando={reportes.isPending} error={reportes.error} vacio={reportes.data?.length === 0}>
        <ul className="flex flex-col gap-2">
          {reportes.data?.map((r) => (
            <li key={r.id} className="rounded-r border border-line bg-surface p-4">
              <p className="text-sm text-muted">{fecha(r.created_at)}</p>
              <p className="font-bold">
                <Link to={`/n/${r.negocio_slug}`} className="underline">
                  {r.negocio_nombre}
                </Link>
                : {MOTIVOS[r.motivo] ?? r.motivo}
              </p>
              {r.detalle && <p className="mt-1 text-sm">«{r.detalle}»</p>}
              {r.estado === 'abierta' && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={cambiar.isPending}
                    onClick={() => cambiar.mutate({ id: r.id, estado: 'resuelta' })}
                    className="tap rounded-r bg-green px-4 font-bold text-green-ink disabled:opacity-50"
                  >
                    Ya lo corregí
                  </button>
                  <button
                    type="button"
                    disabled={cambiar.isPending}
                    onClick={() => cambiar.mutate({ id: r.id, estado: 'descartada' })}
                    className="tap rounded-r border border-line px-4 font-bold disabled:opacity-50"
                  >
                    Descartar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Estado>
    </div>
  )
}
