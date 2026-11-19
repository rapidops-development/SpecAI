import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Requirement, RootConfig } from '../src/model.ts'
import { trace } from '../src/trace.ts'
import { writeTree } from './fixtures.ts'

const config: RootConfig = {
  specai: '0.1',
  areas: ['loans'],
  components: [{ name: 'Library.API' }, { name: 'Library.Web', path: 'web/app' }],
}

const test = (id: string, status: 'proposed' | 'deprecated' = 'proposed') => ({ id, title: id, status, level: 'unit' as const, when: 'x', then: ['y'] })
const req = (id: string, tests: string[], components = ['Library.API']): Requirement => ({
  specai: '0.1',
  id,
  title: id,
  status: 'approved',
  statement: 'The service shall work.',
  components,
  tests: tests.map((t) => test(t)),
})

function checkouts(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'specai-checkouts-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const xunit = `public class LoanTests
{
    [Fact]
    [Trait("SpecAI", "LOAN-001-T1")]
    public void SixthLoan_IsRefused() { }

    [Fact, Trait("SpecAI", "LOAN-009-T1")]
    public void Unknown() { }
}
`
// Built from parts, so this file does not itself name the IDs it scans for.
const id = (n: number) => ['LOAN', '002', `T${n}`].join('-')
const vitest = `describe('loans', () => {
  it('[${id(1)}] blocks overdue members', () => {})
  it.each([1, 2])('[${id(2)}] case %s', () => {})
})
`

describe('specai trace', () => {
  it('[CLI-007-T1] finds IDs in xUnit traits and Vitest test names, with file and line', () => {
    const dir = checkouts({ 'Library.API/tests/LoanTests.cs': xunit, 'web/app/src/loans.test.ts': vitest })
    const result = trace(config, [req('LOAN-001', ['LOAN-001-T1']), req('LOAN-002', ['LOAN-002-T1', 'LOAN-002-T2'], ['Library.Web'])], dir)
    expect(result.links['LOAN-001-T1']).toEqual([{ testId: 'LOAN-001-T1', file: 'Library.API/tests/LoanTests.cs', line: 4, framework: 'xunit' }])
    expect(result.links['LOAN-002-T2']).toEqual([{ testId: 'LOAN-002-T2', file: 'web/app/src/loans.test.ts', line: 3, framework: 'vitest' }])
  })

  it('[CLI-007-T2] reports test code naming unknown test definitions', () => {
    const dir = checkouts({ 'Library.API/tests/LoanTests.cs': xunit })
    expect(trace(config, [req('LOAN-001', ['LOAN-001-T1'])], dir).unknown).toMatchObject([{ testId: 'LOAN-009-T1', line: 7 }])
  })

  it('[CLI-008-T1] works out coverage from linked test definitions', () => {
    const dir = checkouts({ 'Library.API/tests/LoanTests.cs': xunit })
    const result = trace(
      config,
      [
        req('LOAN-001', ['LOAN-001-T1']),
        req('LOAN-003', ['LOAN-001-T1', 'LOAN-003-T2']),
        req('LOAN-004', ['LOAN-004-T1']),
        req('LOAN-005', []),
      ],
      dir,
    )
    expect(result.coverage).toEqual({ 'LOAN-001': 'covered', 'LOAN-003': 'partial', 'LOAN-004': 'uncovered', 'LOAN-005': 'untested' })
  })

  it('[CLI-008-T2] only counts test code in the requirement’s own components', () => {
    const dir = checkouts({ 'Library.API/tests/LoanTests.cs': xunit })
    expect(trace(config, [req('LOAN-001', ['LOAN-001-T1'], ['Library.Web'])], dir).coverage['LOAN-001']).toBe('uncovered')
  })

  it('does not count deprecated test definitions', () => {
    const dir = checkouts({ 'Library.API/tests/LoanTests.cs': xunit })
    const r = { ...req('LOAN-001', ['LOAN-001-T1']), tests: [test('LOAN-001-T1'), test('LOAN-001-T2', 'deprecated')] }
    expect(trace(config, [r], dir).coverage['LOAN-001']).toBe('covered')
  })

  it('ignores build output, dependencies and files that are not tests', () => {
    const dir = checkouts({
      'Library.API/bin/Debug/LoanTests.cs': xunit,
      'web/app/node_modules/x/loans.test.ts': vitest,
      'web/app/src/loans.ts': vitest,
    })
    const result = trace(config, [req('LOAN-002', ['LOAN-002-T1'], ['Library.Web'])], dir)
    expect(result.links['LOAN-002-T1']).toEqual([])
    expect(result.unknown).toEqual([])
  })

  it('reports components with no checkout', () => {
    expect(trace(config, [], checkouts({})).missing).toEqual([
      { component: 'Library.API', path: 'Library.API' },
      { component: 'Library.Web', path: 'web/app' },
    ])
  })

  it('prints a report and fails on unknown IDs, or on uncovered approved requirements with --strict', () => {
    const main = fileURLToPath(new URL('../src/main.ts', import.meta.url))
    const root = writeTree({
      'loans/LOAN-001.yaml': `specai: "0.1"\nid: LOAN-001\ntitle: Loan limit\nstatus: approved\nstatement: The service shall refuse a sixth loan.\ncomponents: [Library.API]\ntests:\n  - id: LOAN-001-T1\n    title: Refused\n    status: approved\n    level: unit\n    when: x\n    then: [y]\n`,
    })
    const run = (dir: string, ...args: string[]) => spawnSync(process.execPath, [main, 'trace', root, '--checkouts', dir, ...args], { encoding: 'utf8' })
    const covered = run(checkouts({ 'Library.API/LoanTests.cs': xunit.replace('LOAN-009-T1', 'LOAN-001-T1') }))
    expect(covered.status).toBe(0)
    expect(covered.stdout).toContain('LOAN-001  approved    covered  1/1 test definitions linked')
    expect(covered.stdout).toContain('1 of 1 approved requirement covered')
    expect(run(checkouts({ 'Library.API/LoanTests.cs': xunit })).status).toBe(1)
    const none = checkouts({ 'Library.API/Other.cs': '' })
    expect(run(none).status).toBe(0)
    expect(run(none, '--strict').status).toBe(1)
  })
})
