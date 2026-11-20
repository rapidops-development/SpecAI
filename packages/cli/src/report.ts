import type { Diagnostic } from './diagnostic.ts'
import type { Requirement } from './model.ts'
import type { ImpactResult } from './impact.ts'
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
const implementationLabel = { implemented: 'implemented', planned: 'planned', unimplemented: 'not implemented' }
const implementationWidth = Math.max(...Object.values(implementationLabel).map((l) => l.length))

/** Approved requirements with no implementation annotation and no issues. */
export function unimplementedApproved(requirements: Requirement[], result: TraceResult): Requirement[] {
  return requirements.filter((r) => r.status === 'approved' && result.implementation[r.id] === 'unimplemented')
}

export function formatTrace(requirements: Requirement[], result: TraceResult): string {
  const lines: string[] = []
  const width = Math.max(0, ...requirements.map((r) => r.id.length))
  for (const req of requirements) {
    const tests = (req.tests ?? []).filter((t) => t.status !== 'deprecated' && t.status !== 'removed')
    const linked = tests.filter((t) => result.links[t.id]?.length).length
    const counts = tests.length ? `  ${linked}/${tests.length} test definitions linked` : ''
    const implemented = implementationLabel[result.implementation[req.id]].padEnd(implementationWidth)
    lines.push(`${req.id.padEnd(width)}  ${req.status.padEnd(10)}  ${implemented}  ${coverageLabel[result.coverage[req.id]]}${counts}`)
  }
  if (result.unknown.length > 0) {
    lines.push('', 'error: test code names test definitions that do not exist:')
    for (const l of result.unknown) lines.push(`  ${l.file}:${l.line}  ${l.testId}`)
  }
  const duplicates = Object.entries(result.duplicates)
  if (duplicates.length > 0) {
    lines.push('', 'error: test definitions named by more than one test; each needs exactly one:')
    for (const [id, links] of duplicates) lines.push(`  ${id}  ${links.map((l) => `${l.file}:${l.line}`).join(', ')}`)
  }
  if (result.multiple.length > 0) {
    lines.push('', 'error: tests naming more than one test definition; each test implements exactly one:')
    for (const m of result.multiple) lines.push(`  ${m.file}:${m.line}  ${m.testIds.join(', ')}`)
  }
  if (result.unknownAnnotations.length > 0) {
    lines.push('', 'error: implementation annotations name requirements that do not exist:')
    for (const a of result.unknownAnnotations) lines.push(`  ${a.file}:${a.line}  ${a.requirementId}`)
  }
  if (result.badAnnotations.length > 0) {
    lines.push('', 'error: implementation annotations must name requirement IDs, separated by commas:')
    for (const b of result.badAnnotations) {
      const why = b.reason === 'test-definition' ? 'a test definition ID; tests link to test definitions, code links to requirements' : 'not a requirement ID'
      lines.push(`  ${b.file}:${b.line}  ${JSON.stringify(b.text)} is ${why}`)
    }
  }
  if (result.misplaced.length > 0) {
    lines.push('', "warning: test code in a component its requirement does not list, so it is not counted:")
    for (const l of result.misplaced) lines.push(`  ${l.file}:${l.line}  ${l.testId} (${l.requirement} lists ${l.components.join(', ')})`)
  }
  if (result.misplacedAnnotations.length > 0) {
    lines.push('', 'warning: implementation annotations in a component their requirement does not list, so not counted:')
    for (const a of result.misplacedAnnotations) lines.push(`  ${a.file}:${a.line}  ${a.requirementId} (lists ${a.components.join(', ')})`)
  }
  if (result.removedAnnotations.length > 0) {
    lines.push('', 'warning: implementation annotations name removed requirements, which should no longer have code:')
    for (const a of result.removedAnnotations) lines.push(`  ${a.file}:${a.line}  ${a.requirementId}`)
  }
  const unimplemented = unimplementedApproved(requirements, result)
  if (unimplemented.length > 0) {
    lines.push('', 'warning: approved requirements with no implementation annotation and no issues:')
    for (const r of unimplemented) lines.push(`  ${r.id}  ${r.title}`)
  }
  if (result.missing.length > 0) {
    lines.push('', `warning: no checkout found in ${result.checkouts} for:`)
    for (const m of result.missing) lines.push(`  ${m.component} (expected at ${m.path})`)
  }
  const untagged = Object.entries(result.untagged).filter(([, tests]) => tests.length > 0)
  if (untagged.length > 0) {
    lines.push('', 'Tests naming no test definition, by component (found by pattern matching, so a guide, not a count):')
    for (const [component, tests] of untagged) {
      lines.push(`  ${component}: ${plural(tests.length, 'test')}`)
      for (const t of tests) lines.push(`    ${t.file}:${t.line}  ${t.name}`)
    }
  }
  const approved = requirements.filter((r) => r.status === 'approved')
  const covered = approved.filter((r) => result.coverage[r.id] === 'covered').length
  const implemented = approved.filter((r) => result.implementation[r.id] === 'implemented').length
  const planned = approved.filter((r) => result.implementation[r.id] === 'planned').length
  lines.push('', `${covered} of ${plural(approved.length, 'approved requirement')} covered`)
  lines.push(`${implemented} of ${plural(approved.length, 'approved requirement')} implemented, ${planned} planned`)
  return lines.join('\n')
}

export function formatImpact(result: ImpactResult): string {
  const lines: string[] = []
  if (result.requirements.length === 0) lines.push(`No requirements are named in files changed since ${result.since}`)
  else lines.push(`Requirements named in files changed since ${result.since}:`)
  for (const req of result.requirements) {
    lines.push('', `${req.id}  ${req.status}  ${req.title}`)
    for (const p of req.places) {
      const what = p.kind === 'test' ? `test            ${p.file}:${p.line}  ${p.testId}` : `implementation  ${p.file}:${p.line}`
      lines.push(`  ${what}${p.removed ? '  (removed)' : ''}`)
    }
  }
  if (result.skipped.length > 0) {
    lines.push('', 'warning: components not compared:')
    for (const s of result.skipped) lines.push(`  ${s.component}: ${s.reason}`)
  }
  return lines.join('\n')
}
