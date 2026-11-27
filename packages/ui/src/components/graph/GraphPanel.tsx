import { Maximize2 } from 'lucide-react'
import { useState } from 'react'
import { navigate, paths, type Route } from '../../router.tsx'
import { smallIcon } from '../forms/controls.ts'
import { useSpec } from '../SpecContext.tsx'
import { GraphDialog } from './GraphDialog.tsx'
import { GraphView } from './GraphView.tsx'
import { useKnowledgeGraph } from './useKnowledgeGraph.ts'

/** The requirement or area a page is about, for the graph to centre on. */
export function graphFocus(route: Route): { selected?: string; area?: string } {
  if (route.page === 'requirement' || route.page === 'edit-requirement') return { selected: route.id }
  if (route.page === 'area' || route.page === 'new-requirement') return { area: route.folder }
  return {}
}

/** The small knowledge graph at the foot of a requirement page's details, centred on the requirement. */
// SpecAI: UI-026
export function GraphPanel({ id }: { id: string }) {
  const { index } = useSpec()
  const kg = useKnowledgeGraph(index)
  const [expanded, setExpanded] = useState(false)
  const shown = kg?.positions.has(id) ? id : undefined
  const links = shown ? kg!.linked.get(shown)!.length : 0
  const req = index.requirements.find((r) => r.id === id)
  const caption =
    !kg ? 'Laying out the graph'
    : !shown ? `${id} is ${req?.status ?? 'unknown'}, so the graph leaves it out.`
    : `${id} and ${links === 1 ? '1 linked requirement' : `${links} linked requirements`}`

  return (
    <section aria-label="Knowledge graph" data-no-preview>
      <div className="flex items-center justify-between">
        <h2 className="text-muted font-medium">Knowledge graph</h2>
        <button type="button" className="text-muted hover:text-ink -mr-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5" onClick={() => setExpanded(true)}>
          <Maximize2 {...smallIcon} />
          Expand
        </button>
      </div>
      <div className="border-rule bg-surface mt-2 aspect-square w-full overflow-hidden rounded-md border">
        {kg && (
          <GraphView
            kg={kg}
            selected={shown}
            label="Knowledge graph. Choose a point to open its requirement."
            onChoose={(other) => navigate(paths.requirement(other))}
            onChooseArea={(folder) => navigate(paths.area(folder))}
          />
        )}
      </div>
      <p className="text-muted mt-1.5 text-xs" aria-live="polite">{caption}</p>
      {expanded && <GraphDialog initialSelected={id} onClose={() => setExpanded(false)} />}
    </section>
  )
}
