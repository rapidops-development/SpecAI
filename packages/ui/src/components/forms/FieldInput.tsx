import { Select } from './Select.tsx'
import { Plus, X } from 'lucide-react'
import { useId, useState } from 'react'
import type { Field } from '../../lib/fields.ts'
import { Markdown } from '../Markdown.tsx'
import { Text } from '../Text.tsx'
import { useSpec } from '../SpecContext.tsx'
import { inputClass, quietClass, smallIcon } from './controls.ts'
import { TestsInput } from './TestsInput.tsx'

/** One form field, chosen by the kind the schema gives it, with its label in the margin. */
export function FieldInput({ field, value, onChange, compact = false }: { field: Field; value: unknown; onChange: (value: unknown) => void; compact?: boolean }) {
  const id = useId()
  const [opened, setOpened] = useState(false)
  const helpId = field.description ? `${id}-help` : undefined
  const help = field.description && (
    <span id={helpId} className="text-muted mt-1.5 block text-xs">
      {field.description}
    </span>
  )
  const grid = compact ? 'sm:grid-cols-[4.5rem_minmax(0,1fr)]' : 'md:grid-cols-[9rem_minmax(0,1fr)]'
  const labelText = <span className="font-medium">{field.label}</span>

  if (field.kind === 'tests') {
    return <TestsInput value={(value as never[]) ?? []} onChange={onChange} />
  }
  // In a test definition, an empty optional Markdown field stays a link until asked for.
  if (compact && field.kind === 'markdown' && !field.required && !value && !opened) {
    return (
      <div className={`grid gap-x-6 ${grid}`}>
        <span />
        <button type="button" className={`${quietClass} justify-self-start`} onClick={() => setOpened(true)}><Plus {...smallIcon} />Add {field.label.toLowerCase()}</button>
      </div>
    )
  }
  const group = ['textList', 'requirementIds', 'names', 'tags', 'components'].includes(field.kind)
  return (
    <div className={`grid gap-x-6 gap-y-1.5 ${grid}`} role={group ? 'group' : undefined} aria-labelledby={group ? `${id}-label` : undefined}>
      <div className="pt-0.5 sm:pt-2">
        {group ? <span id={`${id}-label`}>{labelText}</span> : <label htmlFor={id}>{labelText}</label>}
      </div>
      <div className="min-w-0">
        {field.kind === 'components' ? (
          <ComponentsInput value={(value as string[]) ?? []} onChange={onChange} />
        ) : group ? (
          <ListInput kind={field.kind} value={(value as string[]) ?? []} onChange={onChange} itemLabel={field.label} />
        ) : field.kind === 'markdown' ? (
          <MarkdownInput id={id} value={(value as string) ?? ''} onChange={onChange} describedBy={helpId} />
        ) : field.kind === 'enum' ? (
          <Select id={id} className={inputClass} wrapperClassName="w-full max-w-56" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} aria-describedby={helpId}>
            {field.options?.map((o) => <option key={o} value={o}>{o === 'e2e' ? 'End to end' : o[0].toUpperCase() + o.slice(1)}</option>)}
          </Select>
        ) : field.kind === 'longText' ? (
          <>
            <textarea
              id={id}
              className={`${inputClass} field-sizing-content min-h-[4.5rem] font-serif text-[1.05rem] leading-snug`}
              value={(value as string) ?? ''}
              onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
              aria-describedby={helpId}
              required={field.required}
            />
            {field.key === 'statement' && <StatementPreview text={(value as string) ?? ''} />}
          </>
        ) : field.kind === 'requirementId' ? (
          <RequirementIdInput id={id} value={(value as string) ?? ''} onChange={onChange} describedBy={helpId} />
        ) : (
          <input id={id} className={inputClass} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} aria-describedby={helpId} required={field.required} />
        )}
        {help}
      </div>
    </div>
  )
}

/** The statement as it will read, with EARS keywords marked, and a nudge when "shall" is missing. */
function StatementPreview({ text }: { text: string }) {
  if (!text.trim()) return null
  return (
    <div className="border-rule mt-2 border-l-2 pl-3" aria-live="polite">
      <p className="font-serif text-[1.05rem] leading-snug">
        <Text text={text} ears links={false} />
      </p>
      {!/\bshall\b/.test(text) && <p className="text-warn mt-1 text-xs">Add “shall” to say what the system does.</p>}
    </div>
  )
}

function MarkdownInput({ id, value, onChange, describedBy }: { id: string; value: string; onChange: (v: string) => void; describedBy?: string }) {
  const [preview, setPreview] = useState(false)
  return (
    <span className="block">
      <span className="mb-1 flex gap-3 text-xs" role="group" aria-label="Markdown view">
        <button type="button" className={preview ? quietClass : 'text-ink font-medium'} aria-pressed={!preview} onClick={() => setPreview(false)}>Write</button>
        <button type="button" className={preview ? 'text-ink font-medium' : quietClass} aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button>
      </span>
      {preview ? (
        <span className="border-rule bg-surface block min-h-[5rem] rounded-md border px-3 py-2">
          {value.trim() ? <Markdown source={value} /> : <span className="text-muted">Nothing to preview.</span>}
        </span>
      ) : (
        <textarea id={id} className={`${inputClass} field-sizing-content min-h-[6rem] text-[0.9375rem] leading-relaxed`} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} />
      )}
    </span>
  )
}

function ListInput({ kind, value, onChange, itemLabel }: { kind: Field['kind']; value: string[]; onChange: (v: string[]) => void; itemLabel: string }) {
  const { index } = useSpec()
  const listId = useId()
  const items = value
  const set = (i: number, v: string) => onChange(items.map((old, j) => (j === i ? v : old)))
  const inline = kind !== 'textList'
  return (
    <span className="block">
      {kind === 'requirementIds' && (
        <datalist id={listId}>{index.requirements.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</datalist>
      )}
      <ul className={inline ? 'flex flex-wrap gap-2' : 'space-y-2'}>
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <input
              className={`${inputClass} ${inline ? 'w-44' : ''}`}
              value={item}
              list={kind === 'requirementIds' ? listId : undefined}
              aria-label={`${itemLabel} ${i + 1}`}
              onChange={(e) => set(i, kind === 'tags' ? e.target.value.toLowerCase().replace(/\s+/g, '-') : e.target.value)}
            />
            <button type="button" className="text-muted hover:text-danger rounded p-1" aria-label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <X {...smallIcon} />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className={`${quietClass} ${items.length > 0 ? 'mt-2' : 'pt-2'}`} onClick={() => onChange([...items, ''])}>
        <Plus {...smallIcon} />Add {kind === 'textList' ? 'a line' : 'one'}
      </button>
    </span>
  )
}

function RequirementIdInput({ id, value, onChange, describedBy }: { id: string; value: string; onChange: (v: string) => void; describedBy?: string }) {
  const { index } = useSpec()
  const listId = useId()
  return (
    <>
      <datalist id={listId}>{index.requirements.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</datalist>
      <input id={id} className={`${inputClass} max-w-56`} value={value} list={listId} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-describedby={describedBy} />
    </>
  )
}

function ComponentsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { index } = useSpec()
  const components = index.config?.components ?? []
  if (components.length === 0) return <p className="text-muted pt-2 text-sm">No components are listed in specai.yaml.</p>
  return (
    <span className="flex flex-wrap gap-x-5 gap-y-2 pt-2">
      {components.map((c) => (
        <label key={c.name} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-[var(--focus)]"
            checked={value.includes(c.name)}
            onChange={(e) => onChange(e.target.checked ? [...value, c.name] : value.filter((v) => v !== c.name))}
          />
          {c.name}
        </label>
      ))}
    </span>
  )
}
