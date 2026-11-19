import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/lib/markdown.ts'
import { resolveLink, splitText } from '../src/lib/text.ts'

describe('plain text', () => {
  it('splits links, inline code and text', () => {
    expect(splitText('A [[member|Member]] uses `[[x]]` and [[LOAN-001]].')).toEqual([
      { kind: 'text', text: 'A ' },
      { kind: 'link', target: 'member', text: 'Member' },
      { kind: 'text', text: ' uses ' },
      { kind: 'code', text: '[[x]]' },
      { kind: 'text', text: ' and ' },
      { kind: 'link', target: 'LOAN-001', text: 'LOAN-001' },
      { kind: 'text', text: '.' },
    ])
  })

  it('marks EARS keywords when asked', () => {
    const marked = splitText('While open, when a member borrows, the service shall refuse; if late, then it shall warn.', { ears: true })
    expect(marked.filter((p) => p.kind === 'ears').map((p) => p.text)).toEqual(['While', 'when', 'shall', 'then', 'shall'])
  })

  it('[UI-004-T1] resolves links to terms by any name and to existing requirements only', () => {
    const terms = { member: 'member', members: 'member' }
    const ids = new Set(['LOAN-001'])
    expect(resolveLink('Members', terms, ids)).toBe('/g/member')
    expect(resolveLink('LOAN-001', terms, ids)).toBe('/r/LOAN-001')
    expect(resolveLink('LOAN-002', terms, ids)).toBeUndefined()
    expect(resolveLink('borrower', terms, ids)).toBeUndefined()
  })
})

describe('markdown', () => {
  const resolve = (t: string) => (t === 'member' ? '/g/member' : undefined)

  it('renders links, marking broken ones', () => {
    const html = renderMarkdown('A **[[member]]** and [[ghost]].', resolve)
    expect(html).toContain('<strong><a class="wikilink" href="/g/member">member</a></strong>')
    expect(html).toContain('<span class="wikilink-broken"')
  })

  it('shows raw HTML as text and drops script links', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> [x](javascript:alert(1))', resolve)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('javascript:')
  })

  it('leaves link syntax in code alone', () => {
    expect(renderMarkdown('`[[member]]`', resolve)).toContain('<code>[[member]]</code>')
  })
})
