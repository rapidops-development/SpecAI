import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadSpecTree } from '../src/tree.ts'
import { validateTree } from '../src/validate.ts'
import { edit, writeTree } from './fixtures.ts'

const main = fileURLToPath(new URL('../src/main.ts', import.meta.url))
const run = (...args: string[]) => spawnSync(process.execPath, [main, ...args], { encoding: 'utf8' })

describe('specai upgrade', () => {
  it('[CLI-016-T1] rewrites every file to the latest version, keeping comments and layout', () => {
    const root = writeTree(edit('loans/LOAN-001.yaml', 'specai: "0.1"', "# Loan rules\nspecai: '0.1' # version\n"))
    const before = readFileSync(join(root, 'loans/LOAN-001.yaml'), 'utf8')
    const result = run('upgrade', root)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Upgraded 5 files')
    expect(result.stdout).toContain('from version 0.1 to 0.2')
    expect(readFileSync(join(root, 'loans/LOAN-001.yaml'), 'utf8')).toBe(before.replace("specai: '0.1' # version", 'specai: "0.2" # version'))
    expect(readFileSync(join(root, 'specai.yaml'), 'utf8')).toMatch(/^specai: "0\.2"\n/)
    expect(validateTree(loadSpecTree(root))).toEqual([])
  })

  it('[CLI-016-T2] leaves a tree at the latest version unchanged', () => {
    const root = writeTree()
    run('upgrade', root)
    const before = readFileSync(join(root, 'loans/LOAN-001.yaml'), 'utf8')
    const result = run('upgrade', root)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('is already at version 0.2')
    expect(readFileSync(join(root, 'loans/LOAN-001.yaml'), 'utf8')).toBe(before)
  })

  it('refuses a tree whose version it does not know', () => {
    const result = run('upgrade', writeTree(edit('specai.yaml', 'specai: "0.1"', 'specai: "9.9"')))
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('declares version "9.9"')
  })
})
