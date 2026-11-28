import type { IndexedRequirement } from '../types.ts'

/** Deprecated and removed requirements: kept on file, but no longer wanted. */
export const retired = (r: IndexedRequirement) => r.status === 'deprecated' || r.status === 'removed'

/**
 * The requirements a list shows. Unless the user shows them, deprecated and removed ones are left
 * out, except those whose status the list's status filter names.
 */
// SpecAI: UI-032
export function visible(reqs: IndexedRequirement[], showRetired: boolean, statuses: string[] = []): IndexedRequirement[] {
  return showRetired ? reqs : reqs.filter((r) => !retired(r) || statuses.includes(r.status))
}
