import type { Status } from '../types.ts'

export interface Transition {
  to: Status
  /** The button's label. */
  label: string
  /** What the button did, for the message after saving. */
  done: string
  primary?: boolean
}

/** The status changes a person can make from each status. */
export function transitions(status: Status): Transition[] {
  switch (status) {
    case 'draft':
      return [{ to: 'proposed', label: 'Propose', done: 'proposed', primary: true }]
    case 'proposed':
      return [
        { to: 'approved', label: 'Approve', done: 'approved', primary: true },
        { to: 'draft', label: 'Back to draft', done: 'moved back to draft' },
      ]
    case 'approved':
      return [{ to: 'deprecated', label: 'Deprecate', done: 'deprecated' }]
    case 'deprecated':
      return [
        { to: 'proposed', label: 'Restore', done: 'restored as proposed' },
        { to: 'removed', label: 'Remove', done: 'removed' },
      ]
    case 'removed':
      return [{ to: 'proposed', label: 'Restore', done: 'restored as proposed' }]
  }
}
