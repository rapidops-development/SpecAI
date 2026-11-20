import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { treeVersion, validators } from '../packages/cli/src/schema.ts'
import { fileStem, loadSpecTree, parseSpecYaml } from '../packages/cli/src/tree.ts'

const repo = fileURLToPath(new URL('..', import.meta.url))

const trees = [
  join(repo, 'specs'),
  ...readdirSync(join(repo, 'examples')).map((name) => join(repo, 'examples', name)),
]

describe.each(trees)('spec tree %s', (root) => {
  const { files, diagnostics } = loadSpecTree(root)

  it('reads every file', () => {
    expect(diagnostics).toEqual([])
  })

  it('has a root specai.yaml', () => {
    expect(files.some((f) => f.kind === 'specai')).toBe(true)
  })

  it.each(files.map((f) => [f.path, f] as const))('%s conforms to the schema', (_name, file) => {
    const validate = validators(treeVersion(files))[file.kind]
    validate(file.data)
    expect(validate.errors ?? []).toEqual([])
  })

  it('names requirement files by their ID', () => {
    for (const file of files.filter((f) => f.kind === 'requirement')) {
      expect((file.data as { id: string }).id).toBe(fileStem(file.path))
    }
  })
})

describe('schema', () => {
  const requirement = {
    specai: '0.2',
    id: 'LOAN-042',
    title: 'Overdue notice',
    status: 'proposed',
    statement: 'When a loan passes its due date, the system shall send an [[overdue notice]].',
  }
  const test = { id: 'LOAN-042-T1', title: 'Sends an overdue notice', status: 'proposed', level: 'unit', when: 'The due date passes', then: ['An overdue notice is sent'] }
  const valid = (kind: keyof ReturnType<typeof validators>, data: unknown) => validators()[kind](data)

  it('accepts a minimal requirement with a test definition', () => {
    expect(valid('requirement', { ...requirement, tests: [test] })).toBe(true)
  })

  it('[STD-008-T2] accepts x- extension fields', () => {
    expect(valid('requirement', { ...requirement, 'x-acme': { team: 'core' } })).toBe(true)
  })

  it.each([
    ['[STD-008-T1] an unknown field', { ...requirement, priority: 'must' }],
    ['[STD-002-T1] an unquoted version', { ...requirement, specai: 0.2 }],
    ['[STD-004-T1] a malformed ID', { ...requirement, id: 'loan-42' }],
    ['[STD-007-T1] an unknown status', { ...requirement, status: 'done' }],
    ['[STD-005-T1] a test verifying other requirements', { ...requirement, tests: [{ ...test, alsoVerifies: ['LOAN-043'] }] }],
    ['[STD-005-T2] a malformed test ID', { ...requirement, tests: [{ ...test, id: 'LOAN-042-1' }] }],
    ['an empty then list', { ...requirement, tests: [{ ...test, then: [] }] }],
    ['[STD-011-T2] an issue that is neither shorthand nor a URL', { ...requirement, issues: ['fix later'] }],
  ])('%s is rejected', (_case, data) => {
    expect(valid('requirement', data)).toBe(false)
  })

  it('[STD-011-T1] accepts issues as owner/repo#number shorthand or a URL', () => {
    expect(valid('requirement', { ...requirement, issues: ['acme/library#12', 'https://tracker.example.com/browse/LIB-7'] })).toBe(true)
  })

  it('[STD-011-T3] accepts an issue link template that places the number', () => {
    const config = { specai: '0.2', areas: ['loans'] }
    expect(valid('specai', { ...config, issueUrl: 'https://tracker.example.com/{owner}/{repo}/{number}' })).toBe(true)
    expect(valid('specai', { ...config, issueUrl: 'https://tracker.example.com/{owner}/{repo}' })).toBe(false)
  })

  it('keeps each version\'s own rules, so 0.1 has no issues field', () => {
    expect(validators('0.1').requirement({ ...requirement, specai: '0.1', issues: ['acme/library#12'] })).toBe(false)
    expect(validators('0.1').requirement({ ...requirement, specai: '0.1' })).toBe(true)
  })

  it('rejects a glossary term without a definition', () => {
    expect(valid('glossary-term', { specai: '0.2', term: 'Overdue notice' })).toBe(false)
  })

  it('rejects a root config that lists the same area twice', () => {
    expect(valid('specai', { specai: '0.2', areas: ['loans', 'loans'] })).toBe(false)
  })
})

describe('restricted YAML', () => {
  it.each([
    ['an anchor and alias', 'a: &x 1\nb: *x\n'],
    ['a custom tag', 'a: !secret 1\n'],
  ])('[STD-001-T1] rejects %s', (_case, text) => {
    expect(parseSpecYaml(text, 'test.yaml')).toMatchObject({ error: { message: expect.stringMatching(/not allowed/) } })
  })

  it('accepts plain data', () => {
    expect(parseSpecYaml('a: [1, "two"]\n', 'test.yaml')).toMatchObject({ data: { a: [1, 'two'] } })
  })
})
