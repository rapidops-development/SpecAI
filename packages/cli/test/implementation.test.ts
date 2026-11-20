import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Requirement, RootConfig, Status } from '../src/model.ts'
import { trace } from '../src/trace.ts'
import { writeTree } from './fixtures.ts'

const config: RootConfig = {
  specai: '0.2',
  areas: ['loans'],
  components: [{ name: 'Library.API' }, { name: 'Library.Web', path: 'web/app' }],
}

const req = (id: string, extra: Partial<Requirement> = {}): Requirement => ({
  specai: '0.2',
  id,
  title: `Title of ${id}`,
  status: 'approved',
  statement: 'The service shall work.',
  components: ['Library.API'],
  ...extra,
})

function checkouts(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'specai-checkouts-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

describe('implementation annotations', () => {
  it('[CLI-017-T1] finds annotations in any comment syntax, with every ID, file and line', () => {
    const dir = checkouts({
      'Library.API/src/Loans.cs': 'namespace Library;\n\n// SpecAI: LOAN-001, LOAN-002\npublic class Loans { }\n',
      'Library.API/src/loans.ts': '/* SpecAI: LOAN-003 */\nexport const loans = 1\n',
      'Library.API/deploy/values.yaml': 'replicas: 2\n# SpecAI: LOAN-001\nretentionDays: 30\n',
      'Library.API/db/schema.sql': '-- SpecAI: LOAN-002\nCREATE TABLE loans (id int);\n',
    })
    const result = trace(config, [req('LOAN-001'), req('LOAN-002'), req('LOAN-003')], dir)
    expect(result.implementations['LOAN-001']).toEqual([
      { requirementId: 'LOAN-001', file: 'Library.API/deploy/values.yaml', line: 2 },
      { requirementId: 'LOAN-001', file: 'Library.API/src/Loans.cs', line: 3 },
    ])
    expect(result.implementations['LOAN-002'].map((a) => `${a.file}:${a.line}`)).toEqual(['Library.API/db/schema.sql:1', 'Library.API/src/Loans.cs:3'])
    expect(result.implementations['LOAN-003']).toEqual([{ requirementId: 'LOAN-003', file: 'Library.API/src/loans.ts', line: 1 }])
  })

  it('[CLI-017-T2] ignores annotations in test files and documentation', () => {
    const annotation = '// SpecAI: LOAN-001\n'
    const dir = checkouts({
      'Library.API/tests/loans.test.ts': annotation,
      'Library.API/tests/LoanTests.cs': `public class LoanTests\n{\n    ${annotation}    [Fact]\n    public void Works() { }\n}\n`,
      'Library.API/README.md': annotation,
    })
    const result = trace(config, [req('LOAN-001')], dir)
    expect(result.implementations['LOAN-001']).toEqual([])
    expect(result.unknownAnnotations).toEqual([])
  })

  it('[CLI-017-T3] does not count an annotation in a component its requirement does not list, and warns', () => {
    const dir = checkouts({ 'Library.API/Other.cs': '', 'web/app/src/loans.ts': '// SpecAI: LOAN-001\nexport {}\n' })
    const result = trace(config, [req('LOAN-001')], dir)
    expect(result.implementations['LOAN-001']).toEqual([])
    expect(result.implementation['LOAN-001']).toBe('unimplemented')
    expect(result.misplacedAnnotations).toEqual([{ requirementId: 'LOAN-001', file: 'web/app/src/loans.ts', line: 1, components: ['Library.API'] }])
  })

  it('[CLI-018-T1] reports an annotation naming a requirement that does not exist', () => {
    const result = trace(config, [req('LOAN-001')], checkouts({ 'Library.API/Loans.cs': '// SpecAI: LOAN-009\n' }))
    expect(result.unknownAnnotations).toEqual([{ requirementId: 'LOAN-009', file: 'Library.API/Loans.cs', line: 1 }])
  })

  it('[CLI-018-T2] reports an annotation naming a test definition or something else', () => {
    const result = trace(config, [req('LOAN-001')], checkouts({ 'Library.API/Loans.cs': '// SpecAI: LOAN-001-T1, see the loans page\n' }))
    expect(result.badAnnotations).toEqual([
      { file: 'Library.API/Loans.cs', line: 1, text: 'LOAN-001-T1', reason: 'test-definition' },
      { file: 'Library.API/Loans.cs', line: 1, text: 'see the loans page', reason: 'malformed' },
    ])
  })

  it('[CLI-021-T1] warns about annotations naming a removed requirement', () => {
    const result = trace(config, [req('LOAN-001', { status: 'removed' })], checkouts({ 'Library.API/Loans.cs': '// SpecAI: LOAN-001\n' }))
    expect(result.removedAnnotations).toEqual([{ requirementId: 'LOAN-001', file: 'Library.API/Loans.cs', line: 1 }])
  })

  it('[CLI-019-T1] reports each requirement as implemented, planned or unimplemented', () => {
    const result = trace(
      config,
      [req('LOAN-001'), req('LOAN-002', { issues: ['acme/library#12'] }), req('LOAN-003'), req('LOAN-004', { issues: ['acme/library#13'] })],
      checkouts({ 'Library.API/Loans.cs': '// SpecAI: LOAN-001, LOAN-004\n' }),
    )
    expect(result.implementation).toEqual({ 'LOAN-001': 'implemented', 'LOAN-002': 'planned', 'LOAN-003': 'unimplemented', 'LOAN-004': 'implemented' })
  })

  describe('trace command', () => {
    const main = fileURLToPath(new URL('../src/main.ts', import.meta.url))
    const requirement = (id: string, status: Status, extra = '') =>
      `specai: "0.2"\nid: ${id}\ntitle: Title of ${id}\nstatus: ${status}\nstatement: The service shall work.\ncomponents: [Library.API]\n${extra}`
    const root = () =>
      writeTree({
        'specai.yaml': 'specai: "0.2"\nareas: [loans]\ncomponents:\n  - name: Library.API\n',
        'loans/area.yaml': 'specai: "0.2"\nprefix: LOAN\nname: Loans\n',
        'loans/LOAN-001.yaml': requirement('LOAN-001', 'approved'),
        'loans/LOAN-002.yaml': requirement('LOAN-002', 'approved', 'issues: [acme/library#12]\n'),
        'loans/LOAN-003.yaml': requirement('LOAN-003', 'approved'),
        'loans/LOAN-004.yaml': requirement('LOAN-004', 'proposed'),
        'glossary/member.yaml': 'specai: "0.2"\nterm: Member\ndefinition: A borrower.\n',
      })
    const run = (files: Record<string, string>, ...args: string[]) =>
      spawnSync(process.execPath, [main, 'trace', root(), '--checkouts', checkouts(files), ...args], { encoding: 'utf8' })

    it('[CLI-019-T2] warns about approved requirements that are neither implemented nor planned', () => {
      const out = run({ 'Library.API/Loans.cs': '// SpecAI: LOAN-001\n' })
      expect(out.stdout).toContain('LOAN-001  approved    implemented      no test definitions')
      expect(out.stdout).toContain('LOAN-002  approved    planned          no test definitions')
      expect(out.stdout).toContain('warning: approved requirements with no implementation annotation and no issues:\n  LOAN-003  Title of LOAN-003\n\n')
      expect(out.stdout).not.toContain('  LOAN-004  Title of LOAN-004')
      expect(out.stdout).toContain('1 of 3 approved requirements implemented, 1 planned')
      expect(out.status).toBe(0)
    })

    it('[CLI-019-T3] fails with --strict while an approved requirement is unimplemented, not while planned', () => {
      const covered = (extra = '') =>
        writeTree({
          'specai.yaml': 'specai: "0.2"\nareas: [loans]\ncomponents:\n  - name: Library.API\n',
          'loans/area.yaml': 'specai: "0.2"\nprefix: LOAN\nname: Loans\n',
          'loans/LOAN-001.yaml': `${requirement('LOAN-001', 'approved', extra)}tests:\n  - id: LOAN-001-T1\n    title: Works\n    status: approved\n    level: unit\n    when: x\n    then: [y]\n`,
          'loans/LOAN-002.yaml': null,
          'glossary/member.yaml': 'specai: "0.2"\nterm: Member\ndefinition: A borrower.\n',
        })
      const tested = { 'Library.API/LoanTests.cs': 'public class LoanTests\n{\n    [Fact, Trait("SpecAI", "LOAN-001-T1")]\n    public void Works() { }\n}\n' }
      const strict = (tree: string, files: Record<string, string>) =>
        spawnSync(process.execPath, [main, 'trace', tree, '--checkouts', checkouts(files), '--strict'], { encoding: 'utf8' }).status
      expect(strict(covered(), tested)).toBe(1)
      expect(strict(covered('issues: [acme/library#12]\n'), tested)).toBe(0)
      expect(strict(covered(), { ...tested, 'Library.API/Loans.cs': '// SpecAI: LOAN-001\n' })).toBe(0)
    })

    it('[CLI-018-T3] fails on an annotation naming no requirement', () => {
      const out = run({ 'Library.API/Loans.cs': '// SpecAI: LOAN-009\n' })
      expect(out.stdout).toContain('error: implementation annotations name requirements that do not exist:\n  Library.API/Loans.cs:1  LOAN-009')
      expect(out.status).toBe(1)
    })
  })
})
