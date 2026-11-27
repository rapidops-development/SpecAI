// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GraphDialog } from '../src/components/graph/GraphDialog.tsx'
import { GraphPanel } from '../src/components/graph/GraphPanel.tsx'
import { Layout } from '../src/components/Layout.tsx'
import { SpecProvider } from '../src/components/SpecContext.tsx'
import type { IndexedRequirement, SpecIndex } from '../src/types.ts'

// Built by hand: the CLI's index builder reads the schema from disk, which jsdom cannot.
const requirement = (id: string, title: string, related: string[] = []) =>
  ({ id, title, status: 'proposed', area: id.startsWith('LOAN') ? 'loans' : 'catalogue', statement: 'The service shall do it.', related, file: '', hash: '' }) as unknown as IndexedRequirement

function libraryIndex(): SpecIndex {
  const requirements = [
    requirement('LOAN-001', 'Loan limit', ['LOAN-002', 'CAT-001']),
    requirement('LOAN-002', 'Loan period'),
    requirement('LOAN-003', 'Renewals', ['LOAN-002']),
    requirement('LOAN-004', 'Overdue reminders'),
    requirement('CAT-001', 'Search the catalogue'),
    requirement('CAT-002', 'Reserve a title'),
  ]
  const backlinks: Record<string, string[]> = {}
  for (const r of requirements) for (const to of r.related ?? []) (backlinks[to] ??= []).push(r.id)
  const area = (folder: string, name: string) => ({ folder, name, prefix: '', file: '', requirementIds: requirements.filter((r) => r.area === folder).map((r) => r.id) })
  return {
    name: 'Library',
    config: null,
    areas: [area('loans', 'Loans'), area('catalogue', 'Catalogue')],
    requirements,
    terms: [],
    termIndex: {},
    backlinks,
    children: {},
    diagnostics: [],
  } as unknown as SpecIndex
}

const point = (id: string) => document.querySelector(`[data-id="${id}"]`)!
const stateOf = (id: string) => point(id).getAttribute('data-state')

let index: SpecIndex
beforeEach(() => {
  index = libraryIndex()
  history.replaceState(null, '', '/')
})
afterEach(cleanup)

describe('knowledge graph panel', () => {
  const panel = (id: string) =>
    render(
      <SpecProvider index={index}>
        <h1>Requirement page</h1>
        <GraphPanel id={id} />
      </SpecProvider>,
    )

  it('[UI-026-T1] highlights the page’s requirement and the requirements linked to it', async () => {
    panel('LOAN-001')
    await waitFor(() => expect(stateOf('LOAN-001')).toBe('selected'))
    expect(stateOf('LOAN-002')).toBe('linked')
    expect(stateOf('CAT-001')).toBe('linked')
    expect(stateOf('LOAN-003')).toBe('dimmed')
    expect(screen.getByText('LOAN-001 and 2 linked requirements')).toBeTruthy()
  })

  it('[UI-026-T2] opens a requirement’s page when its point is chosen', async () => {
    panel('LOAN-001')
    await waitFor(() => expect(point('LOAN-003')).toBeTruthy())
    fireEvent.click(point('LOAN-003'))
    expect(location.pathname).toBe('/r/LOAN-003')
  })

  it('says when the page’s requirement is left out', async () => {
    index = { ...index, requirements: index.requirements.map((r) => (r.id === 'LOAN-004' ? { ...r, status: 'deprecated' } : r)) }
    panel('LOAN-004')
    expect(await screen.findByText('LOAN-004 is deprecated, so the graph leaves it out.')).toBeTruthy()
  })

  it('[UI-026-T3] expands into a dialog and closes with Escape', async () => {
    panel('LOAN-001')
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }))
    const dialog = await screen.findByRole('dialog', { name: 'Knowledge graph' })
    expect(await within(dialog).findByRole('region', { name: 'Selected: LOAN-001' })).toBeTruthy()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Requirement page' })).toBeTruthy()
  })
})

describe('expanded knowledge graph', () => {
  it('[UI-030-T1] opens from the navigation, centred on the area page’s area', async () => {
    render(
      <SpecProvider index={index}>
        <Layout route={{ page: 'area', folder: 'catalogue' }} connection="live">
          <h1>Catalogue page</h1>
        </Layout>
      </SpecProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Knowledge graph' }))
    const dialog = await screen.findByRole('dialog', { name: 'Knowledge graph' })
    const legend = await within(dialog).findByRole('region', { name: 'Areas' })
    expect(within(legend).getByRole('button', { name: /Catalogue/ }).getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => expect([stateOf('CAT-001'), stateOf('LOAN-001')]).toEqual(['normal', 'dimmed']))
  })

  const dialog = () =>
    render(
      <SpecProvider index={index}>
        <GraphDialog onClose={() => {}} />
      </SpecProvider>,
    )
  const linkedList = () => within(screen.getByRole('list', { name: 'Linked' })).getAllByRole('button').map((b) => b.textContent)

  it('[UI-029-T1] shows a selected requirement and highlights what links to it', async () => {
    dialog()
    await waitFor(() => expect(point('LOAN-001')).toBeTruthy())
    fireEvent.click(point('LOAN-001'))
    const card = screen.getByRole('region', { name: 'Selected: LOAN-001' })
    expect(within(card).getByRole('heading', { name: 'Loan limit' })).toBeTruthy()
    expect(within(card).getByText('Proposed')).toBeTruthy()
    expect(within(card).getByRole('link', { name: 'Open requirement' }).getAttribute('href')).toBe('/r/LOAN-001')
    expect(linkedList()).toEqual(['LOAN-002Loan period', 'CAT-001Search the catalogue'])
    expect([stateOf('LOAN-002'), stateOf('CAT-001'), stateOf('LOAN-004')]).toEqual(['linked', 'linked', 'dimmed'])
  })

  it('[UI-029-T2] moves to a linked requirement chosen from the list', async () => {
    dialog()
    await waitFor(() => expect(point('LOAN-001')).toBeTruthy())
    fireEvent.click(point('LOAN-001'))
    fireEvent.click(screen.getByRole('button', { name: /LOAN-002/ }))
    expect(screen.getByRole('region', { name: 'Selected: LOAN-002' })).toBeTruthy()
    expect(linkedList()).toEqual(['LOAN-001Loan limit', 'LOAN-003Renewals'])
    expect(stateOf('LOAN-002')).toBe('selected')
  })

  it('[UI-029-T3] selects a requirement found by part of its title', async () => {
    dialog()
    await waitFor(() => expect(point('CAT-002')).toBeTruthy())
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a requirement' }), { target: { value: 'reserve' } })
    fireEvent.click(within(screen.getByRole('list', { name: 'Matches' })).getByRole('button', { name: /CAT-002/ }))
    expect(screen.getByRole('region', { name: 'Selected: CAT-002' })).toBeTruthy()
    expect(stateOf('CAT-002')).toBe('selected')
  })

  it('centres on an area chosen in the legend', async () => {
    dialog()
    fireEvent.click(await screen.findByRole('button', { name: /Catalogue/ }))
    expect(screen.getByRole('button', { name: /Catalogue/ }).getAttribute('aria-pressed')).toBe('true')
    expect([stateOf('CAT-001'), stateOf('LOAN-001')]).toEqual(['normal', 'dimmed'])
  })
})
