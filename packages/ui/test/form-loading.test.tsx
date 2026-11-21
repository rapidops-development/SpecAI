// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpecIndex } from '../src/types.ts'

const index = { requirements: [], terms: [], termIndex: {}, areas: [], backlinks: {}, children: {}, diagnostics: [] } as unknown as SpecIndex
// Just enough schema for a one-field form; jsdom cannot read the real schema files from disk.
const schema = { 'urn:specai:v0.2:glossary-term': { required: ['term'], properties: { term: { $ref: 'urn:specai:v0.2:common#/$defs/text' } } } }
const schemaResponse = () => new Response(JSON.stringify(schema), { status: 200 })

// The schema is cached per module, so each test loads the editor afresh.
async function showEditor() {
  vi.resetModules()
  const { SpecProvider } = await import('../src/components/SpecContext.tsx')
  const { TermEditor } = await import('../src/pages/TermEditor.tsx')
  render(<SpecProvider index={index}><TermEditor /></SpecProvider>)
}

beforeEach(() => history.replaceState(null, '', '/glossary/new'))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('edit forms before the schema arrives', () => {
  it('[UI-022-T1] says the form is loading, then shows the fields', async () => {
    let answer!: (r: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))))
    await showEditor()
    expect(screen.getByRole('status').textContent).toBe('Loading the form')
    expect((screen.getByRole('button', { name: 'Add term' }) as HTMLButtonElement).disabled).toBe(true)
    answer(schemaResponse())
    expect(await screen.findByLabelText('Term')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('[UI-022-T2] says the schema did not load, and loads it again on Try again', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 500 })).mockResolvedValueOnce(schemaResponse())
    vi.stubGlobal('fetch', fetch)
    await showEditor()
    expect((await screen.findByRole('alert')).textContent).toContain('The server answered 500')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('Term')).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
