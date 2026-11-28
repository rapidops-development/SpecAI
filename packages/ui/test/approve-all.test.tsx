// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeAnnouncements } from '../src/components/SaveFeedback.tsx'
import { SpecProvider } from '../src/components/SpecContext.tsx'
import { RequirementPage } from '../src/pages/RequirementPage.tsx'
import type { IndexedRequirement, SpecIndex, Status } from '../src/types.ts'

const test = (n: number, status: Status) => ({ id: `LOAN-001-T${n}`, title: `Check ${n}`, status, level: 'unit', when: 'A loan is made', then: ['It is recorded'] })

// Built by hand: the CLI's index builder reads the schema from disk, which jsdom cannot.
function page(statuses: Status[]) {
  const req = {
    id: 'LOAN-001',
    title: 'Loan limit',
    status: 'proposed',
    statement: 'The service shall refuse a sixth loan.',
    area: 'loans',
    file: 'loans/LOAN-001.yaml',
    hash: 'abc',
    tests: statuses.map((s, i) => test(i + 1, s)),
  } as unknown as IndexedRequirement
  const index = {
    name: 'Library',
    config: null,
    areas: [{ folder: 'loans', name: 'Loans', prefix: 'LOAN', file: 'loans/area.yaml', requirementIds: ['LOAN-001'] }],
    requirements: [req],
    terms: [],
    termIndex: {},
    backlinks: {},
    children: {},
    diagnostics: [],
  } as unknown as SpecIndex
  return render(
    <SpecProvider index={index}>
      <RequirementPage id="LOAN-001" />
    </SpecProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('approve all test definitions', () => {
  it('[UI-031-T1] approves every proposed test definition in one save', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ file: 'loans/LOAN-001.yaml', hash: 'def', notices: [], diagnostics: [] })))
    vi.stubGlobal('fetch', fetch)
    const heard: string[][] = []
    const stop = subscribeAnnouncements((m) => heard.push(m))
    page(['proposed', 'draft', 'proposed', 'approved'])

    fireEvent.click(screen.getByRole('button', { name: 'Approve all 2 proposed tests' }))
    await waitFor(() => expect(heard).toEqual([['2 test definitions of LOAN-001 approved']]))
    stop()

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/requirements/LOAN-001')
    const body = JSON.parse(init.body)
    expect(body.hash).toBe('abc')
    expect(body.data.status).toBe('proposed')
    expect(body.data.tests.map((t: { status: string }) => t.status)).toEqual(['approved', 'draft', 'approved', 'approved'])
  })

  it('[UI-031-T2] offers no Approve all for fewer than two proposed test definitions', () => {
    page(['proposed', 'approved', 'draft'])
    expect(screen.queryByRole('button', { name: /Approve all/ })).toBeNull()
    cleanup()
    page(['approved', 'approved'])
    expect(screen.queryByRole('button', { name: /Approve all/ })).toBeNull()
  })
})
