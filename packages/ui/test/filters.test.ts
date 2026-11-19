import { describe, expect, it } from 'vitest'
import { applyFilters, emptyFilters, facetOptions, groupRequirements, parseListState, serializeListState } from '../src/lib/filters.ts'
import type { SpecIndex } from '../src/types.ts'
import { createSearch } from '../src/lib/search.ts'
import { sampleIndex } from './fixture.ts'

const ids = (reqs: { id: string }[]) => reqs.map((r) => r.id)

describe('requirement list', () => {
  const index = sampleIndex()

  it('lists requirements in area order from specai.yaml', () => {
    expect(ids(index.requirements)).toEqual(['LOAN-001', 'LOAN-002', 'CAT-001'])
  })

  it('[UI-002-T1] filters with AND across facets and OR within one', () => {
    const filters = { ...emptyFilters(), status: ['proposed', 'approved'], component: ['Library.API'] }
    expect(ids(applyFilters(index.requirements, filters))).toEqual(['LOAN-001'])
    expect(ids(applyFilters(index.requirements, { ...emptyFilters(), level: ['untested'] }))).toEqual(['LOAN-002'])
  })

  it('[UI-002-T2] groups by a facet, putting requirements without a value last', () => {
    const groups = groupRequirements(index, index.requirements, 'tag')
    expect(groups.map((g) => [g.label, ids(g.items)])).toEqual([
      ['search', ['CAT-001']],
      ['No tag', ['LOAN-001', 'LOAN-002']],
    ])
    expect(groupRequirements(index, index.requirements, 'area').map((g) => g.label)).toEqual(['Loans', 'Catalogue'])
  })

  it('counts facet values, listing every component from specai.yaml', () => {
    expect(facetOptions(index, index.requirements, 'component')).toEqual([
      { value: 'Library.API', label: 'Library.API', count: 1 },
      { value: 'Library.Web', label: 'Library.Web', count: 1 },
    ])
  })

  it('[UI-003-T1] round-trips search, filters and grouping through the URL', () => {
    const state = { q: 'loan limit', filters: { ...emptyFilters(), status: ['draft', 'proposed'] }, group: 'area' as const }
    const search = serializeListState(state)
    expect(search).toBe('?q=loan+limit&status=draft&status=proposed&group=area')
    expect(parseListState(search)).toEqual(state)
    expect(parseListState('?group=nonsense').group).toBe('none')
  })
})

describe('search', () => {
  const search = createSearch(sampleIndex())

  it('[UI-001-T1] tolerates typos', () => {
    expect(ids(search('caatalog'))).toEqual(['CAT-001'])
  })

  it('[UI-001-T2] ranks an ID or title match above a statement match', () => {
    expect(ids(search('loan')).slice(0, 2)).toEqual(['LOAN-001', 'LOAN-002'])
  })

  it('searches test definitions and linked glossary terms', () => {
    expect(ids(search('hobbit'))).toEqual(['CAT-001'])
    expect(ids(search('members'))).toEqual(expect.arrayContaining(['LOAN-001', 'LOAN-002']))
  })

  it('returns everything for an empty query', () => {
    expect(search('  ')).toHaveLength(3)
  })
})

describe('coverage', () => {
  const index = sampleIndex()
  const traced: SpecIndex = {
    ...index,
    trace: { checkouts: '/x', links: {}, unknown: [], missing: [], coverage: { 'LOAN-001': 'covered', 'LOAN-002': 'untested', 'CAT-001': 'uncovered' } },
  }

  it('[UI-014-T1] filters and groups by coverage', () => {
    expect(ids(applyFilters(traced.requirements, { ...emptyFilters(), coverage: ['uncovered', 'untested'] }, traced))).toEqual(['LOAN-002', 'CAT-001'])
    expect(groupRequirements(traced, traced.requirements, 'coverage').map((g) => g.label)).toEqual(['Covered', 'Not covered', 'No test definitions'])
  })

  it('offers no coverage filter when the server did not scan test code', () => {
    expect(facetOptions(index, index.requirements, 'coverage')).toEqual([])
  })
})
