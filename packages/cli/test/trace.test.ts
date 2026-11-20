import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Requirement, RootConfig } from '../src/model.ts'
import { trace } from '../src/trace.ts'
import { edit, writeTree } from './fixtures.ts'

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
    const covered = run(checkouts({ 'Library.API/LoanTests.cs': xunit.replace('[Fact, Trait("SpecAI", "LOAN-009-T1")]', '[Fact]') }))
    expect(covered.status).toBe(0)
    expect(covered.stdout).toContain('LOAN-001  approved    covered  1/1 test definitions linked')
    expect(covered.stdout).toContain('1 of 1 approved requirement covered')
    expect(run(checkouts({ 'Library.API/LoanTests.cs': xunit })).status).toBe(1)
    const none = checkouts({ 'Library.API/Other.cs': '' })
    expect(run(none).status).toBe(0)
    expect(run(none, '--strict').status).toBe(1)
  })

  describe('one test per test definition', () => {
    const t1 = id(1)
    const t2 = id(2)
    const loan002 = (components = ['Library.Web']) => req('LOAN-002', [t1, t2], components)

    it('[CLI-010-T1] reports a test definition named by two tests', () => {
      const dir = checkouts({
        'web/app/src/a.test.ts': `it('[${t1}] blocks overdue members', () => {})\n`,
        'web/app/src/b.test.ts': `\n\nit('[${t1}] blocks them again', () => {})\n`,
      })
      const result = trace(config, [loan002()], dir)
      expect(result.duplicates).toEqual({
        [t1]: [
          { testId: t1, file: 'web/app/src/a.test.ts', line: 1, framework: 'vitest' },
          { testId: t1, file: 'web/app/src/b.test.ts', line: 3, framework: 'vitest' },
        ],
      })
      expect(result.coverage['LOAN-002']).toBe('partial')
    })

    it('counts a parameterised test as one test', () => {
      const dir = checkouts({ 'web/app/src/a.test.ts': `it.each([1, 2, 3])('[${t1}] case %s', () => {})\n` })
      expect(trace(config, [loan002()], dir).duplicates).toEqual({})
    })

    it('[CLI-010-T2] reports an xUnit method with two SpecAI traits', () => {
      const dir = checkouts({
        'Library.API/LoanTests.cs': `public class LoanTests
{
    [Fact]
    [Trait("SpecAI", "LOAN-001-T1")]
    // Also checks the second case.
    [Trait("SpecAI", "LOAN-001-T2")]
    public void Both() { }

    [Theory, Trait("SpecAI", "LOAN-001-T3")]
    [InlineData(1)]
    public void Third(int n) { }
}
`,
      })
      const result = trace(config, [req('LOAN-001', ['LOAN-001-T1', 'LOAN-001-T2', 'LOAN-001-T3'])], dir)
      expect(result.multiple).toEqual([{ file: 'Library.API/LoanTests.cs', line: 7, framework: 'xunit', testIds: ['LOAN-001-T1', 'LOAN-001-T2'] }])
      expect(result.coverage['LOAN-001']).toBe('covered')
    })

    it('[CLI-010-T3] finds every ID in a Vitest test name and reports the test', () => {
      const dir = checkouts({ 'web/app/src/a.test.ts': `describe('loans', () => {\n  it('[${t1}] [${t2}] blocks and warns', () => {})\n})\n` })
      const result = trace(config, [loan002()], dir)
      expect(result.links[t2]).toEqual([{ testId: t2, file: 'web/app/src/a.test.ts', line: 2, framework: 'vitest' }])
      expect(result.multiple).toEqual([{ file: 'web/app/src/a.test.ts', line: 2, framework: 'vitest', testIds: [t1, t2] }])
    })

    it('[CLI-012-T1] warns about a link in a component the requirement does not list', () => {
      const dir = checkouts({ 'Library.API/tests/a.test.ts': `it('[${t1}] blocks overdue members', () => {})\n` })
      const result = trace(config, [loan002()], dir)
      expect(result.misplaced).toEqual([
        { testId: t1, file: 'Library.API/tests/a.test.ts', line: 1, framework: 'vitest', requirement: 'LOAN-002', components: ['Library.Web'] },
      ])
      expect(result.links[t1]).toEqual([])
      expect(result.unknown).toEqual([])
    })

    it('[CLI-013-T1] lists untagged xUnit methods', () => {
      const dir = checkouts({
        'Library.API/LoanTests.cs': `public class LoanTests
{
    [Fact]
    [Trait("SpecAI", "LOAN-001-T1")]
    public void Tagged() { }

    [Fact(Skip = "slow")]
    public async Task Untagged() { }

    [Theory]
    [InlineData(1,
        2)]
    public void Parameterised(int a, int b) { }
}
`,
      })
      expect(trace(config, [req('LOAN-001', ['LOAN-001-T1'])], dir).untagged).toEqual({
        'Library.API': [
          { file: 'Library.API/LoanTests.cs', line: 8, framework: 'xunit', name: 'Untagged' },
          { file: 'Library.API/LoanTests.cs', line: 13, framework: 'xunit', name: 'Parameterised' },
        ],
      })
    })

    it('[CLI-013-T2] lists untagged Vitest tests and ignores helpers', () => {
      const dir = checkouts({
        'web/app/src/a.test.ts': `const test = (name: string) => name
describe('loans', () => {
  it('[${t1}] tagged', () => {})
  it('plain it', () => {})
  test("plain test", async () => {})
  it.each([[1, 2], [3, 4]])('each %s', (a) => {})
  it.only('only', () => {})
  test.skip(\`skip\`, () => {})
  test('helper call')
  test('helper with a string', 'deprecated')
  expect(/x/.test('x')).toBe(true)
})
`,
      })
      const names = trace(config, [loan002()], dir).untagged['Library.Web'].map((t) => `${t.line} ${t.name}`)
      expect(names).toEqual(['4 plain it', '5 plain test', '6 each %s', '7 only', '8 skip'])
    })
  })

  describe('trace command', () => {
    const main = fileURLToPath(new URL('../src/main.ts', import.meta.url))
    const root = () =>
      writeTree({
        'loans/LOAN-001.yaml': `specai: "0.1"\nid: LOAN-001\ntitle: Loan limit\nstatus: approved\nstatement: The service shall refuse a sixth loan.\ncomponents: [Library.API]\ntests:\n  - id: LOAN-001-T1\n    title: Refused\n    status: approved\n    level: unit\n    when: x\n    then: [y]\n  - id: LOAN-001-T2\n    title: Warned\n    status: approved\n    level: unit\n    when: x\n    then: [y]\n`,
      })
    const run = (files: Record<string, string>, ...args: string[]) =>
      spawnSync(process.execPath, [main, 'trace', root(), '--checkouts', checkouts(files), ...args], { encoding: 'utf8' })
    const method = (name: string, ...ids: string[]) => `${ids.map((i) => `    [Trait("SpecAI", "${i}")]\n`).join('')}    [Fact]\n    public void ${name}() { }\n`
    const cs = (...methods: string[]) => ({ 'Library.API/LoanTests.cs': `public class LoanTests\n{\n${methods.join('\n')}}\n` })

    it('[CLI-010-T4] fails when a link is not one to one', () => {
      const files = cs(method('A', 'LOAN-001-T1'), method('B', 'LOAN-001-T1'), method('Both', 'LOAN-001-T1', 'LOAN-001-T2'))
      for (const args of [[], ['--strict']]) {
        const out = run(files, ...args)
        expect(out.stdout).toContain('error: test definitions named by more than one test')
        expect(out.stdout).toContain('error: tests naming more than one test definition')
        expect(out.stdout).toContain('Library.API/LoanTests.cs:14  LOAN-001-T1, LOAN-001-T2')
        expect(out.status).toBe(1)
      }
    })

    it('[CLI-013-T3] reports untagged tests without failing', () => {
      const files = cs(method('A', 'LOAN-001-T1'), method('B', 'LOAN-001-T2'), method('Extra'))
      const text = run(files, '--strict')
      expect(text.status).toBe(0)
      expect(text.stdout).toContain('  Library.API: 1 test\n    Library.API/LoanTests.cs:12  Extra')
      const json = run(files, '--json')
      expect(json.status).toBe(0)
      expect(JSON.parse(json.stdout).untagged).toEqual({ 'Library.API': [{ file: 'Library.API/LoanTests.cs', line: 12, framework: 'xunit', name: 'Extra' }] })
    })

    it('prints the component mismatch warning without failing', () => {
      const loan1 = ['LOAN', '001', 'T1'].join('-')
      const out = spawnSync(
        process.execPath,
        [main, 'trace', writeTree(edit('specai.yaml', '  - name: Library.API\n', '  - name: Library.API\n  - name: Library.Web\n')), '--checkouts', checkouts({ 'Library.API/Other.cs': '', 'Library.Web/a.test.ts': `it('[${loan1}] x', () => {})\n` })],
        { encoding: 'utf8' },
      )
      expect(out.stdout).toContain('warning: test code in a component its requirement does not list')
      expect(out.stdout).toContain('Library.Web/a.test.ts:1  LOAN-001-T1 (LOAN-001 lists Library.API)')
      expect(out.status).toBe(0)
    })
  })
})
