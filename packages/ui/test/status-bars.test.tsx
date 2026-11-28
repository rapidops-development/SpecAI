// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SpecProvider } from '../src/components/SpecContext.tsx'
import { StatusBars } from '../src/components/StatusBars.tsx'
import type { IndexedRequirement, SpecIndex, Status } from '../src/types.ts'

// Built by hand: the CLI's index builder reads the schema from disk, which jsdom cannot.
const test = (id: string, status: Status) => ({ id, title: id, status, level: 'unit', when: 'It runs', then: ['It works'] })
const req = (id: string, status: Status, tests: ReturnType<typeof test>[] = []) =>
  ({ id, status, title: id, statement: 'The service shall do it.', area: 'loans', file: '', hash: '', tests }) as unknown as IndexedRequirement
const index = {
  requirements: [
    req('LOAN-001', 'proposed', [test('LOAN-001-T1', 'proposed'), test('LOAN-001-T2', 'approved')]),
    req('LOAN-002', 'proposed', [test('LOAN-002-T1', 'proposed')]),
    req('LOAN-003', 'proposed', [test('LOAN-003-T1', 'proposed'), test('LOAN-003-T2', 'proposed')]),
    req('LOAN-004', 'deprecated'),
  ],
  terms: [],
  termIndex: {},
} as unknown as SpecIndex

const show = () => render(<SpecProvider index={index}><StatusBars /></SpecProvider>)
const legend = (title: string) => within(screen.getByRole('list', { name: `${title} by status` })).getAllByRole('listitem').map((li) => li.textContent)

afterEach(cleanup)

describe('status bars', () => {
  it('[UI-034-T1] splits requirements and test definitions by status', () => {
    show()
    expect(legend('Requirements')).toEqual(['Proposed3', 'Deprecated1'])
    expect(legend('Test definitions')).toEqual(['Proposed4', 'Approved1'])
    const bar = screen.getByRole('img', { name: 'Requirements by status: 3 proposed, 1 deprecated' })
    const grow = [...bar.children].map((part) => (part as HTMLElement).style.flexGrow)
    expect(grow).toEqual(['3', '1'])
    expect((bar.children[0] as HTMLElement).title).toBe('Proposed: 3 of 4 (75%)')
    expect(screen.getByLabelText('5 test definitions').textContent).toBe('5')
  })

  it('[UI-034-T2] opens the list of requirements with a chosen status', () => {
    history.replaceState(null, '', '/glossary')
    show()
    fireEvent.click(within(screen.getByRole('list', { name: 'Requirements by status' })).getByRole('link', { name: /Deprecated/ }))
    expect(location.pathname + location.search).toBe('/?status=deprecated')
  })
})
