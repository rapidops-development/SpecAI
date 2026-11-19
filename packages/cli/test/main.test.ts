import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { edit, writeTree } from './fixtures.ts'

const main = fileURLToPath(new URL('../src/main.ts', import.meta.url))
const run = (...args: string[]) => spawnSync(process.execPath, [main, ...args], { encoding: 'utf8' })

describe('specai validate', () => {
  it('exits 0 and prints a summary for a valid tree', () => {
    const result = run('validate', writeTree())
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('0 errors, 0 warnings in 5 files')
  })

  it('exits 1 on errors, printing file:line locations', () => {
    const root = writeTree(edit('loans/LOAN-001.yaml', 'components: [Library.API]', 'components: [Nope]'))
    const result = run('validate', root)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain(`${root}/loans/LOAN-001.yaml:6  error [components] LOAN-001 /components/0: component Nope is not listed`)
  })

  it('[CLI-004-T2] passes with warnings unless --strict', () => {
    const root = writeTree(edit('loans/LOAN-001.yaml', 'Loan limit', 'Customer loan limit'))
    expect(run('validate', root).status).toBe(0)
    expect(run('validate', root, '--strict').status).toBe(1)
  })

  it('prints JSON with --json', () => {
    const root = writeTree(edit('loans/LOAN-001.yaml', 'Loan limit', 'Customer loan limit'))
    expect(JSON.parse(run('validate', root, '--json').stdout)).toMatchObject([{ rule: 'avoid' }])
  })

  it('exits 2 for an unknown command', () => {
    expect(run('frobnicate').status).toBe(2)
  })

  it('runs on SpecAI\'s own specs', () => {
    const specs = fileURLToPath(new URL('../../../specs', import.meta.url))
    expect(execFileSync(process.execPath, [main, 'validate', specs], { encoding: 'utf8' })).toContain('0 errors')
  })
})
