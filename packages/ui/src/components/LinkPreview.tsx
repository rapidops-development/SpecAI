import { useEffect, useRef, useState } from 'react'
import { type PreviewTarget, previewTarget } from '../lib/preview.ts'
import { useLocation } from '../router.tsx'
import { Markdown } from './Markdown.tsx'
import { useSpec } from './SpecContext.tsx'
import { Status } from './Status.tsx'
import { Text } from './Text.tsx'

/** How long the pointer rests on a link before its preview opens, and lingers after leaving. */
export const OPEN_DELAY = 400
export const CLOSE_DELAY = 200

const width = 384
const maxHeight = 320
const gap = 6

interface Open {
  target: PreviewTarget
  anchor: HTMLAnchorElement
  top: number
  left: number
}

/**
 * Previews of the requirement or glossary term a link points to, shown when the pointer rests on the
 * link or the link has keyboard focus. Links inside `[data-no-preview]` are skipped. Mount once.
 */
export function LinkPreview() {
  const { index } = useSpec()
  const { pathname } = useLocation()
  const [open, setOpen] = useState<Open>()
  const panel = useRef<HTMLElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const state = useRef({ index, open })
  state.current = { index, open }

  useEffect(() => setOpen(undefined), [pathname])

  useEffect(() => {
    const later = (fn: () => void, ms: number) => {
      clearTimeout(timer.current)
      timer.current = setTimeout(fn, ms)
    }
    const inPanel = (node: EventTarget | null) => node instanceof Node && !!panel.current?.contains(node)
    const linkFrom = (node: EventTarget | null): { anchor: HTMLAnchorElement; target: PreviewTarget } | undefined => {
      if (!(node instanceof Element) || inPanel(node)) return undefined
      const anchor = node.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement) || anchor.origin !== location.origin || anchor.closest('[data-no-preview]')) return undefined
      const target = previewTarget(state.current.index, anchor.pathname, location.pathname)
      return target && { anchor, target }
    }
    const show = ({ anchor, target }: { anchor: HTMLAnchorElement; target: PreviewTarget }) => {
      const rect = anchor.getBoundingClientRect()
      const below = window.innerHeight - rect.bottom >= maxHeight + gap || rect.top < maxHeight + gap
      const top = below ? rect.bottom + gap : rect.top - gap - maxHeight
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      setOpen({ target, anchor, top, left })
    }
    const close = () => {
      clearTimeout(timer.current)
      setOpen(undefined)
    }

    const onOver = (e: MouseEvent) => {
      if (inPanel(e.target)) return clearTimeout(timer.current)
      const link = linkFrom(e.target)
      if (!link) return
      if (state.current.open?.anchor === link.anchor) return clearTimeout(timer.current)
      later(() => show(link), OPEN_DELAY)
    }
    const onOut = (e: MouseEvent) => {
      const to = e.relatedTarget
      const { open } = state.current
      if (inPanel(to) || (to instanceof Node && open?.anchor.contains(to))) return
      if (open) later(close, CLOSE_DELAY)
      else if (linkFrom(e.target)) clearTimeout(timer.current)
    }
    const onFocusIn = (e: FocusEvent) => {
      if (inPanel(e.target)) return clearTimeout(timer.current)
      const link = linkFrom(e.target)
      if (link) {
        clearTimeout(timer.current)
        show(link)
      }
    }
    const onFocusOut = (e: FocusEvent) => {
      if (state.current.open && !inPanel(e.relatedTarget)) later(close, CLOSE_DELAY)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.current.open) close()
    }

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer.current)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!open) return null
  const { target } = open
  const label = target.kind === 'requirement' ? `Preview of ${target.req.id}` : `Preview of ${target.term.term}`
  return (
    <aside
      ref={panel}
      aria-label={label}
      className="border-rule bg-surface text-ink fixed z-30 overflow-y-auto overscroll-contain rounded-md border p-4 text-sm shadow-lg"
      style={{ top: open.top, left: open.left, width, maxHeight }}
    >
      {target.kind === 'requirement' ? <RequirementPreview target={target} /> : <TermPreview target={target} />}
    </aside>
  )
}

function RequirementPreview({ target: { req } }: { target: Extract<PreviewTarget, { kind: 'requirement' }> }) {
  return (
    <>
      <p className="text-muted flex items-center gap-3">
        <span className="text-ink font-semibold tabular-nums">{req.id}</span>
        <Status status={req.status} />
      </p>
      <h2 className="mt-1 text-base leading-snug font-semibold">{req.title}</h2>
      <p className="mt-2 leading-relaxed"><Text text={req.statement} ears /></p>
      {req.acceptance && req.acceptance.length > 0 && (
        <>
          <h3 className="text-muted mt-3 text-xs font-semibold">Acceptance criteria</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{req.acceptance.map((a, i) => <li key={i}><Text text={a} /></li>)}</ul>
        </>
      )}
      {req.tests && req.tests.length > 0 && (
        <>
          <h3 className="text-muted mt-3 text-xs font-semibold">Tests</h3>
          <ul className="mt-1 space-y-1">
            {req.tests.map((t) => (
              <li key={t.id} className="flex items-baseline gap-2">
                <span className="text-muted shrink-0 text-xs tabular-nums">{t.id}</span>
                <span className="min-w-0 flex-1">{t.title}</span>
                <Status status={t.status} compact />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function TermPreview({ target: { term } }: { target: Extract<PreviewTarget, { kind: 'term' }> }) {
  return (
    <>
      <h2 className="text-base font-semibold">{term.term}</h2>
      {term.aliases && term.aliases.length > 0 && <p className="text-muted mt-0.5 text-xs">Also: {term.aliases.join(', ')}</p>}
      <Markdown source={term.definition} className="mt-2 text-sm" />
    </>
  )
}
