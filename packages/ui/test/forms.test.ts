import { describe, expect, it } from 'vitest'
import { schemaDocuments } from '../../cli/src/schema.ts'
import { assignTestIds, cleanData, formFields } from '../src/lib/fields.ts'
import { transitions } from '../src/lib/statuses.ts'

describe('edit forms', () => {
  const schemas = schemaDocuments() as never

  it('[UI-013-T1] takes requirement fields and their kinds from the schema', () => {
    const fields = formFields(schemas, 'requirement')
    expect(fields.map((f) => [f.key, f.kind, f.required])).toEqual([
      ['title', 'text', true],
      ['statement', 'longText', true],
      ['rationale', 'markdown', false],
      ['acceptance', 'textList', false],
      ['notes', 'markdown', false],
      ['tags', 'tags', false],
      ['components', 'components', false],
      ['parent', 'requirementId', false],
      ['related', 'requirementIds', false],
      ['issues', 'names', false],
      ['tests', 'tests', false],
    ])
  })

  it('builds forms from the schema of the spec tree\'s version', () => {
    const fields = formFields(schemaDocuments('0.1') as never, 'requirement')
    expect(fields.map((f) => f.key)).not.toContain('issues')
  })

  it('takes test definition and glossary fields from the schema', () => {
    expect(formFields(schemas, 'test').map((f) => [f.key, f.kind])).toEqual([
      ['title', 'text'],
      ['level', 'enum'],
      ['given', 'textList'],
      ['when', 'longText'],
      ['then', 'textList'],
      ['notes', 'markdown'],
    ])
    expect(formFields(schemas, 'test').find((f) => f.key === 'level')?.options).toEqual(['unit', 'integration', 'e2e', 'manual'])
    expect(formFields(schemas, 'glossary-term').map((f) => [f.key, f.kind])).toEqual([
      ['term', 'text'],
      ['aliases', 'names'],
      ['definition', 'markdown'],
      ['avoid', 'names'],
    ])
  })

  it('drops cleared fields and empty lines', () => {
    expect(cleanData({ title: 'A', rationale: '  ', acceptance: ['', 'x', ' '], tags: [], tests: [{ id: 'A-001-T1', given: [''] }] })).toEqual({
      title: 'A',
      acceptance: ['x'],
      tests: [{ id: 'A-001-T1' }],
    })
  })

  it('[UI-007-T2] gives new test definitions the next unused number', () => {
    expect(assignTestIds<{ id?: string }>('LOAN-001', [{ id: 'LOAN-001-T1' }, { id: 'LOAN-001-T3' }, {}, {}]).map((t) => t.id)).toEqual([
      'LOAN-001-T1',
      'LOAN-001-T3',
      'LOAN-001-T4',
      'LOAN-001-T5',
    ])
    expect(assignTestIds<{ id?: string }>('LOAN-002', [{}]).map((t) => t.id)).toEqual(['LOAN-002-T1'])
  })

  it('[UI-008-T3] offers approval only to proposed items', () => {
    expect(transitions('proposed').map((t) => t.label)).toEqual(['Approve', 'Back to draft'])
    expect(transitions('draft').map((t) => t.label)).toEqual(['Propose'])
    expect(transitions('approved').map((t) => t.label)).toEqual(['Deprecate'])
    expect(transitions('deprecated').map((t) => t.label)).toEqual(['Restore', 'Remove'])
  })
})
