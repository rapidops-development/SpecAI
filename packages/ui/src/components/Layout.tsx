import { BookOpen, Folder, ListChecks, Network, TriangleAlert, Unplug } from 'lucide-react'
import { useState } from 'react'
import type { Connection } from '../api.ts'
import { Link, type Route } from '../router.tsx'
import { useSpec } from './SpecContext.tsx'
import { LinkPreview } from './LinkPreview.tsx'
import { StatusBars } from './StatusBars.tsx'
import { ThemeSwitch } from './ThemeSwitch.tsx'
import { icon, smallIcon } from './forms/controls.ts'
import { GraphDialog } from './graph/GraphDialog.tsx'
import { graphFocus } from './graph/GraphPanel.tsx'

export function Layout({ route, connection, children }: { route: Route; connection: Connection; children: React.ReactNode }) {
  const { index } = useSpec()
  const errors = index.diagnostics.filter((d) => d.severity === 'error').length + (index.trace?.unknown.length ?? 0)
  const warnings = index.diagnostics.length - index.diagnostics.filter((d) => d.severity === 'error').length + (index.trace?.missing.length ?? 0)
  const current = (match: boolean) => (match ? 'bg-accent-soft text-ink font-medium' : 'text-muted hover:text-ink')
  const item = 'flex items-center gap-2 rounded px-2 py-1.5 text-sm'
  const count = 'ml-auto pl-3 text-xs tabular-nums'
  const [graphOpen, setGraphOpen] = useState(false)
  const focus = graphFocus(route)

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <nav aria-label="Spec tree" data-no-preview className="border-rule flex shrink-0 flex-col border-b px-4 py-4 md:sticky md:top-0 md:h-screen md:w-60 md:overflow-y-auto md:border-r md:border-b-0 md:py-6">
        <Link href="/" className="block px-2 pb-4">
          <span className="font-serif text-lg font-semibold">{index.name}</span>
          <span className="text-muted block text-xs">{index.requirements.length} requirements</span>
        </Link>
        <ul className="flex flex-wrap gap-x-1 md:block md:space-y-0.5">
          <li>
            <Link href="/" className={`${item} ${current(route.page === 'list')}`}><ListChecks {...icon} />All requirements</Link>
          </li>
          {index.areas.map((area) => (
            <li key={area.folder}>
              <Link
                href={`/a/${encodeURIComponent(area.folder)}`}
                className={`${item} ${current((route.page === 'area' || route.page === 'new-requirement') && route.folder === area.folder)}`}
              >
                <Folder {...icon} />
                <span>{area.name}</span>
                <span className={count}>{area.requirementIds.length}</span>
              </Link>
            </li>
          ))}
          <li className="md:pt-3">
            <Link href="/glossary" className={`${item} ${current(route.page === 'glossary' || route.page === 'term' || route.page === 'edit-term' || route.page === 'new-term')}`}>
              <BookOpen {...icon} />
              <span>Glossary</span>
              <span className={count}>{index.terms.length}</span>
            </Link>
          </li>
          <li>
            <Link href="/problems" className={`${item} ${current(route.page === 'problems')}`}>
              <TriangleAlert {...icon} />
              <span>Problems</span>
              <span className={`${count} ${errors ? 'text-danger font-semibold' : warnings ? 'text-warn' : ''}`}>
                {errors + warnings}
              </span>
            </Link>
          </li>
          {/* SpecAI: UI-030 */}
          <li>
            <button type="button" className={`${item} ${current(graphOpen)} w-full`} onClick={() => setGraphOpen(true)}>
              <Network {...icon} />
              <span>Knowledge graph</span>
            </button>
          </li>
        </ul>
        <div className="mt-6 hidden md:block">
          <StatusBars />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-2 md:mt-auto md:flex-col md:items-center md:px-0 md:pt-6">
          <ThemeSwitch />
          {/* Say nothing while live; speak up only when the page may be out of date. */}
          <p className="text-warn inline-flex items-center gap-1.5 text-xs empty:hidden" role="status">
            {connection === 'reconnecting' && <><Unplug {...smallIcon} />Lost the server; reconnecting</>}
          </p>
        </div>
      </nav>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
      {graphOpen && <GraphDialog initialSelected={focus.selected} initialArea={focus.area} onClose={() => setGraphOpen(false)} />}
      <LinkPreview />
    </div>
  )
}
