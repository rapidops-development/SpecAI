// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_DELAY, LinkPreview, OPEN_DELAY } from '../src/components/LinkPreview.tsx'
import { SpecProvider } from '../src/components/SpecContext.tsx'
import { Text } from '../src/components/Text.tsx'
import type { IndexedRequirement, IndexedTerm, SpecIndex } from '../src/types.ts'

// Built by hand: the CLI's index builder reads the schema from disk, which jsdom cannot.
const requirement = (r: Partial<IndexedRequirement>) => ({ status: 'proposed', area: 'loans', file: `loans/${r.id}.yaml`, hash: '', ...r }) as IndexedRequirement
const index = () =>
  ({
    requirements: [
      requirement({ id: 'LOAN-001', title: 'Loan limit', statement: 'While a [[member]] has five open loans, the service shall refuse a new loan.' }),
      requirement({
        id: 'LOAN-003',
        title: 'Loan period',
        statement: "The service shall set each loan's due date fourteen days after it is created.",
        acceptance: ['The due date counts calendar days.'],
        tests: [{ id: 'LOAN-003-T1', title: 'Due in fourteen days', status: 'proposed', level: 'unit', when: 'A loan is created', then: ['Its due date is fourteen days later'] }],
      }),
    ],
    terms: [{ term: 'Member', aliases: ['members'], definition: 'A person who may borrow.', slug: 'member', file: 'glossary/member.yaml', hash: '' } as IndexedTerm],
    termIndex: { member: 'member', members: 'member' },
  }) as unknown as SpecIndex

function page() {
  return render(
    <SpecProvider index={index()}>
      <p><Text text="See [[LOAN-003]], [[members|a member]], [[ghost]] and [[LOAN-001]]." /></p>
      <nav data-no-preview><a href="/r/LOAN-003">Side link</a></nav>
      <ul><li data-no-preview><a href="/r/LOAN-003">Row link</a></li></ul>
      <LinkPreview />
    </SpecProvider>,
  )
}

const link = (name: string) => screen.getByRole('link', { name })
const preview = () => screen.queryByRole('complementary')
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
  history.replaceState(null, '', '/r/LOAN-001')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('link previews', () => {
  it('[UI-015-T1] shows a requirement link\'s preview', () => {
    page()
    fireEvent.mouseOver(link('LOAN-003'))
    wait(OPEN_DELAY)
    const panel = preview()!
    expect(panel).toHaveProperty('ariaLabel', 'Preview of LOAN-003')
    expect(panel.textContent).toContain('LOAN-003')
    expect(panel.textContent).toContain('Proposed')
    expect(panel.textContent).toContain('Loan period')
    expect(panel.textContent).toContain('fourteen days after it is created')
    expect(panel.textContent).toContain('The due date counts calendar days.')
    expect(panel.textContent).toContain('Due in fourteen days')
  })

  it('[UI-015-T2] shows a glossary term link\'s preview, linked by an alias', () => {
    page()
    fireEvent.mouseOver(link('a member'))
    wait(OPEN_DELAY)
    const panel = preview()!
    expect(panel).toHaveProperty('ariaLabel', 'Preview of Member')
    expect(panel.textContent).toContain('Also: members')
    expect(panel.textContent).toContain('A person who may borrow.')
  })

  it('[UI-015-T3] waits before opening, stays open over the preview, and closes after leaving both', () => {
    page()
    const anchor = link('LOAN-003')
    fireEvent.mouseOver(anchor)
    wait(OPEN_DELAY - 1)
    expect(preview()).toBeNull()
    wait(1)
    const panel = preview()!
    fireEvent.mouseOut(anchor, { relatedTarget: panel })
    fireEvent.mouseOver(panel)
    wait(CLOSE_DELAY * 2)
    expect(preview()).not.toBeNull()
    fireEvent.mouseOut(panel, { relatedTarget: document.body })
    wait(CLOSE_DELAY)
    expect(preview()).toBeNull()
  })

  it('[UI-015-T4] opens on keyboard focus and closes on Escape', () => {
    page()
    act(() => link('a member').focus())
    expect(preview()).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(preview()).toBeNull()
  })

  it('[UI-015-T5] shows no preview for broken links, the current page, the side navigation or list rows', () => {
    page()
    expect(screen.queryByRole('link', { name: 'ghost' })).toBeNull()
    for (const target of [screen.getByText('ghost'), link('LOAN-001'), link('Side link'), link('Row link')]) {
      fireEvent.mouseOver(target)
      wait(OPEN_DELAY)
      expect(preview()).toBeNull()
      fireEvent.mouseOut(target, { relatedTarget: document.body })
    }
  })
})
