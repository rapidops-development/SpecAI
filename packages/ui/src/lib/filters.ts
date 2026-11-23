import type { IndexedRequirement, SpecIndex } from '../types.ts'

export const facets = ['area', 'status', 'implementation', 'coverage', 'tag', 'component', 'level'] as const
export type Facet = (typeof facets)[number]
export type Grouping = Facet | 'none'

export const facetLabels: Record<Facet, string> = {
  area: 'Area',
  status: 'Status',
  implementation: 'Implementation',
  coverage: 'Coverage',
  tag: 'Tag',
  component: 'Component',
  level: 'Test level',
}

export const statusOrder = ['draft', 'proposed', 'approved', 'deprecated', 'removed']
const levelOrder = ['unit', 'integration', 'e2e', 'manual', 'untested']
export const coverageOrder = ['covered', 'partial', 'uncovered', 'untested']
export const coverageLabels: Record<string, string> = {
  covered: 'Covered',
  partial: 'Partly covered',
  uncovered: 'Not covered',
  untested: 'No test definitions',
}

export const implementationOrder = ['implemented', 'planned', 'unimplemented']
export const implementationLabels: Record<string, string> = {
  implemented: 'Implemented',
  planned: 'Planned',
  unimplemented: 'Not implemented',
}

export interface ListState {
  q: string
  filters: Record<Facet, string[]>
  group: Grouping
}

export function emptyFilters(): Record<Facet, string[]> {
  return { area: [], status: [], implementation: [], coverage: [], tag: [], component: [], level: [] }
}

export function parseListState(search: string): ListState {
  const params = new URLSearchParams(search)
  const filters = emptyFilters()
  for (const facet of facets) filters[facet] = params.getAll(facet)
  const group = params.get('group')
  return {
    q: params.get('q') ?? '',
    filters,
    group: group && (facets as readonly string[]).includes(group) ? (group as Facet) : 'none',
  }
}

export function serializeListState(state: ListState): string {
  const params = new URLSearchParams()
  if (state.q) params.set('q', state.q)
  for (const facet of facets) for (const value of state.filters[facet]) params.append(facet, value)
  if (state.group !== 'none') params.set('group', state.group)
  const text = params.toString()
  return text ? `?${text}` : ''
}

/**
 * The values a requirement has for a facet. A requirement with no tests has the level "untested".
 * Coverage and implementation come from the index's trace, and is empty when the server was not given checkouts.
 */
export function facetValues(req: IndexedRequirement, facet: Facet, index?: SpecIndex): string[] {
  switch (facet) {
    case 'coverage': {
      const coverage = index?.trace?.coverage[req.id]
      return coverage ? [coverage] : []
    }
    case 'implementation': {
      const implementation = index?.trace?.implementation?.[req.id]
      return implementation ? [implementation] : []
    }
    case 'area':
      return [req.area]
    case 'status':
      return [req.status]
    case 'tag':
      return req.tags ?? []
    case 'component':
      return req.components ?? []
    case 'level': {
      const levels = [...new Set((req.tests ?? []).map((t) => t.level))]
      return levels.length > 0 ? levels : ['untested']
    }
  }
}

/** Keeps requirements matching every facet that has a selection, and any selected value within it. */
export function applyFilters(reqs: IndexedRequirement[], filters: Record<Facet, string[]>, index?: SpecIndex): IndexedRequirement[] {
  return reqs.filter((req) =>
    facets.every((facet) => filters[facet].length === 0 || facetValues(req, facet, index).some((v) => filters[facet].includes(v))),
  )
}

/** The values a facet always offers, whether or not a requirement has them. */
function fixedValues(index: SpecIndex, facet: Facet): string[] {
  switch (facet) {
    case 'status':
      return statusOrder
    case 'level':
      return levelOrder
    case 'coverage':
      return index.trace ? coverageOrder : []
    case 'implementation':
      return index.trace?.implementation ? implementationOrder : []
    case 'component':
      return (index.config?.components ?? []).map((c) => c.name)
    default:
      return []
  }
}

/**
 * Every value of a facet, in display order. Each counts the requirements the list would show with
 * that value the only one chosen in the facet: the facet's own selection is left out, the others kept.
 */
// SpecAI: UI-023, UI-024
export function facetOptions(
  index: SpecIndex,
  reqs: IndexedRequirement[],
  filters: Record<Facet, string[]>,
  facet: Facet,
): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const req of applyFilters(reqs, { ...filters, [facet]: [] }, index))
    for (const v of facetValues(req, facet, index)) counts.set(v, (counts.get(v) ?? 0) + 1)
  const all = new Set<string>([...fixedValues(index, facet), ...index.requirements.flatMap((r) => facetValues(r, facet, index))])
  return sortValues(index, facet, [...all]).map((value) => ({ value, label: valueLabel(index, facet, value), count: counts.get(value) ?? 0 }))
}

export interface Group {
  key: string
  label: string
  items: IndexedRequirement[]
}

/** Groups requirements, keeping their order. A requirement with several values appears in each group. */
export function groupRequirements(index: SpecIndex, reqs: IndexedRequirement[], grouping: Grouping): Group[] {
  if (grouping === 'none') return [{ key: 'all', label: 'All requirements', items: reqs }]
  const groups = new Map<string, IndexedRequirement[]>()
  const none: IndexedRequirement[] = []
  for (const req of reqs) {
    const values = facetValues(req, grouping, index)
    if (values.length === 0) none.push(req)
    for (const v of values) groups.set(v, [...(groups.get(v) ?? []), req])
  }
  const result = sortValues(index, grouping, [...groups.keys()]).map((key) => ({
    key,
    label: valueLabel(index, grouping, key),
    items: groups.get(key)!,
  }))
  if (none.length > 0) result.push({ key: '', label: `No ${facetLabels[grouping].toLowerCase()}`, items: none })
  return result
}

function sortValues(index: SpecIndex, facet: Facet, values: string[]): string[] {
  const rank = (order: string[]) => (v: string) => {
    const i = order.indexOf(v)
    return i === -1 ? order.length : i
  }
  const by =
    facet === 'area' ? rank(index.areas.map((a) => a.folder))
    : facet === 'status' ? rank(statusOrder)
    : facet === 'level' ? rank(levelOrder)
    : facet === 'coverage' ? rank(coverageOrder)
    : facet === 'implementation' ? rank(implementationOrder)
    : facet === 'component' ? rank((index.config?.components ?? []).map((c) => c.name))
    : () => 0
  return values.sort((a, b) => by(a) - by(b) || a.localeCompare(b))
}

export function valueLabel(index: SpecIndex, facet: Facet, value: string): string {
  if (facet === 'area') return index.areas.find((a) => a.folder === value)?.name ?? value
  if (facet === 'coverage') return coverageLabels[value] ?? value
  if (facet === 'implementation') return implementationLabels[value] ?? value
  if (facet === 'level') return value === 'e2e' ? 'End to end' : value === 'untested' ? 'No tests' : value[0].toUpperCase() + value.slice(1)
  if (facet === 'status') return value[0].toUpperCase() + value.slice(1)
  return value
}
