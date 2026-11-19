import { OctagonAlert, TriangleAlert } from 'lucide-react'
import { smallIcon } from '../components/forms/controls.ts'
import { ProblemList } from '../components/Problems.tsx'
import { useSpec } from '../components/SpecContext.tsx'

export function ProblemsPage() {
  const { index } = useSpec()
  const errors = index.diagnostics.filter((d) => d.severity === 'error').length
  const unknown = index.trace?.unknown ?? []
  const missing = index.trace?.missing ?? []
  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Problems</h1>
      {index.diagnostics.length === 0 ? (
        <p className="text-muted mt-3">Every spec file passes <code className="inline">specai validate</code>.</p>
      ) : (
        <>
          <p className="text-muted mt-2">
            {errors} {errors === 1 ? 'error' : 'errors'} and {index.diagnostics.length - errors} warnings from{' '}
            <code className="inline">specai validate</code>. Files with schema errors are left out of the other pages until fixed.
          </p>
          <div className="mt-5"><ProblemList diagnostics={index.diagnostics} /></div>
        </>
      )}
      {(unknown.length > 0 || missing.length > 0) && (
        <section className="mt-10">
          <h2 className="font-serif text-xl font-semibold">Test code</h2>
          <ul className="border-rule bg-surface divide-rule mt-3 divide-y rounded-md border text-sm">
            {unknown.map((l) => (
              <li key={`${l.file}:${l.line}`} className="flex gap-3 px-4 py-2.5">
                <span className="text-danger inline-flex shrink-0 items-center gap-1.5 self-start font-semibold"><OctagonAlert {...smallIcon} />Error</span>
                <span className="min-w-0"><code className="inline break-all">{l.file}:{l.line}</code> names {l.testId}, which no requirement has.</span>
              </li>
            ))}
            {missing.map((m) => (
              <li key={m.component} className="flex gap-3 px-4 py-2.5">
                <span className="text-warn inline-flex shrink-0 items-center gap-1.5 self-start font-semibold"><TriangleAlert {...smallIcon} />Warning</span>
                <span className="min-w-0">No checkout of {m.component} at <code className="inline break-all">{m.path}</code>, so its tests are not counted.</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
