import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { impact } from '../src/impact.ts'
import type { Requirement, RootConfig } from '../src/model.ts'

const config: RootConfig = { specai: '0.2', areas: ['loans'], components: [{ name: 'Library.API' }, { name: 'Library.Web' }] }
const req = (id: string, tests: string[] = []): Requirement => ({
  specai: '0.2',
  id,
  title: `Title of ${id}`,
  status: 'approved',
  statement: 'The service shall work.',
  tests: tests.map((t) => ({ id: t, title: t, status: 'proposed', level: 'unit', when: 'x', then: ['y'] })),
})
const requirements = [req('LOAN-001', ['LOAN-001-T1']), req('LOAN-002'), req('LOAN-003')]

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

function write(dir: string, files: Record<string, string | null>) {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) rmSync(join(dir, path))
    else {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
  }
}

/** A checkouts folder holding a Library.API git repo with one commit on main, then a branch. */
function repo(files: Record<string, string>): { checkouts: string; api: string } {
  const checkouts = mkdtempSync(join(tmpdir(), 'specai-impact-'))
  const api = join(checkouts, 'Library.API')
  mkdirSync(api)
  git(api, 'init', '-q', '-b', 'main')
  write(api, files)
  git(api, 'add', '-A')
  git(api, 'commit', '-q', '-m', 'base')
  git(api, 'checkout', '-q', '-b', 'change')
  return { checkouts, api }
}

// Built from parts, so this file does not itself name the IDs it scans for.
const t1 = ['LOAN', '001', 'T1'].join('-')
const loans = 'namespace Library;\n\n// SpecAI: LOAN-001\npublic class Loans { }\n'

describe('impact', () => {
  it('[CLI-020-T1] lists requirements whose annotations are in changed files, committed or not', () => {
    const { checkouts, api } = repo({ 'src/Loans.cs': loans, 'src/Fees.cs': '// SpecAI: LOAN-003\n' })
    write(api, { 'src/Loans.cs': `${loans}// a change\n` })
    git(api, 'commit', '-qam', 'change')
    write(api, { 'src/New.cs': '// SpecAI: LOAN-002\n' })
    const result = impact(config, requirements, checkouts, 'main')
    expect(result.requirements).toEqual([
      { id: 'LOAN-001', title: 'Title of LOAN-001', status: 'approved', places: [{ kind: 'implementation', file: 'Library.API/src/Loans.cs', line: 3 }] },
      { id: 'LOAN-002', title: 'Title of LOAN-002', status: 'approved', places: [{ kind: 'implementation', file: 'Library.API/src/New.cs', line: 1 }] },
    ])
  })

  it('[CLI-020-T2] counts annotations in deleted code as removed', () => {
    const { checkouts, api } = repo({ 'src/Loans.cs': loans })
    write(api, { 'src/Loans.cs': null })
    git(api, 'commit', '-qam', 'delete')
    expect(impact(config, requirements, checkouts, 'main').requirements[0].places).toEqual([
      { kind: 'implementation', file: 'Library.API/src/Loans.cs', line: 3, removed: true },
    ])
  })

  it('[CLI-020-T3] lists the requirement of each test definition named in changed tests', () => {
    const { checkouts, api } = repo({ 'tests/loans.test.ts': `it('[${t1}] works', () => {})\n` })
    write(api, { 'tests/loans.test.ts': `it('[${t1}] works again', () => {})\n` })
    expect(impact(config, requirements, checkouts, 'main').requirements).toEqual([
      { id: 'LOAN-001', title: 'Title of LOAN-001', status: 'approved', places: [{ kind: 'test', file: 'Library.API/tests/loans.test.ts', line: 1, testId: 'LOAN-001-T1' }] },
    ])
  })

  it('[CLI-020-T4] reports components it cannot compare', () => {
    const { checkouts } = repo({ 'src/Loans.cs': loans })
    const result = impact(config, requirements, checkouts, 'nope')
    expect(result.skipped).toEqual([
      { component: 'Library.API', reason: `nope is not a revision in ${join(checkouts, 'Library.API')}` },
      { component: 'Library.Web', reason: `no checkout at ${join(checkouts, 'Library.Web')}` },
    ])
  })

  it('[CLI-020-T5] compares a component checkout reached through a symbolic link', () => {
    const { api } = repo({ 'src/Loans.cs': loans })
    write(api, { 'src/Loans.cs': `${loans}// a change\n` })
    const checkouts = mkdtempSync(join(tmpdir(), 'specai-links-'))
    symlinkSync(api, join(checkouts, 'Library.API'), 'dir')
    const result = impact(config, requirements, checkouts, 'main')
    expect(result.requirements).toEqual([
      { id: 'LOAN-001', title: 'Title of LOAN-001', status: 'approved', places: [{ kind: 'implementation', file: 'Library.API/src/Loans.cs', line: 3 }] },
    ])
  })

  it('prints a report, and needs --since', () => {
    const main = fileURLToPath(new URL('../src/main.ts', import.meta.url))
    const { checkouts, api } = repo({ 'src/Loans.cs': loans })
    write(api, { 'src/Loans.cs': `${loans}// a change\n` })
    const specs = mkdtempSync(join(tmpdir(), 'specai-specs-'))
    write(specs, {
      'specai.yaml': 'specai: "0.2"\nareas: [loans]\ncomponents:\n  - name: Library.API\n',
      'loans/area.yaml': 'specai: "0.2"\nprefix: LOAN\nname: Loans\n',
      'loans/LOAN-001.yaml': 'specai: "0.2"\nid: LOAN-001\ntitle: Loan limit\nstatus: proposed\nstatement: The service shall refuse a sixth loan.\n',
    })
    const run = (...args: string[]) => spawnSync(process.execPath, [main, 'impact', specs, '--checkouts', checkouts, ...args], { encoding: 'utf8' })
    const out = run('--since', 'main')
    expect(out.status).toBe(0)
    expect(out.stdout).toBe('Requirements named in files changed since main:\n\nLOAN-001  proposed  Loan limit\n  implementation  Library.API/src/Loans.cs:3\n')
    expect(run().status).toBe(2)
  })
})
