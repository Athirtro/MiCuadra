import { useState, type FormEvent } from 'react'
import type { Criterio, Entrevista, EntrevistaEntrada, Gate } from '../../lib/api'
import { Estado, fecha, useAdminMutation, useAdminQuery } from './Admin'

const SEMAFORO: Record<Criterio['estado'], { punto: string; texto: string }> = {
  verde: { punto: 'bg-green', texto: 'Cumple' },
  amarillo: { punto: 'bg-sun', texto: 'Va en camino' },
  rojo: { punto: 'bg-red', texto: 'Lejos' },
}

/** Tablero del gate (SPEC §9): los mandados se activan solo con los 6 criterios en verde. */
export function Metricas() {
  const gate = useAdminQuery<Gate>('/metricas')

  return (
    <div className="flex flex-col gap-6">
      <Estado cargando={gate.isPending} error={gate.error} vacio={false}>
        {gate.data && (
          <>
            <div
              className={`rounded-r p-4 font-bold ${gate.data.listo ? 'bg-green text-green-ink' : 'border border-line bg-surface'}`}
              role="status"
            >
              {gate.data.listo
                ? '✅ Se cumplen los 6 criterios: el equipo puede activar los mandados.'
                : `${gate.data.cumplidos} de 6 criterios cumplidos. Los mandados siguen apagados.`}
            </div>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {gate.data.criterios.map((c) => (
                <TarjetaCriterio key={c.id} c={c} />
              ))}
            </ul>
          </>
        )}
      </Estado>
      <Entrevistas />
    </div>
  )
}

function TarjetaCriterio({ c }: { c: Criterio }) {
  const s = SEMAFORO[c.estado]
  const maximo = Math.max(1, ...c.serie.map((p) => p.valor))
  return (
    <li className="flex flex-col gap-2 tarjeta p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-black">
          {c.id}. {c.nombre}
        </h2>
        <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold">
          <span className={`size-3 rounded-full ${s.punto}`} aria-hidden="true" />
          {s.texto}
        </span>
      </div>
      <p className="text-2xl font-black">{c.valor}</p>
      <p className="text-sm text-muted">Meta: {c.meta}</p>
      <div
        role="progressbar"
        aria-label={`Avance de ${c.nombre}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(c.progreso * 100)}
        className="h-2 overflow-hidden rounded-full bg-block"
      >
        <div className={`h-full rounded-full ${s.punto}`} style={{ width: `${c.progreso * 100}%` }} />
      </div>
      {c.serie.length > 0 && (
        <ol className="mt-1 flex h-16 items-end gap-1" aria-label={`Serie de ${c.nombre}`}>
          {c.serie.map((p) => (
            <li key={p.etiqueta} className="flex flex-1 flex-col items-center gap-0.5" title={`${p.etiqueta}: ${p.valor}`}>
              <span className="font-mono text-[10px]">{p.valor}</span>
              <span className="w-full rounded-t bg-green/60" style={{ height: `${Math.max(2, (36 * p.valor) / maximo)}px` }} />
              <span className="font-mono text-[10px] text-muted">{p.etiqueta === 'Esta semana' ? 'hoy' : p.etiqueta}</span>
            </li>
          ))}
        </ol>
      )}
      {c.detalle && <p className="text-xs text-muted">{c.detalle}</p>}
    </li>
  )
}

/** Criterio 4: el equipo registra aquí cada entrevista hecha en persona. */
function Entrevistas() {
  const lista = useAdminQuery<Entrevista[]>('/entrevistas')
  const [persona, setPersona] = useState('')
  const [barrio, setBarrio] = useState('')
  const [confirma, setConfirma] = useState(true)
  const [notas, setNotas] = useState('')
  const guardar = useAdminMutation<EntrevistaEntrada>('POST', () => '/entrevistas', (v) => v)

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (!persona.trim()) return
    guardar.mutate(
      { persona: persona.trim(), barrio_texto: barrio.trim() || null, confirma_intencion: confirma, notas: notas.trim() || null },
      {
        onSuccess: () => {
          setPersona('')
          setBarrio('')
          setNotas('')
          setConfirma(true)
        },
      },
    )
  }

  return (
    <section className="tarjeta p-4" aria-labelledby="titulo-entrevistas">
      <h2 id="titulo-entrevistas" className="text-lg font-black">
        Entrevistas
      </h2>
      <form onSubmit={enviar} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-bold">
          Persona (alias o primer nombre)
          <input
            required
            maxLength={80}
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            className="tap rounded-r border border-line bg-bg px-3 text-base font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Barrio
          <input
            maxLength={60}
            value={barrio}
            onChange={(e) => setBarrio(e.target.value)}
            className="tap rounded-r border border-line bg-bg px-3 text-base font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold sm:col-span-2">
          Notas
          <textarea
            maxLength={1000}
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="rounded-r border border-line bg-bg px-3 py-2 text-base font-normal"
          />
        </label>
        <label className="flex items-center gap-3 text-sm font-bold">
          <input type="checkbox" checked={confirma} onChange={(e) => setConfirma(e.target.checked)} className="size-5 accent-[var(--green)]" />
          Confirma que usaría los mandados
        </label>
        <button type="submit" disabled={guardar.isPending} className="tap rounded-r bg-green px-4 font-bold text-green-ink disabled:opacity-50">
          {guardar.isPending ? 'Guardando…' : 'Registrar entrevista'}
        </button>
        {guardar.isError && (
          <p role="alert" className="text-sm font-bold text-red sm:col-span-2">
            {guardar.error.message}
          </p>
        )}
      </form>

      <ul className="mt-4 flex flex-col divide-y divide-line">
        {lista.data?.map((e) => (
          <li key={e.id} className="py-2 text-sm">
            <span className="font-bold">{e.persona}</span>
            {e.barrio_texto && <span className="text-muted"> · {e.barrio_texto}</span>}
            <span className="text-muted"> · {fecha(e.created_at)}</span>
            <span className={`ml-2 rounded px-1.5 text-xs font-bold ${e.confirma_intencion ? 'bg-green text-green-ink' : 'bg-block'}`}>
              {e.confirma_intencion ? 'Confirma' : 'No confirma'}
            </span>
            {e.notas && <p className="text-muted">{e.notas}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
