export const inputClass =
  'border-rule bg-surface text-ink placeholder:text-muted w-full rounded-md border px-3 py-2 outline-none focus:border-[var(--focus)]'
export const buttonClass = 'inline-flex items-center gap-1.5 border-rule bg-surface text-ink hover:border-[var(--accent)] rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50'
export const primaryClass = 'inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--surface)] hover:opacity-90 disabled:opacity-50'
export const quietClass = 'inline-flex items-center gap-1 text-muted hover:text-ink text-sm underline underline-offset-2'

/** Line icons: the same size and stroke everywhere. */
export const icon = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const
export const smallIcon = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const
