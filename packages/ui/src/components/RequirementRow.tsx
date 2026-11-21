import { implementationLabels } from '../lib/filters.ts'
import { Link, paths } from '../router.tsx'
import { useSpec } from './SpecContext.tsx'
import type { IndexedRequirement } from '../types.ts'
import { Status } from './Status.tsx'
import { Text } from './Text.tsx'

/** One requirement in a list. `list` is the list's search, filters and grouping, as a URL query. */
export function RequirementRow({ req, list = '' }: { req: IndexedRequirement; list?: string }) {
  const { index } = useSpec()
  const tests = req.tests?.length ?? 0
  const trace = index.trace
  const linked = trace ? (req.tests ?? []).filter((t) => trace.links[t.id]?.length).length : 0
  const testText = tests === 0 ? 'No tests' : trace ? `${linked} of ${tests} ${tests === 1 ? 'test' : 'tests'} in code` : tests === 1 ? '1 test' : `${tests} tests`
  return (
    <li className="border-rule border-b last:border-b-0" data-no-preview>
      <Link href={paths.requirement(req.id) + list} className="group grid grid-cols-[5.5rem_1fr] gap-x-4 px-1 py-3 sm:grid-cols-[6.5rem_1fr_auto]">
        <span className="text-muted pt-0.5 text-sm font-medium tabular-nums">{req.id}</span>
        <span className="min-w-0">
          <span className="block font-medium group-hover:underline group-hover:underline-offset-2">{req.title}</span>
          <span className="text-muted mt-0.5 line-clamp-2 block font-serif leading-snug">
            <Text text={req.statement} links={false} />
          </span>
        </span>
        <span className="col-start-2 mt-1.5 flex items-center gap-3 sm:col-start-3 sm:mt-0 sm:flex-col sm:items-end sm:gap-1">
          <Status status={req.status} />
          <span className={`text-xs ${trace && tests > 0 && linked < tests ? 'text-warn' : 'text-muted'}`}>{testText}</span>
          {trace?.implementation && trace.implementation[req.id] !== 'implemented' && (
            <span className={`text-xs ${trace.implementation[req.id] === 'unimplemented' ? 'text-warn' : 'text-muted'}`}>{implementationLabels[trace.implementation[req.id]]}</span>
          )}
        </span>
      </Link>
    </li>
  )
}
