import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach } from 'vitest'

const made: string[] = []
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A small valid spec tree, as path → file text. */
export const baseTree: Record<string, string> = {
  'specai.yaml': `specai: "0.1"
areas: [loans]
components:
  - name: Library.API
`,
  'loans/area.yaml': `specai: "0.1"
prefix: LOAN
name: Loans
`,
  'loans/LOAN-001.yaml': `specai: "0.1"
id: LOAN-001
title: Loan limit
status: proposed
statement: While a [[member]] has five open loans, the service shall refuse a new loan.
components: [Library.API]
tests:
  - id: LOAN-001-T1
    title: Sixth loan is refused
    status: proposed
    level: unit
    when: The member borrows a sixth copy
    then:
      - The loan is refused
`,
  'loans/LOAN-002.yaml': `specai: "0.1"
id: LOAN-002
title: Overdue loans block borrowing
status: proposed
statement: If a [[members|member]] has an overdue loan, then the service shall refuse a new loan.
related: [LOAN-001]
`,
  'glossary/member.yaml': `specai: "0.1"
term: Member
aliases: [members]
definition: A person who may borrow.
avoid: [customer]
`,
}

/** Writes the base tree with changes (null deletes a file) to a temporary folder. */
export function writeTree(changes: Record<string, string | null> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'specai-'))
  made.push(root)
  for (const [path, text] of Object.entries({ ...baseTree, ...changes })) {
    if (text === null) continue
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

/** Applies a text replacement to a base tree file. */
export function edit(path: string, from: string, to: string): Record<string, string> {
  const text = baseTree[path]
  if (!text.includes(from)) throw new Error(`${path} does not contain ${from}`)
  return { [path]: text.replace(from, to) }
}
