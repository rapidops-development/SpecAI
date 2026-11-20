// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SpecProvider } from '../src/components/SpecContext.tsx'
import { TestCode } from '../src/pages/RequirementPage.tsx'
import type { SpecIndex } from '../src/types.ts'

// Built from parts, so this file does not itself name the IDs specai trace scans for.
const testId = ['LOAN', '001', 'T1'].join('-')
const link = (file: string, line: number) => ({ testId, file, line, framework: 'vitest' as const })
const index = (links: ReturnType<typeof link>[]) =>
  ({ requirements: [], terms: [], termIndex: {}, trace: { links: { [testId]: links } } }) as unknown as SpecIndex

const show = (links: ReturnType<typeof link>[]) => render(<SpecProvider index={index(links)}><TestCode testId={testId} /></SpecProvider>)

afterEach(cleanup)

describe('test code on a requirement page', () => {
  it('[UI-018-T1] flags a test definition named by two tests', () => {
    show([link('web/a.test.ts', 3), link('web/b.test.ts', 9)])
    expect(screen.getByText('web/a.test.ts:3')).toBeTruthy()
    expect(screen.getByText('web/b.test.ts:9')).toBeTruthy()
    expect(screen.getByText(/Named by 2 tests; each test definition needs exactly one/)).toBeTruthy()
  })

  it('shows one link without a flag', () => {
    show([link('web/a.test.ts', 3)])
    expect(screen.getByText('web/a.test.ts:3')).toBeTruthy()
    expect(screen.queryByText(/Named by/)).toBeNull()
  })
})
