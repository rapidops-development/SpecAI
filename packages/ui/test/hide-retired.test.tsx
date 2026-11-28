// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Layout } from '../src/components/Layout.tsx'
import { SpecProvider } from '../src/components/SpecContext.tsx'
import { createSearch } from '../src/lib/search.ts'
import { neighbours } from '../src/lib/sequence.ts'
import { ListPage } from '../src/pages/ListPage.tsx'
import type { IndexedRequirement, SpecIndex, Status } from '../src/types.ts'

// Built by hand: the CLI's index builder reads the schema from disk, which jsdom cannot.
const req = (id: string, status: Status) =>
  ({ id, status, title: `Title of ${id}`, statement: 'The service shall do it.', area: 'loans', file: `loans/${id}.yaml`, hash: '' }) as unknown as IndexedRequirement
const libraryIndex = (reqs: IndexedRequirement[]) =>
  ({
    name: 'Library',
    config: null,
    areas: [{ folder: 'loans', name: 'Loans', prefix: 'LOAN', file: 'loans/area.yaml', requirementIds: reqs.map((r) => r.id) }],
    requirements: reqs,
    terms: [],
    termIndex: {},
    backlinks: {},
    children: {},
    diagnostics: [],
  }) as unknown as SpecIndex

const listed = () => screen.queryAllByRole('link', { name: /^LOAN-/ }).map((a) => a.textContent!.match(/LOAN-\d+/)![0])

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('hiding deprecated and removed requirements', () => {
  const index = libraryIndex([req('LOAN-001', 'proposed'), req('LOAN-002', 'deprecated'), req('LOAN-003', 'removed')])
  const page = (search = '') =>
    render(
      <SpecProvider index={index}>
        <Layout route={{ page: 'list' }} connection="live">
          <ListPage search={search} />
        </Layout>
      </SpecProvider>,
    )
  const navCount = () => within(screen.getByRole('navigation', { name: 'Spec tree' })).getByRole('link', { name: /Loans/ }).textContent

  it('[UI-032-T1] hides them until the switch shows them, and remembers the choice', () => {
    page()
    expect(listed()).toEqual(['LOAN-001'])
    expect(navCount()).toBe('Loans1')
    const toggle = screen.getByRole('switch', { name: /Show deprecated and removed/ })
    expect(toggle.closest('label')!.textContent).toContain('2')

    fireEvent.click(toggle)
    expect(listed()).toEqual(['LOAN-001', 'LOAN-002', 'LOAN-003'])
    expect(navCount()).toBe('Loans3')

    cleanup()
    page()
    expect((screen.getByRole('switch', { name: /Show deprecated and removed/ }) as HTMLInputElement).checked).toBe(true)
    expect(listed()).toEqual(['LOAN-001', 'LOAN-002', 'LOAN-003'])
  })

  it('[UI-032-T2] lists deprecated requirements when the status filter chooses them', () => {
    page()
    const status = screen.getByRole('group', { name: 'Status' })
    expect(within(status).getByText('Deprecated').parentElement!.textContent).toBe('Deprecated1')
    cleanup()
    page('?status=deprecated')
    expect(listed()).toEqual(['LOAN-002'])
  })
})

describe('stepping past hidden requirements', () => {
  it('[UI-032-T3] links past a deprecated requirement, and from it to its neighbours', () => {
    const index = libraryIndex([req('LOAN-001', 'proposed'), req('LOAN-002', 'deprecated'), req('LOAN-003', 'approved')])
    const runSearch = createSearch(index)
    const first = neighbours(index, runSearch, '', 'LOAN-001', false)
    expect([first.next?.id, first.total]).toEqual(['LOAN-003', 2])
    const hidden = neighbours(index, runSearch, '', 'LOAN-002', false)
    expect([hidden.previous?.id, hidden.next?.id, hidden.position]).toEqual(['LOAN-001', 'LOAN-003', undefined])
  })
})
