import { CircleCheck, CircleDashed, CircleSlash, CircleX, Contrast } from 'lucide-react'
import { smallIcon } from './forms/controls.ts'
import type { Status as StatusName } from '../types.ts'

const labels: Record<StatusName, string> = {
  draft: 'Draft',
  proposed: 'Proposed',
  approved: 'Approved',
  deprecated: 'Deprecated',
  removed: 'Removed',
}

/**
 * A status as an icon and a word, so it never relies on colour alone: a dashed ring for draft, a half
 * ring for proposed, a ticked ring for approved, a struck ring for deprecated and a crossed ring for removed.
 */
const icons: Record<StatusName, typeof CircleDashed> = {
  draft: CircleDashed,
  proposed: Contrast,
  approved: CircleCheck,
  deprecated: CircleSlash,
  removed: CircleX,
}

export function Status({ status, compact = false }: { status: StatusName; compact?: boolean }) {
  const color = `var(--s-${status})`
  const Icon = icons[status]
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium whitespace-nowrap" style={{ color }} title={labels[status]}>
      <Icon {...smallIcon} />
      <span className={compact ? 'sr-only' : ''}>{labels[status]}</span>
    </span>
  )
}
