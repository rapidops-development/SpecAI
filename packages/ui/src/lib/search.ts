import Fuse from 'fuse.js'
import type { IndexedRequirement, SpecIndex } from '../types.ts'

interface Doc {
  id: string
  title: string
  statement: string
  tests: string[]
  rationale: string
  notes: string
  terms: string[]
}

/** Builds a fuzzy search over requirements that returns matches best first. */
export function createSearch(index: SpecIndex): (query: string) => IndexedRequirement[] {
  const docs: Doc[] = index.requirements.map((r) => ({
    id: r.id,
    title: r.title,
    statement: r.statement,
    tests: (r.tests ?? []).flatMap((t) => [t.id, t.title, ...(t.given ?? []), t.when, ...t.then]),
    rationale: [r.rationale ?? '', ...(r.acceptance ?? [])].join('\n'),
    notes: r.notes ?? '',
    terms: linkedTerms(index, r),
  }))
  const fuse = new Fuse(docs, {
    keys: [
      { name: 'id', weight: 4 },
      { name: 'title', weight: 3 },
      { name: 'statement', weight: 2 },
      { name: 'tests', weight: 2 },
      { name: 'rationale', weight: 1 },
      { name: 'notes', weight: 1 },
      { name: 'terms', weight: 1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    ignoreDiacritics: true,
  })
  const byId = new Map(index.requirements.map((r) => [r.id, r]))
  return (query) => {
    const q = query.trim()
    if (!q) return index.requirements
    return fuse.search(q).map((result) => byId.get(result.item.id)!)
  }
}

/** Names and aliases of the glossary terms a requirement links to. */
function linkedTerms(index: SpecIndex, req: IndexedRequirement): string[] {
  const slugs = new Set(
    Object.entries(index.backlinks)
      .filter(([key, from]) => key.startsWith('term:') && from.includes(req.id))
      .map(([key]) => key.slice(5)),
  )
  return index.terms.filter((t) => slugs.has(t.slug)).flatMap((t) => [t.term, ...(t.aliases ?? [])])
}
