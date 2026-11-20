import { describe, expect, it } from 'vitest'
import { applyFilters, emptyFilters, groupRequirements } from '../src/lib/filters.ts'
import { issueHref } from '../src/lib/issues.ts'
import type { SpecIndex } from '../src/types.ts'
import { sampleIndex } from './fixture.ts'

const ids = (reqs: { id: string }[]) => reqs.map((r) => r.id)

describe('implementation status', () => {
  const index = sampleIndex()
  const traced = {
    ...index,
    trace: { implementation: { 'LOAN-001': 'implemented', 'LOAN-002': 'unimplemented', 'CAT-001': 'planned' }, implementations: {}, coverage: {}, links: {} },
  } as unknown as SpecIndex

  it('[UI-019-T1] filters and groups by implementation status', () => {
    expect(ids(applyFilters(traced.requirements, { ...emptyFilters(), implementation: ['planned', 'unimplemented'] }, traced))).toEqual(['LOAN-002', 'CAT-001'])
    expect(groupRequirements(traced, traced.requirements, 'implementation').map((g) => g.label)).toEqual(['Implemented', 'Planned', 'Not implemented'])
  })
})

describe('issue links', () => {
  it('[UI-020-T1] links shorthand to GitHub by default', () => {
    expect(issueHref('acme/library#12')).toBe('https://github.com/acme/library/issues/12')
  })

  it('[UI-020-T2] links shorthand through the issueUrl template', () => {
    expect(issueHref('acme/library#12', 'https://tracker.example.com/{owner}/{repo}/{number}')).toBe('https://tracker.example.com/acme/library/12')
  })

  it('[UI-020-T3] links a URL as written', () => {
    expect(issueHref('https://tracker.example.com/browse/LIB-7', 'https://x/{number}')).toBe('https://tracker.example.com/browse/LIB-7')
  })
})
