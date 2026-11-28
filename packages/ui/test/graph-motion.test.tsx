// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GraphView } from '../src/components/graph/GraphView.tsx'
import { knowledgeGraph } from '../src/lib/graph.ts'
import type { IndexedRequirement, SpecIndex } from '../src/types.ts'

// Built by hand: the CLI's index builder reads the schema from disk, which jsdom cannot.
const requirement = (id: string, related: string[] = []) =>
  ({ id, title: id, status: 'proposed', area: id.startsWith('LOAN') ? 'loans' : 'catalogue', statement: 'The service shall do it.', related, file: '', hash: '' }) as unknown as IndexedRequirement
function graph() {
  const requirements = [requirement('LOAN-001', ['LOAN-002', 'CAT-001']), requirement('LOAN-002'), requirement('LOAN-003'), requirement('CAT-001'), requirement('CAT-002')]
  const backlinks: Record<string, string[]> = {}
  for (const r of requirements) for (const to of r.related ?? []) (backlinks[to] ??= []).push(r.id)
  const area = (folder: string, name: string) => ({ folder, name, requirementIds: requirements.filter((r) => r.area === folder).map((r) => r.id) })
  return knowledgeGraph({ requirements, areas: [area('loans', 'Loans'), area('catalogue', 'Catalogue')], backlinks, terms: [], termIndex: {}, children: {} } as unknown as SpecIndex)
}

const kg = graph()
/** Where a point is drawn, rounded as the browser rounds its transform. */
const drawnAt = (id: string) => (document.querySelector(`[data-id="${id}"]`) as SVGGElement).style.transform.match(/-?[\d.]+/g)!.map((v) => Math.round(Number(v)))
const translate = (p: { x: number; y: number }) => [Math.round(p.x), Math.round(p.y)]
const show = (selected?: string) => render(<GraphView kg={kg} selected={selected} interactive label="Graph" onChoose={() => {}} />)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('knowledge graph motion', () => {
  it('[UI-033-T1] spreads points out from their area’s centre', async () => {
    show()
    const loans = kg.clusters.find((c) => c.area === 'loans')!
    const catalogue = kg.clusters.find((c) => c.area === 'catalogue')!
    expect(drawnAt('LOAN-003')).toEqual(translate(loans))
    expect(drawnAt('CAT-002')).toEqual(translate(catalogue))
    await waitFor(() => expect(drawnAt('LOAN-003')).toEqual(translate(kg.positions.get('LOAN-003')!)))
    expect(drawnAt('CAT-002')).toEqual(translate(kg.positions.get('CAT-002')!))
  })

  it('[UI-033-T2] draws points in their places at once under reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
    show()
    expect(drawnAt('LOAN-003')).toEqual(translate(kg.positions.get('LOAN-003')!))
  })

  it('[UI-033-T3] draws the selected requirement’s lines out from it', () => {
    show('LOAN-001')
    const lines = [...document.querySelectorAll('line.graph-draw')]
    expect(lines).toHaveLength(2)
    const from = kg.positions.get('LOAN-001')!
    for (const line of lines) expect([Number(line.getAttribute('x1')), Number(line.getAttribute('y1'))]).toEqual([from.x, from.y])
  })
})
