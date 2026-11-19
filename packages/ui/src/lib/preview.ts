import { parseRoute } from '../router.tsx'
import type { IndexedRequirement, IndexedTerm, SpecIndex } from '../types.ts'

export type PreviewTarget = { kind: 'requirement'; req: IndexedRequirement } | { kind: 'term'; term: IndexedTerm }

/**
 * What a link to `pathname` previews: a requirement or a glossary term that exists, and is not the
 * page at `current`. Anything else, such as an area, an edit form or a missing page, has no preview.
 */
export function previewTarget(index: SpecIndex, pathname: string, current: string): PreviewTarget | undefined {
  if (pathname === current) return undefined
  const route = parseRoute(pathname)
  if (route.page === 'requirement') {
    const req = index.requirements.find((r) => r.id === route.id)
    return req && { kind: 'requirement', req }
  }
  if (route.page === 'term') {
    const term = index.terms.find((t) => t.slug === route.slug)
    return term && { kind: 'term', term }
  }
  return undefined
}
