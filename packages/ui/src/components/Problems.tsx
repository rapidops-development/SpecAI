import { OctagonAlert, TriangleAlert } from 'lucide-react'
import { Link, paths } from '../router.tsx'
import type { Diagnostic } from '../types.ts'
import { smallIcon } from './forms/controls.ts'

export function ProblemList({ diagnostics, showFile = true }: { diagnostics: Diagnostic[]; showFile?: boolean }) {
  return (
    <ul className="border-rule bg-surface divide-rule divide-y rounded-md border">
      {diagnostics.map((d, i) => (
        <li key={i} className="flex gap-3 px-4 py-2.5 text-sm">
          <span className={`inline-flex shrink-0 items-center gap-1.5 self-start font-semibold ${d.severity === 'error' ? 'text-danger' : 'text-warn'}`}>
            {d.severity === 'error' ? <OctagonAlert {...smallIcon} /> : <TriangleAlert {...smallIcon} />}
            {d.severity === 'error' ? 'Error' : 'Warning'}
          </span>
          <span className="min-w-0">
            {showFile && (
              <span className="text-muted block break-all">
                {d.file.endsWith('.yaml') ? <Link href={paths.file(d.file)} className="hover:text-ink underline underline-offset-2" title="Edit this file's YAML">{d.file}</Link> : d.file}
                {d.line ? `:${d.line}` : ''}
              </span>
            )}
            <span>
              {[d.id, d.field].filter(Boolean).join(' ')}
              {(d.id || d.field) && ': '}
              {d.message}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
