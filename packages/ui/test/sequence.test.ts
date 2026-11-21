import { describe, expect, it } from 'vitest'
import { emptyFilters, serializeListState } from '../src/lib/filters.ts'
import { createSearch } from '../src/lib/search.ts'
import { neighbours } from '../src/lib/sequence.ts'
import type { IndexedRequirement, SpecIndex } from '../src/types.ts'

// Built by hand, in area order as the server lists them: loans, then catalogue.
const req = (id: string, area: string, status: string) =>
  ({ id, area, status, title: id, statement: `${id} statement`, file: `${area}/${id}.yaml`, hash: '' }) as IndexedRequirement
const index = {
  requirements: [
    req('LOAN-001', 'loans', 'proposed'),
    req('LOAN-002', 'loans', 'approved'),
    req('LOAN-003', 'loans', 'proposed'),
    req('CAT-001', 'catalogue', 'proposed'),
    req('CAT-002', 'catalogue', 'draft'),
  ],
  areas: [{ folder: 'loans', name: 'Loans' }, { folder: 'catalogue', name: 'Catalogue' }],
  terms: [],
  termIndex: {},
  backlinks: {},
  children: {},
  diagnostics: [],
} as unknown as SpecIndex
const runSearch = createSearch(index)
const ids = (n: ReturnType<typeof neighbours>) => [n.previous?.id, n.next?.id]
const proposed = serializeListState({ q: '', filters: { ...emptyFilters(), status: ['proposed'] }, group: 'area' })

describe('stepping through a list of requirements', () => {
  it('[UI-021-T1] links to the requirements either side in the filtered, grouped list', () => {
    const n = neighbours(index, runSearch, proposed, 'LOAN-003')
    expect(ids(n)).toEqual(['LOAN-001', 'CAT-001'])
    expect([n.position, n.total]).toEqual([2, 3])
  })

  it('[UI-021-T2] steps through all requirements when opened without a list', () => {
    expect(ids(neighbours(index, runSearch, '', 'LOAN-001'))).toEqual([undefined, 'LOAN-002'])
    expect(ids(neighbours(index, runSearch, '', 'CAT-002'))).toEqual(['CAT-001', undefined])
  })

  it('[UI-021-T3] goes to the nearest list members when the requirement has left the list', () => {
    const n = neighbours(index, runSearch, proposed, 'LOAN-002')
    expect(ids(n)).toEqual(['LOAN-001', 'LOAN-003'])
    expect(n.position).toBeUndefined()
  })
})
