import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KnowledgeGraph } from '../../lib/graph.ts'
import { createSearch } from '../../lib/search.ts'
import { Link, paths } from '../../router.tsx'
import { icon, inputClass, smallIcon } from '../forms/controls.ts'
import { useSpec } from '../SpecContext.tsx'
import { Status } from '../Status.tsx'
import { areaColour, GraphView } from './GraphView.tsx'
import { useKnowledgeGraph } from './useKnowledgeGraph.ts'

/** The knowledge graph in a dialog filling most of the window, for exploring. */
// SpecAI: UI-026, UI-029
export function GraphDialog(props: { initialSelected?: string; initialArea?: string; onClose: () => void }) {
  const { index } = useSpec()
  const kg = useKnowledgeGraph(index)
  const dialog = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState(props.initialSelected)
  const [area, setArea] = useState(props.initialSelected ? undefined : props.initialArea)
  // Choosing the same requirement or area again re-centres on it.
  const [focusKey, setFocusKey] = useState(0)

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (typeof el.showModal === 'function' && !el.open) el.showModal()
    else el.setAttribute('open', '')
    return () => el.close?.()
  }, [])

  const select = (id: string) => {
    setSelected(id)
    setArea(undefined)
    setFocusKey((k) => k + 1)
  }
  const showArea = (folder: string) => {
    setSelected(undefined)
    setArea(folder)
    setFocusKey((k) => k + 1)
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="graph-title"
      data-no-preview
      className="graph-dialog bg-paper text-ink border-rule m-auto h-[90vh] w-[94vw] max-w-none overflow-hidden rounded-lg border p-0 shadow-2xl backdrop:bg-black/50"
      onCancel={(e) => {
        e.preventDefault()
        props.onClose()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        props.onClose()
      }}
    >
      <div className="flex h-full flex-col">
        <header className="border-rule flex items-center gap-4 border-b px-4 py-3">
          <h2 id="graph-title" className="font-serif text-lg font-semibold whitespace-nowrap">Knowledge graph</h2>
          {kg && <Find kg={kg} onPick={select} />}
          <button type="button" className="text-muted hover:text-ink ml-auto rounded p-1.5" aria-label="Close" onClick={props.onClose}>
            <X {...icon} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="bg-surface relative min-h-64 flex-1">
            {kg ? (
              <GraphView
                kg={kg}
                selected={selected}
                area={area}
                interactive
                focusKey={String(focusKey)}
                label="Knowledge graph. Drag to pan, scroll to zoom, choose a point to select its requirement."
                onChoose={select}
                onChooseArea={showArea}
              />
            ) : (
              <p className="text-muted p-4 text-sm">Laying out the graph</p>
            )}
          </div>
          <div className="border-rule max-h-[45%] w-full shrink-0 overflow-y-auto border-t px-4 py-4 md:max-h-none md:w-80 md:border-t-0 md:border-l">
            {kg && selected && kg.positions.has(selected) ? (
              <Selected kg={kg} id={selected} onPick={select} onOpen={props.onClose} />
            ) : (
              <p className="text-muted text-sm">Choose a point, or find a requirement, to see what links to it.</p>
            )}
            {kg && <Legend kg={kg} area={area} onPick={showArea} />}
          </div>
        </div>
      </div>
    </dialog>
  )
}

function Selected({ kg, id, onPick, onOpen }: { kg: KnowledgeGraph; id: string; onPick: (id: string) => void; onOpen: () => void }) {
  const req = kg.nodes.find((n) => n.id === id)!.req
  const cluster = kg.clusters.find((c) => c.area === req.area)
  return (
    <section aria-label={`Selected: ${id}`} aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted font-mono text-sm">{id}</span>
        <Status status={req.status} />
      </div>
      <h3 className="mt-1 font-serif text-lg leading-snug font-semibold">{req.title}</h3>
      {cluster && <p className="text-muted mt-0.5 text-sm">{cluster.name}</p>}
      <Link href={paths.requirement(id)} className="text-accent mt-2 inline-block text-sm underline underline-offset-2" onClick={onOpen}>
        Open requirement
      </Link>
      <Neighbours kg={kg} title="Linked" ids={kg.linked.get(id) ?? []} empty="No links to or from other live requirements." onPick={onPick} />
      <Neighbours kg={kg} title="Closely related" ids={kg.related.get(id) ?? []} empty="None share rare glossary terms or components." onPick={onPick} />
    </section>
  )
}

function Neighbours(props: { kg: KnowledgeGraph; title: string; ids: string[]; empty: string; onPick: (id: string) => void }) {
  const { kg, title, ids, empty, onPick } = props
  const slot = new Map(kg.clusters.map((c) => [c.area, c.slot]))
  return (
    <>
      <h4 className="text-muted mt-5 text-xs font-semibold tracking-wide uppercase">
        {title} <span className="tabular-nums">{ids.length}</span>
      </h4>
      {ids.length === 0 ? (
        <p className="text-muted mt-1 text-sm">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-0.5" aria-label={title}>
          {ids.map((other) => {
            const n = kg.nodes.find((x) => x.id === other)!
            return (
              <li key={other}>
                <button type="button" className="hover:bg-accent-soft flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left text-sm" onClick={() => onPick(other)}>
                  <span aria-hidden className="inline-block size-2 shrink-0 self-center rounded-full" style={{ background: areaColour(slot.get(n.area) ?? -1) }} />
                  <span className="font-mono text-xs whitespace-nowrap">{other}</span>
                  <span className="min-w-0 truncate">{n.req.title}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function Legend({ kg, area, onPick }: { kg: KnowledgeGraph; area?: string; onPick: (area: string) => void }) {
  return (
    <section className="border-rule mt-6 border-t pt-4" aria-label="Areas">
      <h4 className="text-muted text-xs font-semibold tracking-wide uppercase">Areas</h4>
      <ul className="mt-1 space-y-0.5">
        {kg.clusters.map((c) => (
          <li key={c.area}>
            <button
              type="button"
              aria-pressed={c.area === area}
              className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm ${c.area === area ? 'bg-accent-soft font-medium' : 'hover:bg-accent-soft'}`}
              onClick={() => onPick(c.area)}
            >
              <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: areaColour(c.slot) }} />
              <span className="flex-1">{c.name}</span>
              <span className="text-muted text-xs tabular-nums">{c.ids.length}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Find({ kg, onPick }: { kg: KnowledgeGraph; onPick: (id: string) => void }) {
  const { index } = useSpec()
  const search = useMemo(() => createSearch(index), [index])
  const [q, setQ] = useState('')
  const matches = q.trim() ? search(q).filter((r) => kg.positions.has(r.id)).slice(0, 8) : []
  const pick = (id: string) => {
    setQ('')
    onPick(id)
  }
  return (
    <div className="relative w-full max-w-sm">
      <label>
        <span className="sr-only">Find a requirement</span>
        <Search {...smallIcon} className="text-muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) pick(matches[0].id)
            if (e.key === 'Escape' && q) {
              e.stopPropagation()
              e.preventDefault()
              setQ('')
            }
          }}
          placeholder="Find a requirement by ID or title"
          className={`${inputClass} py-1.5 pl-8 text-sm`}
        />
      </label>
      {matches.length > 0 && (
        <ul aria-label="Matches" className="border-rule bg-surface absolute z-20 mt-1 w-full overflow-hidden rounded-md border shadow-lg">
          {matches.map((r) => (
            <li key={r.id}>
              <button type="button" className="hover:bg-accent-soft flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm" onClick={() => pick(r.id)}>
                <span className="font-mono text-xs">{r.id}</span>
                <span className="min-w-0 truncate">{r.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
