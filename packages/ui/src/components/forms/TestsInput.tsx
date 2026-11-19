import { ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { loadSchemas } from '../../api.ts'
import { type Field, formFields } from '../../lib/fields.ts'
import type { TestDefinition } from '../../types.ts'
import { Status } from '../Status.tsx'
import { buttonClass, quietClass, smallIcon } from './controls.ts'
import { FieldInput } from './FieldInput.tsx'

/** Test definitions as cards. New ones get their ID when the requirement is saved. */
export function TestsInput({ value, onChange }: { value: Partial<TestDefinition>[]; onChange: (v: Partial<TestDefinition>[]) => void }) {
  const fields = useFields('test')
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

/** The form fields for a kind of file, read from the schema once. */
export function useFields(kind: Parameters<typeof formFields>[1]): Field[] {
  const [fields, setFields] = useState<Field[]>([])
  useEffect(() => {
    let live = true
    void loadSchemas().then((schemas) => live && setFields(formFields(schemas, kind)))
    return () => {
      live = false
    }
  }, [kind])
  return fields
}
