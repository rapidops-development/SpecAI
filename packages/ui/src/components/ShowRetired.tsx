import { useSyncExternalStore } from 'react'
import { retired } from '../lib/visibility.ts'
import { useSpec } from './SpecContext.tsx'

const key = 'specai-show-retired'
const listeners = new Set<() => void>()
let memory = false

function read(): boolean {
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    return memory
  }
}

export function setShowRetired(show: boolean) {
  memory = show
  try {
    if (show) localStorage.setItem(key, 'true')
    else localStorage.removeItem(key)
  } catch {
    // Storage can be unavailable, such as in a private window; the choice then lasts until reload.
  }
  for (const listener of listeners) listener()
}

/** Whether the user shows deprecated and removed requirements. Off unless chosen; remembered in this browser. */
export function useShowRetired(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    read,
    () => false,
  )
}

/** The switch in the navigation that shows or hides deprecated and removed requirements. */
// SpecAI: UI-032
export function ShowRetiredSwitch() {
  const { index } = useSpec()
  const show = useShowRetired()
  const hidden = index.requirements.filter(retired).length
  return (
    <label className="text-muted hover:text-ink flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs md:self-stretch has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]">
      <input type="checkbox" role="switch" className="accent-[var(--focus)]" checked={show} onChange={(e) => setShowRetired(e.target.checked)} />
      <span className="leading-tight">Show deprecated and removed</span>
      <span className="ml-auto pl-2 tabular-nums">{hidden}</span>
    </label>
  )
}
