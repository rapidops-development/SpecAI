import { describe, expect, it } from 'vitest'
import { loadSpecTree } from '../src/tree.ts'
import { validateTree } from '../src/validate.ts'
import { edit, writeTree } from './fixtures.ts'

const check = (changes: Record<string, string | null> = {}) => validateTree(loadSpecTree(writeTree(changes)))
const messages = (changes: Record<string, string | null>) => check(changes).map((d) => `${d.severity} ${d.rule} ${d.file}: ${d.message}`)

describe('validate', () => {
  it('passes a valid tree', () => {
    expect(check()).toEqual([])
  })

  describe('versions', () => {
    const allFiles = ['specai.yaml', 'loans/area.yaml', 'loans/LOAN-001.yaml', 'loans/LOAN-002.yaml', 'glossary/member.yaml']
    const toVersion = (version: string) =>
      Object.assign({}, ...allFiles.map((path) => edit(path, 'specai: "0.1"', `specai: "${version}"`)))

    it('[CLI-015-T1] checks a tree against the schema of the version it declares', () => {
      const issues = edit('loans/LOAN-001.yaml', 'components: [Library.API]', 'components: [Library.API]\nissues: [acme/library#12]')
      expect(check(issues)[0]).toMatchObject({ rule: 'schema', file: 'loans/LOAN-001.yaml', field: '/issues', message: 'unknown field "issues"' })
      const upgraded = toVersion('0.2')
      expect(check(upgraded)).toEqual([])
      expect(check({ ...upgraded, 'loans/LOAN-001.yaml': upgraded['loans/LOAN-001.yaml'].replace('components: [Library.API]', 'components: [Library.API]\nissues: [acme/library#12]') })).toEqual([])
    })

    it('[CLI-015-T2] reports a version the tool does not support', () => {
      expect(check(toVersion('9.9'))).toEqual([
        { severity: 'error', rule: 'version', file: 'specai.yaml', line: 1, field: '/specai', message: 'version "9.9" is not supported; use one of "0.1", "0.2"' },
      ])
    })

    it('[STD-012-T1] rejects a file written for another version than its tree', () => {
      expect(messages(edit('specai.yaml', 'specai: "0.1"', 'specai: "0.2"'))).toContain(
        'error version loans/LOAN-001.yaml: written for version "0.1", but the spec tree is version "0.2"; every file uses the version in specai.yaml',
      )
    })
  })

  describe('schema', () => {
    it('[CLI-001-T1] reports each failure with file, line, ID and field', () => {
      const [d] = check(edit('loans/LOAN-001.yaml', 'status: proposed\nstatement', 'status: done\nstatement'))
      expect(d).toMatchObject({ severity: 'error', rule: 'schema', file: 'loans/LOAN-001.yaml', line: 4, id: 'LOAN-001', field: '/status' })
      expect(d.message).toContain('must be one of draft, proposed')
    })

    it('[CLI-001-T2] names unknown fields', () => {
      const [d] = check(edit('loans/LOAN-001.yaml', 'title: Loan limit', 'title: Loan limit\npriority: must'))
      expect(d).toMatchObject({ field: '/priority', line: 4, message: 'unknown field "priority"' })
    })

    it('reports a YAML syntax error with its line', () => {
      expect(check({ 'loans/LOAN-003.yaml': 'specai: "0.1"\nstatement: a: b\n' })).toMatchObject([{ rule: 'yaml', line: 2 }])
    })

    it('[STD-001-T1] rejects aliases', () => {
      expect(messages({ 'loans/LOAN-003.yaml': 'a: &x 1\nb: *x\n' })[0]).toMatch(/yaml .*not allowed/)
    })
  })

  describe('layout', () => {
    it.each([
      ['a missing specai.yaml', { 'specai.yaml': null }, 'missing root specai.yaml'],
      ['a folder not listed in areas', { 'extra/area.yaml': 'specai: "0.1"\nprefix: EXT\nname: Extra\n' }, 'folder "extra" is not listed'],
      ['an area with no area.yaml', { 'loans/area.yaml': null }, 'has no area.yaml'],
      ['a listed folder that does not exist', edit('specai.yaml', 'areas: [loans]', 'areas: [loans, returns]'), '"returns" does not exist'],
      ['an area called glossary', edit('specai.yaml', 'areas: [loans]', 'areas: [loans, glossary]'), 'may not be called glossary'],
      ['a nested file', { 'loans/old/LOAN-009.yaml': 'x: 1\n' }, 'not part of the spec tree layout'],
      ['a .yml file', { 'loans/LOAN-009.yml': 'x: 1\n' }, 'use the .yaml extension'],
    ])('reports %s', (_case, changes, message) => {
      expect(messages(changes).join('\n')).toContain(message)
    })
  })

  describe('ids', () => {
    it('reports an ID that does not match its file name', () => {
      expect(messages(edit('loans/LOAN-002.yaml', 'id: LOAN-002', 'id: LOAN-003'))).toContain(
        'error ids loans/LOAN-002.yaml: ID LOAN-003 does not match the file name LOAN-002.yaml',
      )
    })

    it('reports an ID without the area prefix', () => {
      const changes = { 'loans/LN-003.yaml': (edit('loans/LOAN-002.yaml', 'id: LOAN-002', 'id: LN-003')['loans/LOAN-002.yaml']) }
      expect(messages(changes).join('\n')).toContain('does not start with the area prefix LOAN')
    })

    it('[CLI-002-T1] reports duplicate test definition IDs naming both files', () => {
      const changes = edit('loans/LOAN-002.yaml', 'related: [LOAN-001]', `related: [LOAN-001]
tests:
  - id: LOAN-001-T1
    title: Copied
    status: draft
    level: unit
    when: x
    then: [y]`)
      const text = messages(changes).join('\n')
      expect(text).toContain('ID LOAN-001-T1 is also used in loans/LOAN-001.yaml')
      expect(text).toContain('test ID LOAN-001-T1 must start with LOAN-002-T')
    })

    it('reports two areas with the same prefix', () => {
      const changes = {
        ...edit('specai.yaml', 'areas: [loans]', 'areas: [loans, returns]'),
        'returns/area.yaml': 'specai: "0.1"\nprefix: LOAN\nname: Returns\n',
      }
      expect(messages(changes).join('\n')).toContain('prefix LOAN is already used by area "loans"')
    })
  })

  describe('links', () => {
    it('[CLI-003-T1] reports links to missing terms and requirements', () => {
      const changes = edit('loans/LOAN-002.yaml', 'then the service', 'then the [[lending-service]] (see [[LOAN-099]])')
      expect(messages(changes)).toEqual([
        'error links loans/LOAN-002.yaml: [[lending-service]] does not match any term or requirement',
        'error links loans/LOAN-002.yaml: [[LOAN-099]] does not match any term or requirement',
      ])
    })

    it('resolves links by slug, term or alias, ignoring case', () => {
      expect(check(edit('loans/LOAN-002.yaml', '[[members|member]]', '[[Member]], [[MEMBERS]] and [[member]]'))).toEqual([])
    })

    it('ignores link syntax inside inline code', () => {
      expect(check(edit('loans/LOAN-002.yaml', 'then the service', 'then the service (written `[[slug]]`)'))).toEqual([])
    })

    it('[CLI-003-T2] reports missing parent and related requirements', () => {
      const changes = edit('loans/LOAN-002.yaml', 'related: [LOAN-001]', 'related: [LOAN-007]\nparent: LOAN-008')
      expect(messages(changes)).toEqual([
        'error links loans/LOAN-002.yaml: related requirement LOAN-007 does not exist',
        'error links loans/LOAN-002.yaml: parent LOAN-008 does not exist',
      ])
    })

    it('reports a parent loop', () => {
      const changes = {
        ...edit('loans/LOAN-002.yaml', 'related: [LOAN-001]', 'parent: LOAN-001'),
        ...edit('loans/LOAN-001.yaml', 'components:', 'parent: LOAN-002\ncomponents:'),
      }
      expect(messages(changes).filter((m) => m.includes('loops'))).toHaveLength(2)
    })

    it('reports two terms sharing a name', () => {
      const changes = { 'glossary/borrower.yaml': 'specai: "0.1"\nterm: Borrower\naliases: [Members]\ndefinition: Someone.\n' }
      expect(messages(changes)).toEqual(['error links glossary/member.yaml: "members" also names the term in glossary/borrower.yaml'])
    })
  })

  describe('avoided words', () => {
    it('[CLI-004-T1] warns naming the preferred term', () => {
      const [d] = check(edit('loans/LOAN-001.yaml', 'then:\n      - The loan is refused', 'then:\n      - The Customer is told no'))
      expect(d).toMatchObject({ severity: 'warning', rule: 'avoid', id: 'LOAN-001-T1', field: '/tests/0/then/0', message: '"customer" is an avoided word; use [[member]]' })
    })

    it('matches whole words only and ignores inline code', () => {
      expect(check(edit('loans/LOAN-001.yaml', 'title: Loan limit', 'title: Loan limit for customers via `customer` field'))).toEqual([])
    })
  })

  describe('components', () => {
    it('[CLI-005-T1] reports a component not listed in specai.yaml', () => {
      const [d] = check(edit('loans/LOAN-001.yaml', 'components: [Library.API]', 'components: [Library.Api]'))
      expect(d).toMatchObject({ rule: 'components', field: '/components/0', message: 'component Library.Api is not listed in specai.yaml' })
    })

    it('reports a component listed twice', () => {
      const changes = edit('specai.yaml', '  - name: Library.API\n', '  - name: Library.API\n  - name: Library.API\n    path: api\n')
      expect(messages(changes)).toEqual(['error components specai.yaml: component Library.API is listed twice'])
    })
  })

  describe('test definition notes', () => {
    const withNotes = (notes: string) => edit('loans/LOAN-001.yaml', '      - The loan is refused\n', `      - The loan is refused\n    notes: |\n      ${notes}\n`)

    it('[CLI-014-T1] warns when notes name the test that implements it', () => {
      const [d] = check(withNotes('Implemented by `SixthLoan_IsRefused` in `LoanTests.cs`.'))
      expect(d).toMatchObject({ severity: 'warning', rule: 'notes', id: 'LOAN-001-T1', field: '/tests/0/notes', line: 15 })
    })

    it.each(['See loans.test.ts for the setup.', 'Lives in LoanTests.cs.', 'Tested in `web/loans.spec.tsx`.'])('also warns for "%s"', (notes) => {
      expect(messages(withNotes(notes))).toEqual([expect.stringContaining('warning notes loans/LOAN-001.yaml')])
    })

    it('[CLI-014-T2] passes other notes', () => {
      expect(check(withNotes('The limit counts open loans only. `specai validate` checks the wording; tested by hand at the desk.'))).toEqual([])
    })
  })
})
