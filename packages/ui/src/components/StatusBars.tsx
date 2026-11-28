import { statusOrder } from '../lib/filters.ts'
import { Link } from '../router.tsx'
import type { Status } from '../types.ts'
import { useSpec } from './SpecContext.tsx'

const labels: Record<string, string> = { draft: 'Draft', proposed: 'Proposed', approved: 'Approved', deprecated: 'Deprecated', removed: 'Removed' }

/** A status's fill: its colour, hatched for deprecated and removed so they never rely on colour alone. */
const fill = (status: string) =>
  status === 'deprecated' || status === 'removed'
    ? `repeating-linear-gradient(135deg, var(--s-${status}) 0 2px, transparent 2px 4px), color-mix(in srgb, var(--s-${status}) 35%, transparent)`
    : `var(--s-${status})`

/** How many items have each status, in status order, leaving out statuses no item has. */
export function statusCounts(statuses: Status[]): { status: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const s of statuses) counts.set(s, (counts.get(s) ?? 0) + 1)
  return statusOrder.filter((s) => counts.has(s)).map((status) => ({ status, count: counts.get(status)! }))
}

/** The navigation's two bars: requirements and test definitions, split by status. */
// SpecAI: UI-034
export function StatusBars() {
  const { index } = useSpec()
  const tests = index.requirements.flatMap((r) => (r.tests ?? []).map((t) => t.status))
  return (
    <div className="space-y-4 px-2" data-no-preview>
      <StatusBar title="Requirements" noun={['requirement', 'requirements']} counts={statusCounts(index.requirements.map((r) => r.status))} link={(s) => `/?status=${s}`} />
      <StatusBar title="Test definitions" noun={['test definition', 'test definitions']} counts={statusCounts(tests)} />
    </div>
  )
}

function StatusBar(props: { title: string; noun: [string, string]; counts: { status: string; count: number }[]; link?: (status: string) => string }) {
  const { title, noun, counts, link } = props
  const total = counts.reduce((n, c) => n + c.count, 0)
  const describe = (c: { status: string; count: number }) => `${labels[c.status]}: ${c.count} of ${total} (${Math.round((c.count / total) * 100)}%)`
  const summary = `${title} by status: ${counts.map((c) => `${c.count} ${labels[c.status].toLowerCase()}`).join(', ')}`
  return (
    <section aria-label={title}>
      <h2 className="text-muted flex items-baseline justify-between text-xs font-semibold">
        {title}
        <span className="font-normal tabular-nums" aria-label={total === 1 ? `1 ${noun[0]}` : `${total} ${noun[1]}`}>{total}</span>
      </h2>
      {total === 0 ? (
        <p className="text-muted mt-1 text-xs">None yet.</p>
      ) : (
        <>
          <div role="img" aria-label={summary} className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded">
            {counts.map((c) => {
              const segment = { className: 'h-full min-w-0.5 first:rounded-l last:rounded-r', style: { flexGrow: c.count, flexBasis: 0, background: fill(c.status) }, title: describe(c) }
              return link ? <Link key={c.status} href={link(c.status)} aria-hidden tabIndex={-1} {...segment} /> : <span key={c.status} {...segment} />
            })}
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs" aria-label={`${title} by status`}>
            {counts.map((c) => {
              const inner = (
                <>
                  <span aria-hidden className="inline-block size-2 rounded-sm" style={{ background: fill(c.status) }} />
                  <span>{labels[c.status]}</span>
                  <span className="text-muted tabular-nums">{c.count}</span>
                </>
              )
              return (
                <li key={c.status}>
                  {link ? (
                    <Link href={link(c.status)} className="hover:text-ink text-ink inline-flex items-center gap-1 hover:underline" title={describe(c)}>{inner}</Link>
                  ) : (
                    <span className="text-ink inline-flex items-center gap-1" title={describe(c)}>{inner}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
