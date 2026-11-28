import { Archive, Check, CheckCheck, RotateCcw, Send, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { isSaveFailure, save } from '../api.ts'
import { type Transition, transitions } from '../lib/statuses.ts'
import type { IndexedRequirement } from '../types.ts'
import { buttonClass, primaryClass, smallIcon } from './forms/controls.ts'

const icons = { proposed: Send, approved: Check, draft: Undo2, deprecated: Archive, removed: Trash2 }
import { announce } from './SaveFeedback.tsx'

/** Buttons that change a requirement's or one of its test definitions' status, saving at once. */
export function StatusButtons({ req, testId, small = false }: { req: IndexedRequirement; testId?: string; small?: boolean }) {
  const [busy, setBusy] = useState(false)
  const current = testId ? req.tests!.find((t) => t.id === testId)!.status : req.status
  const change = async ({ to, done }: Transition) => {
    setBusy(true)
    const { area: _area, file: _file, hash, ...data } = req
    const next = testId ? { ...data, tests: data.tests!.map((t) => (t.id === testId ? { ...t, status: to } : t)) } : { ...data, status: to }
    try {
      const result = await save('PUT', `/api/requirements/${encodeURIComponent(req.id)}`, { data: next, hash })
      announce([`${testId ?? req.id} ${done}`, ...result.notices])
    } catch (error) {
      announce([isSaveFailure(error) ? `${testId ?? req.id} not changed: ${error.error}` : String(error)])
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="flex flex-wrap gap-2">
      {transitions(current).map((t) => (
        <button key={t.to} type="button" disabled={busy} className={`${t.primary ? primaryClass : buttonClass} ${small ? '!px-2.5 !py-1 !text-xs' : ''}`} onClick={() => void change(t)}>
          {(() => { const Icon = t.label === 'Restore' ? RotateCcw : icons[t.to]; return <Icon {...smallIcon} /> })()}
          {t.label}
        </button>
      ))}
    </span>
  )
}

/**
 * Approves every proposed test definition of a requirement in one save, for a reviewer who has read
 * them all. Shown while two or more are proposed; one has its own Approve button.
 */
// SpecAI: UI-031
export function ApproveAllTests({ req }: { req: IndexedRequirement }) {
  const [busy, setBusy] = useState(false)
  const proposed = (req.tests ?? []).filter((t) => t.status === 'proposed')
  if (proposed.length < 2) return null
  const approveAll = async () => {
    setBusy(true)
    const { area: _area, file: _file, hash, ...data } = req
    const next = { ...data, tests: data.tests!.map((t) => (t.status === 'proposed' ? { ...t, status: 'approved' as const } : t)) }
    try {
      const result = await save('PUT', `/api/requirements/${encodeURIComponent(req.id)}`, { data: next, hash })
      announce([`${proposed.length} test definitions of ${req.id} approved`, ...result.notices])
    } catch (error) {
      announce([isSaveFailure(error) ? `${req.id}'s test definitions not approved: ${error.error}` : String(error)])
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" disabled={busy} className={primaryClass} onClick={() => void approveAll()}>
      <CheckCheck {...smallIcon} />
      Approve all {proposed.length} proposed tests
    </button>
  )
}
