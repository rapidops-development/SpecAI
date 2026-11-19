import type { SaveFailure } from '../api.ts'
import { ProblemList } from './Problems.tsx'

/** What went wrong with a save, and how to put it right. */
export function SaveError({ failure, onReload }: { failure: SaveFailure; onReload?: () => void }) {
  return (
    <div role="alert" className="border-danger bg-surface mt-4 rounded-md border px-4 py-3 text-sm">
      <p className="text-danger font-semibold">
        {failure.status === 409 ? 'Not saved: the file changed on disk' : failure.status === 422 ? 'Not saved: the file would not be valid' : 'Not saved'}
      </p>
      <p className="mt-1">
        {failure.status === 409
          ? 'Someone or something edited this file after you opened it. Reload to see their version; your changes here will be lost, so copy anything you need first.'
          : failure.error}
      </p>
      {failure.status === 409 && onReload && (
        <button type="button" className="text-accent mt-2 underline underline-offset-2" onClick={onReload}>Reload the file</button>
      )}
      {failure.status === 422 && failure.diagnostics.length > 0 && (
        <div className="mt-3"><ProblemList diagnostics={failure.diagnostics} showFile={false} /></div>
      )}
    </div>
  )
}

let listeners: ((messages: string[]) => void)[] = []

/** Shows a short message after a save, such as an approved item going back to proposed. */
export function announce(messages: string[]) {
  for (const listener of listeners) listener(messages)
}

export function subscribeAnnouncements(listener: (messages: string[]) => void) {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}
