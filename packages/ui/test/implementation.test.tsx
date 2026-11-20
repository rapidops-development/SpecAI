// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SpecProvider } from '../src/components/SpecContext.tsx'
import { Implementation } from '../src/pages/RequirementPage.tsx'
import type { IndexedRequirement, SpecIndex } from '../src/types.ts'

const req = { id: 'LOAN-001', title: 'Loan limit' } as IndexedRequirement
const index = (implementations?: Record<string, { requirementId: string; file: string; line: number }[]>) =>
  ({ requirements: [], terms: [], termIndex: {}, trace: implementations && { implementations } }) as unknown as SpecIndex
const show = (i: SpecIndex) => render(<SpecProvider index={i}><Implementation req={req} /></SpecProvider>)

afterEach(cleanup)

describe('implementing code on a requirement page', () => {
  it('[UI-019-T2] lists where code implements a requirement, or says none does', () => {
    show(index({ 'LOAN-001': [{ requirementId: 'LOAN-001', file: 'Library.API/src/Loans.cs', line: 3 }] }))
    expect(screen.getByText('Library.API/src/Loans.cs:3')).toBeTruthy()
    cleanup()
    show(index({ 'LOAN-001': [] }))
    expect(screen.getByText(/No code names LOAN-001 yet/)).toBeTruthy()
  })

  it('shows nothing when the server did not scan code', () => {
    const { container } = show(index())
    expect(container.innerHTML).toBe('')
  })
})
