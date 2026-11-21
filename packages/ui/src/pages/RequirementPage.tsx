import { ChevronLeft, ChevronRight, OctagonAlert, Pencil } from 'lucide-react'
import { useMemo } from 'react'
import { Markdown } from '../components/Markdown.tsx'
import { PageLinks } from '../components/PageLinks.tsx'
import { ProblemList } from '../components/Problems.tsx'
import { useSpec } from '../components/SpecContext.tsx'
import { buttonClass, smallIcon } from '../components/forms/controls.ts'
import { Status } from '../components/Status.tsx'
import { StatusButtons } from '../components/StatusButtons.tsx'
import { Text } from '../components/Text.tsx'
import { Link, paths } from '../router.tsx'
import { coverageLabels, implementationLabels } from '../lib/filters.ts'
import { issueHref } from '../lib/issues.ts'
import { createSearch } from '../lib/search.ts'
import { neighbours } from '../lib/sequence.ts'
import type { IndexedRequirement, TestDefinition } from '../types.ts'

export function RequirementPage({ id, search = '' }: { id: string; search?: string }) {
  const { index } = useSpec()
  const req = index.requirements.find((r) => r.id === id)
  if (!req) return <Missing what={`requirement ${id}`} />
  const area = index.areas.find((a) => a.folder === req.area)
  const problems = index.diagnostics.filter((d) => d.file === req.file)
  const tests = req.tests ?? []

  return (
    <article className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0">
        <header>
          <p className="text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-ink font-semibold tabular-nums">{req.id}</span>
            <Status status={req.status} />
            {area && <Link href={paths.area(area.folder)} className="hover:underline">{area.name}</Link>}
            <Stepper id={req.id} search={search} />
          </p>
          <h1 className="mt-2 font-serif text-3xl leading-tight font-semibold text-balance">{req.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href={paths.editRequirement(req.id)} className={buttonClass}><Pencil {...smallIcon} />Edit</Link>
            <StatusButtons req={req} />
          </div>
        </header>

        <p className="mt-6 font-serif text-[1.4rem] leading-[1.45] text-pretty">
          <Text text={req.statement} ears />
        </p>

        {problems.length > 0 && (
          <section className="mt-6" aria-label="Problems in this file">
            <ProblemList diagnostics={problems} showFile={false} />
          </section>
        )}

        {req.acceptance && (
          <section className="mt-8">
            <h2 className="font-serif text-lg font-semibold">Acceptance criteria</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 font-serif leading-relaxed">
              {req.acceptance.map((a, i) => <li key={i}><Text text={a} /></li>)}
            </ul>
          </section>
        )}

        {req.rationale && (
          <section className="mt-8">
            <h2 className="font-serif text-lg font-semibold">Why</h2>
            <Markdown source={req.rationale} className="mt-2" />
          </section>
        )}

        <Implementation req={req} />

        <section className="mt-10">
          <h2 className="font-serif text-lg font-semibold">
            Tests <span className="text-muted font-sans text-sm font-normal tabular-nums">{tests.length}</span>
          </h2>
          {tests.length === 0 ? (
            <p className="text-muted mt-2">
              No test definitions yet. <Link href={paths.editRequirement(req.id)} className="text-accent underline underline-offset-2">Add one</Link> to say how this requirement is checked.
            </p>
          ) : (
            <ol className="mt-4 space-y-8">{tests.map((t) => <TestCard key={t.id} req={req} test={t} />)}</ol>
          )}
        </section>

        {req.notes && (
          <section className="mt-10">
            <h2 className="font-serif text-lg font-semibold">Notes</h2>
            <Markdown source={req.notes} className="mt-2" />
          </section>
        )}
      </div>

      <aside className="space-y-6 text-sm lg:pt-2">
        {index.trace?.implementation && (
          <Facts title="Implementation">
            <Link href={`/?implementation=${index.trace.implementation[req.id]}`} className="hover:underline">{implementationLabels[index.trace.implementation[req.id]]}</Link>
          </Facts>
        )}
        {req.issues && req.issues.length > 0 && (
          <Facts title="Issues">
            <ul className="space-y-1">
              {req.issues.map((issue) => {
                const href = issueHref(issue, index.config?.issueUrl)
                return <li key={issue} className="break-all">{href ? <a href={href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">{issue}</a> : issue}</li>
              })}
            </ul>
          </Facts>
        )}
        {index.trace && (
          <Facts title="Coverage">
            <Link href={`/?coverage=${index.trace.coverage[req.id]}`} className="hover:underline">{coverageLabels[index.trace.coverage[req.id]]}</Link>
          </Facts>
        )}
        {req.components && req.components.length > 0 && (
          <Facts title="Components">
            <ul className="space-y-1">{req.components.map((c) => <li key={c}>{c}</li>)}</ul>
          </Facts>
        )}
        {req.tags && req.tags.length > 0 && (
          <Facts title="Tags">
            <ul className="flex flex-wrap gap-1.5">
              {req.tags.map((t) => (
                <li key={t}>
                  <Link href={`/?tag=${encodeURIComponent(t)}`} className="border-rule bg-surface rounded-full border px-2 py-0.5 hover:border-[var(--accent)]">{t}</Link>
                </li>
              ))}
            </ul>
          </Facts>
        )}
        {req.parent && <Facts title="Refines"><PageLinks keys={[req.parent]} /></Facts>}
        {index.children[req.id] && <Facts title="Refined by"><PageLinks keys={index.children[req.id]} /></Facts>}
        {req.related && <Facts title="Related"><PageLinks keys={req.related} /></Facts>}
        <Facts title="Linked from"><PageLinks keys={index.backlinks[req.id] ?? []} empty="Nothing links here yet." /></Facts>
        <Facts title="File"><code className="text-muted break-all">{req.file}</code></Facts>
      </aside>
    </article>
  )
}

/**
 * Previous and next links through the list the requirement was opened from, which the URL's search
 * carries. They keep that search, so stepping stays in the same list.
 */
// SpecAI: UI-021
export function Stepper({ id, search }: { id: string; search: string }) {
  const { index } = useSpec()
  const runSearch = useMemo(() => createSearch(index), [index])
  const { previous, next, position, total } = neighbours(index, runSearch, search, id)
  const step = 'border-rule bg-surface text-ink inline-flex items-center rounded-md border p-1 hover:border-[var(--accent)]'
  const off = 'border-rule text-muted inline-flex items-center rounded-md border p-1 opacity-40'
  return (
    <nav aria-label="Requirements in this list" className="ml-auto flex items-center gap-2">
      <Link href={`/${search}`} className="tabular-nums hover:underline" title="Back to the list">
        {position ? `${position} of ${total}` : `Not in this list of ${total}`}
      </Link>
      {previous
        ? <Link href={paths.requirement(previous.id) + search} className={step} title={`Previous: ${previous.id} ${previous.title}`} aria-label={`Previous: ${previous.id}`}><ChevronLeft {...smallIcon} /></Link>
        : <span className={off} aria-hidden><ChevronLeft {...smallIcon} /></span>}
      {next
        ? <Link href={paths.requirement(next.id) + search} className={step} title={`Next: ${next.id} ${next.title}`} aria-label={`Next: ${next.id}`}><ChevronRight {...smallIcon} /></Link>
        : <span className={off} aria-hidden><ChevronRight {...smallIcon} /></span>}
    </nav>
  )
}

function TestCard({ req, test }: { req: IndexedRequirement; test: TestDefinition }) {
  const level = test.level === 'e2e' ? 'End to end' : test.level[0].toUpperCase() + test.level.slice(1)
  return (
    <li id={test.id} className="scroll-mt-6 border-l-2 py-1 pl-5" style={{ borderColor: `var(--s-${test.status})` }}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-muted text-sm font-medium tabular-nums">{test.id}</span>
        <h3 className="font-medium">{test.title}</h3>
        <span className="ml-auto flex items-center gap-3">
          <span className="text-muted text-xs">{level}</span>
          <Status status={test.status} />
        </span>
      </header>
      <ol className="mt-3 font-serif leading-snug">
        {test.given && <Clause label="Given" items={test.given} />}
        <Clause label="When" items={[test.when]} />
        <Clause label="Then" items={test.then} last />
      </ol>
      {test.notes && <Markdown source={test.notes} className="text-muted mt-2 text-sm" />}
      <TestCode testId={test.id} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusButtons req={req} testId={test.id} small />
        <Link href={`${paths.editRequirement(req.id)}#tests`} className="text-muted hover:text-ink ml-auto inline-flex items-center gap-1 text-sm underline underline-offset-2"><Pencil {...smallIcon} />Edit tests</Link>
      </div>
    </li>
  )
}

/**
 * Where code names this requirement in an implementation annotation, when the server scanned the
 * component checkouts. Implemented by is a different fact from tested by, so it has its own section.
 */
// SpecAI: UI-019
export function Implementation({ req }: { req: IndexedRequirement }) {
  const { index } = useSpec()
  const places = index.trace?.implementations?.[req.id]
  if (!places) return null
  return (
    <section className="mt-10">
      <h2 className="font-serif text-lg font-semibold">
        Implemented by <span className="text-muted font-sans text-sm font-normal tabular-nums">{places.length}</span>
      </h2>
      {places.length === 0 ? (
        <p className={`mt-2 text-sm ${req.issues?.length ? 'text-muted' : 'text-warn'}`}>
          No code names {req.id} yet{req.issues?.length ? '; it is planned in the issues listed.' : '.'} Add <code>SpecAI: {req.id}</code> in a comment above the code that implements it.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {places.map((p) => <li key={`${p.file}:${p.line}`}><code className="break-all">{p.file}:{p.line}</code></li>)}
        </ul>
      )}
    </section>
  )
}

/**
 * Where test code names this test definition, when the server scanned the component checkouts.
 * Flags a test definition named by more than one test, since each needs exactly one.
 */
export function TestCode({ testId }: { testId: string }) {
  const { index } = useSpec()
  if (!index.trace) return null
  const links = index.trace.links[testId] ?? []
  if (links.length === 0) {
    return <p className="text-warn mt-3 text-sm">No test code names {testId} yet.</p>
  }
  return (
    <>
      <p className="text-muted mt-3 text-sm">
        In code at{' '}
        {links.map((l, i) => (
          <span key={`${l.file}:${l.line}`}>
            {i > 0 && ', '}
            <code className="inline break-all">{l.file}:{l.line}</code>
          </span>
        ))}
      </p>
      {links.length > 1 && (
        <p className="text-danger mt-1 inline-flex items-center gap-1.5 text-sm">
          <OctagonAlert {...smallIcon} />Named by {links.length} tests; each test definition needs exactly one.
        </p>
      )}
    </>
  )
}

/** One part of Given, When, Then. A thin line joins the parts, since they read in order. */
function Clause({ label, items, last = false }: { label: string; items: string[]; last?: boolean }) {
  return (
    <li className="grid grid-cols-[3.75rem_1fr] gap-x-3">
      <span className="relative font-sans text-sm font-medium text-[var(--muted)]">
        {label}
        {!last && <span aria-hidden="true" className="bg-rule absolute top-6 bottom-0 left-[0.55rem] w-px" />}
      </span>
      <ul className={`space-y-1 ${last ? '' : 'pb-3'}`}>{items.map((t, i) => <li key={i}><Text text={t} /></li>)}</ul>
    </li>
  )
}

function Facts({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-muted mb-1.5 font-medium">{title}</h2>
      {children}
    </section>
  )
}

export function Missing({ what }: { what: string }) {
  return (
    <div className="max-w-xl">
      <h1 className="font-serif text-2xl font-semibold">There is no {what}</h1>
      <p className="text-muted mt-2">
        It may have been renamed or removed on disk. <Link href="/" className="text-accent underline">Go to all requirements</Link>.
      </p>
    </div>
  )
}
