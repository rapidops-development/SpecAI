import { ArrowUp, Plus, RotateCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { loadSchemas } from '../../api.ts'
import { type Field, formFields } from '../../lib/fields.ts'
import type { TestDefinition } from '../../types.ts'
import { Status } from '../Status.tsx'
import { buttonClass, quietClass, smallIcon } from './controls.ts'
import { FieldInput } from './FieldInput.tsx'

/** Test definitions as cards. New ones get their ID when the requirement is saved. */
export function TestsInput({ value, onChange }: { value: Partial<TestDefinition>[]; onChange: (v: Partial<TestDefinition>[]) => void }) {
  const { fields } = useFields('test')
  const set = (i: number, test: Partial<TestDefinition>) => onChange(value.map((old, j) => (j === i ? test : old)))
  return (
    <div className="space-y-8">
      {value.length === 0 && <p className="text-muted">No test definitions yet. Each one describes a single check of this requirement.</p>}
      {value.map((test, i) => (
        <div key={test.id ?? `new-${i}`} className="border-l-2 pl-5" style={{ borderColor: `var(--s-${test.status ?? 'draft'})` }}>
          <div className="flex flex-wrap items-center gap-3 pb-3">
            <span className="text-muted text-sm font-medium tabular-nums">{test.id ?? 'New test'}</span>
            {test.status && <Status status={test.status} />}
            <span className="ml-auto flex gap-3">
              <button type="button" className={quietClass} disabled={i === 0} onClick={() => onChange(move(value, i, i - 1))}><ArrowUp {...smallIcon} />Move up</button>
              <button type="button" className={quietClass} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 {...smallIcon} />Delete</button>
            </span>
          </div>
          <div className="space-y-4">
            {fields.map((field) => (
              <FieldInput key={field.key} compact field={field} value={test[field.key as keyof TestDefinition]} onChange={(v) => set(i, { ...test, [field.key]: v })} />
            ))}
          </div>
        </div>
      ))}
      <button type="button" className={buttonClass} onClick={() => onChange([...value, { title: '', status: 'draft', level: 'unit', when: '', then: [''] }])}>
        <Plus {...smallIcon} />Add test definition
      </button>
    </div>
  )
}

function move<T>(items: T[], from: number, to: number): T[] {
  const copy = [...items]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

export interface FormFields {
  /** Empty until the schema has loaded. */
  fields: Field[]
  /** Whether the schema is still loading, or why it failed. */
  pending?: { error?: string; retry: () => void }
}

/** The form fields for a kind of file, read from the schema. */
export function useFields(kind: Parameters<typeof formFields>[1]): FormFields {
  const [fields, setFields] = useState<Field[]>()
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setError(undefined)
    loadSchemas().then(
      (schemas) => live && setFields(formFields(schemas, kind)),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      live = false
    }
  }, [kind, attempt])
  if (fields) return { fields }
  return { fields: [], pending: { error, retry: () => setAttempt((n) => n + 1) } }
}

/** Stands in for a form's fields until the schema has loaded. */
// SpecAI: UI-022
export function FieldsPending({ pending }: { pending: NonNullable<FormFields['pending']> }) {
  if (!pending.error) return <p className="text-muted mt-8" role="status">Loading the form</p>
  return (
    <div className="border-rule bg-surface mt-8 rounded-md border px-4 py-3" role="alert">
      <p>Can’t load the form: the schema didn’t arrive ({pending.error}).</p>
      <button type="button" className={`${buttonClass} mt-3`} onClick={pending.retry}><RotateCw {...smallIcon} />Try again</button>
    </div>
  )
}
