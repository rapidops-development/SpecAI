import type { Diagnostic } from './diagnostic.ts'
import type { Requirement } from './model.ts'
import type { TraceResult } from './trace.ts'

export function formatText(diagnostics: Diagnostic[], root: string, fileCount: number): string {
  const lines = diagnostics.map((d) => {
    const where = `${root}/${d.file}${d.line ? `:${d.line}` : ''}`
    const subject = [d.id, d.field].filter(Boolean).join(' ')
    return `${where}  ${d.severity} [${d.rule}] ${subject ? `${subject}: ` : ''}${d.message}`
  })
  const errors = diagnostics.filter((d) => d.severity === 'error').length
  const warnings = diagnostics.length - errors
  lines.push(`${plural(errors, 'error')}, ${plural(warnings, 'warning')} in ${plural(fileCount, 'file')}`)
  return lines.join('\n')
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

const coverageLabel = { covered: 'covered', partial: 'partly covered', uncovered: 'not covered', untested: 'no test definitions' }

export function formatTrace(requirements: Requirement[], result: TraceResult): string {
  const lines: string[] = []
  const width = Math.max(0, ...requirements.map((r) => r.id.length))
  for (const req of requirements) {
    const tests = (req.tests ?? []).filter((t) => t.status !== 'deprecated' && t.status !== 'removed')
    const linked = tests.filter((t) => result.links[t.id]?.length).length
    const counts = tests.length ? `  ${linked}/${tests.length} test definitions linked` : ''
    lines.push(`${req.id.padEnd(width)}  ${req.status.padEnd(10)}  ${coverageLabel[result.coverage[req.id]]}${counts}`)
  }
  if (result.unknown.length > 0) {
    lines.push('', 'error: test code names test definitions that do not exist:')
    for (const l of result.unknown) lines.push(`  ${l.file}:${l.line}  ${l.testId}`)
  }
  if (result.missing.length > 0) {
    lines.push('', `warning: no checkout found in ${result.checkouts} for:`)
    for (const m of result.missing) lines.push(`  ${m.component} (expected at ${m.path})`)
  }
  const approved = requirements.filter((r) => r.status === 'approved')
  const covered = approved.filter((r) => result.coverage[r.id] === 'covered').length
  lines.push('', `${covered} of ${plural(approved.length, 'approved requirement')} covered`)
  return lines.join('\n')
}
