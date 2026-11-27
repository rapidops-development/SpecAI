import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildIndex } from '../../cli/src/spec-index.ts'
import { buildGraph, layoutGraph, similarities } from '../src/lib/graph.ts'

const areas = { loans: 'LOAN', catalogue: 'CAT', members: 'MEM' } as const
type Folder = keyof typeof areas

interface Req {
  id: string
  status?: string
  related?: string[]
  parent?: string
  statement?: string
  test?: string
  components?: string[]
}

/** A lending-library spec tree with the given requirements. */
function tree(reqs: Req[], terms: string[] = []) {
  const files: Record<string, string> = {
    'specai.yaml': `specai: "0.2"\nareas: [loans, catalogue, members]\ncomponents:\n  - name: Library.API\n  - name: Library.Web\n  - name: Library.Jobs\n`,
  }
  for (const [folder, prefix] of Object.entries(areas)) files[`${folder}/area.yaml`] = `specai: "0.2"\nprefix: ${prefix}\nname: ${folder[0].toUpperCase()}${folder.slice(1)}\n`
  for (const t of terms) files[`glossary/${t}.yaml`] = `specai: "0.2"\nterm: ${t}\ndefinition: A ${t}.\n`
  for (const r of reqs) {
    const folder = (Object.entries(areas).find(([, p]) => r.id.startsWith(p))![0]) as Folder
    files[`${folder}/${r.id}.yaml`] = [
      'specai: "0.2"',
      `id: ${r.id}`,
      `title: Requirement ${r.id}`,
      `status: ${r.status ?? 'proposed'}`,
      `statement: ${JSON.stringify(r.statement ?? 'The service shall do one thing.')}`,
      r.related ? `related: [${r.related.join(', ')}]` : '',
      r.parent ? `parent: ${r.parent}` : '',
      r.components ? `components: [${r.components.join(', ')}]` : '',
      r.test ? `tests:\n  - id: ${r.id}-T1\n    title: A check\n    status: proposed\n    level: unit\n    when: ${JSON.stringify(r.test)}\n    then: [It works]` : '',
    ].filter(Boolean).join('\n') + '\n'
  }
  const root = mkdtempSync(join(tmpdir(), 'specai-graph-'))
  made.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return buildIndex(root)
}

const made: string[] = []
afterAll(() => made.forEach((root) => rmSync(root, { recursive: true, force: true })))

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-${String(i + 1).padStart(3, '0')}`)
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe('knowledge graph', () => {
  it('[UI-025-T1] has a point per live requirement and one line per linked pair', () => {
    const index = tree([
      { id: 'LOAN-001', related: ['LOAN-002', 'LOAN-009'] },
      { id: 'LOAN-002', related: ['LOAN-001'] },
      { id: 'LOAN-003', parent: 'LOAN-001' },
      { id: 'LOAN-004', statement: 'When a loan is renewed, the service shall apply [[LOAN-005]].', test: 'A renewal under [[LOAN-002]]' },
      { id: 'LOAN-005', statement: 'The service shall keep [[LOAN-009]] in mind.' },
      { id: 'LOAN-009', status: 'deprecated' },
    ])
    expect(index.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    const graph = buildGraph(index)
    expect(graph.nodes.map((n) => n.id)).toEqual(['LOAN-001', 'LOAN-002', 'LOAN-003', 'LOAN-004', 'LOAN-005'])
    expect(graph.edges.map((e) => `${e.a} ${e.b}`).sort()).toEqual(['LOAN-001 LOAN-002', 'LOAN-001 LOAN-003', 'LOAN-002 LOAN-004', 'LOAN-004 LOAN-005'])
  })

  it('[UI-027-T1] gives each area its own cluster, with no overlaps', () => {
    const reqs: Req[] = [
      ...ids('LOAN', 12).map((id, i, all) => ({ id, related: i > 0 ? [all[i - 1]] : undefined })),
      ...ids('CAT', 8).map((id, i) => ({ id, related: i < 3 ? [`LOAN-00${i + 1}`] : undefined })),
      ...ids('MEM', 5).map((id) => ({ id })),
    ]
    const index = tree(reqs)
    const layout = layoutGraph(index, buildGraph(index))
    expect(layout.clusters.map((c) => [c.area, c.ids.length])).toEqual([['loans', 12], ['catalogue', 8], ['members', 5]])
    for (const [i, p] of layout.clusters.entries())
      for (const q of layout.clusters.slice(i + 1)) expect(distance(p, q)).toBeGreaterThan(p.r + q.r)
    for (const c of layout.clusters) for (const id of c.ids) expect(distance(layout.positions.get(id)!, c)).toBeLessThan(c.r)
  })

  it('[UI-027-T2] places areas that link more nearer each other', () => {
    const reqs: Req[] = [
      ...ids('LOAN', 8).map((id, i) => ({ id, related: [`CAT-00${i + 1}`] })),
      ...ids('CAT', 8).map((id) => ({ id })),
      ...ids('MEM', 8).map((id) => ({ id })),
    ]
    const index = tree(reqs)
    const { clusters } = layoutGraph(index, buildGraph(index))
    const [loans, catalogue, members] = clusters
    expect(distance(loans, catalogue)).toBeLessThan(distance(loans, members))
  })

  it('[UI-028-T1] places linked requirements nearer each other than unrelated ones', () => {
    const reqs: Req[] = [{ id: 'LOAN-001', related: ['LOAN-002'] }, ...ids('LOAN', 10).slice(1).map((id) => ({ id }))]
    const index = tree(reqs)
    const { positions } = layoutGraph(index, buildGraph(index))
    const p = (id: string) => positions.get(id)!
    expect(distance(p('LOAN-001'), p('LOAN-002'))).toBeLessThan(distance(p('LOAN-009'), p('LOAN-010')))
  })

  it('[UI-028-T2] counts a rare shared term for more than a common one', () => {
    const index = tree(
      [
        { id: 'LOAN-001', statement: 'The service shall charge a [[fine]] to a [[member]].' },
        { id: 'LOAN-002', statement: 'The service shall waive a [[fine]] for a [[member]].' },
        { id: 'LOAN-003', statement: 'The service shall greet a [[member]].' },
        { id: 'LOAN-004', statement: 'The service shall thank a [[member]].' },
      ],
      ['fine', 'member'],
    )
    const strength = similarities(index)
    const of = (a: string, b: string) => strength.get(a)?.get(b) ?? 0
    expect(of('LOAN-001', 'LOAN-002')).toBeGreaterThan(of('LOAN-003', 'LOAN-004'))
    expect(of('LOAN-003', 'LOAN-004')).toBe(0)
  })

  it('lays out the same graph the same way every time', () => {
    const reqs: Req[] = ids('LOAN', 6).map((id, i, all) => ({ id, related: i ? [all[0]] : undefined }))
    const a = layoutGraph(tree(reqs), buildGraph(tree(reqs)))
    const b = layoutGraph(tree(reqs), buildGraph(tree(reqs)))
    expect([...a.positions]).toEqual([...b.positions])
  })

  it('keeps only rare shared features as close relations, never pairs already linked', () => {
    const index = tree([
      { id: 'LOAN-001', components: ['Library.Jobs'], related: ['LOAN-002'] },
      { id: 'LOAN-002', components: ['Library.Jobs'] },
      { id: 'LOAN-003', components: ['Library.Jobs'] },
      { id: 'LOAN-004', components: ['Library.API'] },
      { id: 'LOAN-005', components: ['Library.API'] },
      { id: 'LOAN-006', components: ['Library.Web'] },
    ])
    const graph = buildGraph(index)
    expect(graph.related.get('LOAN-001')).toEqual(['LOAN-003'])
    expect(graph.related.get('LOAN-004')).toEqual(['LOAN-005'])
    expect(graph.related.get('LOAN-006')).toEqual([])
  })
})
