import type { IndexedRequirement, SpecIndex } from '../types.ts'
import { applyFilters, emptyFilters, groupRequirements, type ListState, parseListState } from './filters.ts'
import { visible } from './visibility.ts'

type Search = (query: string) => IndexedRequirement[]

/** The requirements a list shows, in the order it shows them, each once even when it is in several groups. */
export function listOrder(index: SpecIndex, runSearch: Search, state: ListState, showRetired = true): IndexedRequirement[] {
  const matches = applyFilters(visible(runSearch(state.q), showRetired, state.filters.status), state.filters, index)
  const seen = new Set<string>()
  return groupRequirements(index, matches, state.group)
    .flatMap((g) => g.items)
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
}

export interface Neighbours {
  previous?: IndexedRequirement
  next?: IndexedRequirement
  /** Where the requirement is in the list, counting from 1; absent when it has left the list. */
  position?: number
  total: number
}

/**
 * The requirements before and after one in the list a URL's search describes. When the requirement
 * is no longer in that list, such as after a status change or because it is deprecated and hidden,
 * its neighbours are the nearest list members around where it sits in the same list without filters.
 */
// SpecAI: UI-021, UI-032
export function neighbours(index: SpecIndex, runSearch: Search, search: string, id: string, showRetired = true): Neighbours {
  const state = parseListState(search)
  const list = listOrder(index, runSearch, state, showRetired)
  const total = list.length
  const at = list.findIndex((r) => r.id === id)
  if (at !== -1) return { previous: list[at - 1], next: list[at + 1], position: at + 1, total }

  const unfiltered = { ...state, filters: emptyFilters() }
  let reference = listOrder(index, runSearch, unfiltered)
  if (!reference.some((r) => r.id === id)) reference = listOrder(index, runSearch, { ...unfiltered, q: '' })
  const place = new Map(reference.map((r, i) => [r.id, i]))
  const here = place.get(id)
  if (here === undefined) return { total }
  let previous: IndexedRequirement | undefined
  let next: IndexedRequirement | undefined
  for (const r of list) {
    const p = place.get(r.id)!
    if (p < here && (!previous || p > place.get(previous.id)!)) previous = r
    if (p > here && (!next || p < place.get(next.id)!)) next = r
  }
  return { previous, next, total }
}
