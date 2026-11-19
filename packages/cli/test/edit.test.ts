import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { createRequirement, createTerm, EditError, nextRequirementId, readSpecFile, saveRawFile, saveRequirement, saveTerm, slugify } from '../src/edit.ts'
import type { GlossaryTerm, Requirement } from '../src/model.ts'
import { writeTree } from './fixtures.ts'

const commented = `specai: "0.1"
# Agreed with the board in March.
id: LOAN-001
title: Loan limit
status: proposed
statement: While a [[member]] has five open loans, the service shall refuse a new loan. # five, not six
rationale: |
  Keeps popular titles circulating.

  Five is a setting.
components: [Library.API]
tests:
  # The main case.
  - id: LOAN-001-T1
    title: Sixth loan is refused
    status: proposed
    level: unit
    when: The member borrows a sixth copy
    then:
      - The loan is refused
`

function setup(text = commented) {
  const root = writeTree({ 'loans/LOAN-001.yaml': text })
  const read = () => readFileSync(join(root, 'loans/LOAN-001.yaml'), 'utf8')
  const data = () => parse(read()) as Requirement
  const hash = () => readSpecFile(root, 'loans/LOAN-001.yaml').hash
  return { root, read, data, hash }
}

const error = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    if (e instanceof EditError) return e
    throw e
  }
  throw new Error('expected an EditError')
}

describe('saving a requirement', () => {
  it('[UI-006-T1] keeps comments, key order and block styles', () => {
    const { root, read, data, hash } = setup()
    const req = data()
    req.title = 'Five-loan limit'
    req.tests![0].then.push('The member is told why')
    saveRequirement(root, 'LOAN-001', req, hash())
    expect(read()).toBe(
      commented
        .replace('title: Loan limit', 'title: Five-loan limit')
        .replace('      - The loan is refused\n', '      - The loan is refused\n      - The member is told why\n'),
    )
  })

  it('[UI-006-T2] puts new fields where they belong and removes cleared ones', () => {
    const { root, read, data, hash } = setup()
    const req = data()
    req.tags = ['limits']
    req.acceptance = ['Applies to every member']
    delete req.rationale
    saveRequirement(root, 'LOAN-001', req, hash())
    const keys = Object.keys(parse(read()))
    expect(keys).toEqual(['specai', 'id', 'title', 'status', 'statement', 'acceptance', 'tags', 'components', 'tests'])
    expect(read()).toContain('tags: [limits]')
    expect(read()).toContain('# Agreed with the board in March.')
  })

  it('writes multi-line text as a literal block', () => {
    const { root, read, data, hash } = setup()
    saveRequirement(root, 'LOAN-001', { ...data(), notes: 'First line.\n\nSecond line.\n' }, hash())
    expect(read()).toContain('notes: |\n  First line.\n\n  Second line.\n')
  })

  it('keeps a test definition’s comments when tests are reordered', () => {
    const { root, read, data, hash } = setup()
    const req = data()
    const second = { id: 'LOAN-001-T2', title: 'Fifth loan is allowed', status: 'draft' as const, level: 'unit' as const, when: 'The member borrows a fifth copy', then: ['The loan is created'] }
    req.tests = [second, req.tests![0]]
    saveRequirement(root, 'LOAN-001', req, hash())
    const text = read()
    expect(text.indexOf('LOAN-001-T2')).toBeLessThan(text.indexOf('LOAN-001-T1'))
    expect(text).toContain('  # The main case.\n  - id: LOAN-001-T1')
    expect(parse(text).tests[0]).toEqual(second)
  })

  it('[UI-008-T1] returns an approved requirement to proposed when its text changes', () => {
    const { root, data, hash } = setup(commented.replace('status: proposed\nstatement', 'status: approved\nstatement'))
    const result = saveRequirement(root, 'LOAN-001', { ...data(), statement: 'While a [[member]] has six open loans, the service shall refuse a new loan.' }, hash())
    expect(data().status).toBe('proposed')
    expect(result.notices).toEqual(['LOAN-001 was approved and its text changed, so it is proposed again'])
  })

  it('[UI-008-T2] lets a status change through, and approves without touching text', () => {
    const { root, data, hash } = setup()
    expect(saveRequirement(root, 'LOAN-001', { ...data(), status: 'approved' }, hash()).notices).toEqual([])
    expect(data().status).toBe('approved')
    const tests = data().tests!.map((t) => ({ ...t, status: 'approved' as const }))
    saveRequirement(root, 'LOAN-001', { ...data(), tests }, hash())
    const edited = data().tests!.map((t) => ({ ...t, when: 'The member borrows one more copy' }))
    const result = saveRequirement(root, 'LOAN-001', { ...data(), tests: edited }, hash())
    expect(result.notices).toEqual(['LOAN-001-T1 was approved and its text changed, so it is proposed again'])
    expect(data().status).toBe('approved')
  })

  it('[UI-010-T1] refuses an edit that breaks the schema, leaving the file alone', () => {
    const { root, read, data, hash } = setup()
    const e = error(() => saveRequirement(root, 'LOAN-001', { ...data(), status: 'done' as never }, hash()))
    expect(e.status).toBe(422)
    expect(e.diagnostics[0]).toMatchObject({ rule: 'schema', field: '/status' })
    expect(read()).toBe(commented)
  })

  it('refuses an unknown component but saves a broken link, reporting it', () => {
    const { root, data, hash } = setup()
    expect(error(() => saveRequirement(root, 'LOAN-001', { ...data(), components: ['Nope'] }, hash())).status).toBe(422)
    const result = saveRequirement(root, 'LOAN-001', { ...data(), title: 'See [[LOAN-099]]' }, hash())
    expect(result.diagnostics).toMatchObject([{ rule: 'links', severity: 'error' }])
  })

  it('[UI-011-T1] refuses to overwrite a file that changed on disk', () => {
    const { root, read, data, hash } = setup()
    const base = hash()
    writeFileSync(join(root, 'loans/LOAN-001.yaml'), read().replace('Loan limit', 'Loan cap'))
    const e = error(() => saveRequirement(root, 'LOAN-001', { ...data(), title: 'Mine' }, base))
    expect(e.status).toBe(409)
    expect(e.current?.text).toContain('Loan cap')
  })

  it('refuses to change an ID', () => {
    const { root, data, hash } = setup()
    expect(error(() => saveRequirement(root, 'LOAN-001', { ...data(), id: 'LOAN-009' }, hash())).status).toBe(400)
  })
})

describe('creating', () => {
  it('[UI-007-T1] gives a new requirement the next ID in its area, counting removed ones', () => {
    const root = writeTree({ 'loans/LOAN-007.yaml': readFileSync(join(writeTree(), 'loans/LOAN-002.yaml'), 'utf8').replace(/LOAN-002/g, 'LOAN-007').replace('status: proposed', 'status: removed') })
    expect(nextRequirementId(root, 'loans')).toBe('LOAN-008')
    const result = createRequirement(root, 'loans', {
      title: 'Renewals',
      status: 'draft',
      statement: 'When a [[member]] renews a loan, the service shall extend its due date.',
      tests: [{ title: 'Renewal extends', status: 'draft', level: 'unit', when: 'A member renews', then: ['The due date moves'] } as never],
    })
    expect(result).toMatchObject({ id: 'LOAN-008', file: 'loans/LOAN-008.yaml', diagnostics: [] })
    const text = readFileSync(join(root, 'loans/LOAN-008.yaml'), 'utf8')
    expect(Object.keys(parse(text))).toEqual(['specai', 'id', 'title', 'status', 'statement', 'tests'])
    expect(parse(text).tests[0].id).toBe('LOAN-008-T1')
    expect(text).toMatch(/^specai: "0.1"\nid: LOAN-008\n/)
  })

  it('creates a glossary term named after the term', () => {
    const root = writeTree()
    const result = createTerm(root, { term: 'Due date', definition: 'When a [[loan]] must be returned.', aliases: ['due dates'] })
    expect(result.slug).toBe('due-date')
    expect(result.diagnostics).toMatchObject([{ rule: 'links' }])
    expect(parse(readFileSync(join(root, 'glossary/due-date.yaml'), 'utf8'))).toEqual({ specai: '0.1', term: 'Due date', aliases: ['due dates'], definition: 'When a [[loan]] must be returned.' })
    expect(error(() => createTerm(root, { term: 'Due  date!', definition: 'Again.' })).status).toBe(409)
  })

  it('saves a glossary term', () => {
    const root = writeTree()
    const { hash } = readSpecFile(root, 'glossary/member.yaml')
    const term = parse(readFileSync(join(root, 'glossary/member.yaml'), 'utf8')) as GlossaryTerm
    saveTerm(root, 'member', { ...term, avoid: ['customer', 'patron'] }, hash)
    expect(readFileSync(join(root, 'glossary/member.yaml'), 'utf8')).toContain('avoid: [customer, patron]')
  })

  it('makes slugs from terms', () => {
    expect(slugify('Overdue loan notice')).toBe('overdue-loan-notice')
    expect(slugify('Café  & co.')).toBe('cafe-co')
  })
})

describe('raw files', () => {
  it('saves valid YAML text and refuses invalid text', () => {
    const { root, read, hash } = setup()
    const text = read().replace('# five, not six', '# five')
    expect(saveRawFile(root, 'loans/LOAN-001.yaml', text, hash()).file).toBe('loans/LOAN-001.yaml')
    expect(read()).toBe(text)
    expect(error(() => saveRawFile(root, 'loans/LOAN-001.yaml', 'id: [', hash())).status).toBe(422)
  })

  it('refuses paths outside the spec tree layout', () => {
    const root = writeTree()
    for (const path of ['../outside.yaml', '/etc/passwd', 'loans/notes.txt', 'loans/deep/LOAN-001.yaml']) {
      expect(error(() => readSpecFile(root, path)).status).toBe(400)
    }
  })
})
