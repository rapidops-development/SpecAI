import { FileCode } from 'lucide-react'
import { Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isSaveFailure, type SaveFailure, save } from '../api.ts'
import { buttonClass, primaryClass, quietClass, smallIcon } from '../components/forms/controls.ts'
import { FieldInput } from '../components/forms/FieldInput.tsx'
import { useFields } from '../components/forms/TestsInput.tsx'
import { announce, SaveError } from '../components/SaveFeedback.tsx'
import { useSpec } from '../components/SpecContext.tsx'
import { assignTestIds, cleanData } from '../lib/fields.ts'
import { Link, navigate, paths } from '../router.tsx'
import type { IndexedRequirement, Requirement } from '../types.ts'
import { RawFileEditor } from './RawFileEditor.tsx'
import { Missing } from './RequirementPage.tsx'

type Draft = Partial<Requirement>

// Fields grouped by what a reviewer is checking. Fields the schema adds later land in "Where it applies".
const sections = ['What it says', 'Why', 'Where it applies', 'Tests']
const sectionOf: Record<string, string> = {
  title: 'What it says',
  statement: 'What it says',
  rationale: 'Why',
  acceptance: 'Why',
  notes: 'Why',
  tests: 'Tests',
}

/** Edits an existing requirement, or creates one in an area when `area` is given. */
export function RequirementEditor({ id, area }: { id?: string; area?: string }) {
  const { index } = useSpec()
  const existing = id ? index.requirements.find((r) => r.id === id) : undefined
  const [raw, setRaw] = useState(false)
  if (id && !existing) return <Missing what={`requirement ${id}`} />
  const folder = existing?.area ?? area!
  const areaInfo = index.areas.find((a) => a.folder === folder)
  if (!areaInfo) return <Missing what={`area ${folder}`} />
  if (existing && raw) return <RawFileEditor path={existing.file} onDone={() => setRaw(false)} doneLabel="Back to the form" />
  return <RequirementForm key={existing?.hash ?? 'new'} existing={existing} folder={folder} areaName={areaInfo.name} onRaw={() => setRaw(true)} />
}

function RequirementForm(props: { existing?: IndexedRequirement; folder: string; areaName: string; onRaw: () => void }) {
  const { existing, folder, areaName, onRaw } = props
  const fields = useFields('requirement')
  const [draft, setDraft] = useState<Draft>(() => {
    if (!existing) return { title: '', status: 'draft', statement: '' }
    const { area: _a, file: _f, hash: _h, ...data } = existing
    return data
  })
  const [failure, setFailure] = useState<SaveFailure>()
  const [saving, setSaving] = useState(false)
  const back = existing ? paths.requirement(existing.id) : paths.area(folder)
  useEffect(() => {
    if (fields.length > 0 && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
  }, [fields.length])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFailure(undefined)
    try {
      if (existing) {
        const data = cleanData({ ...draft, tests: assignTestIds(existing.id, draft.tests ?? []) })
        const result = await save('PUT', `/api/requirements/${encodeURIComponent(existing.id)}`, { data, hash: existing.hash })
        announce([`${existing.id} saved`, ...result.notices])
        navigate(paths.requirement(existing.id))
      } else {
        const { id: _id, specai: _v, ...data } = cleanData(draft)
        const result = await save('POST', '/api/requirements', { area: folder, data })
        announce([`${result.id} created as a draft`])
        navigate(paths.requirement(result.id!))
      }
    } catch (error) {
      setFailure(isSaveFailure(error) ? error : { status: 0, error: String(error), diagnostics: [] })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <p className="text-muted text-sm">
        <Link href={back} className="hover:underline">{existing ? `${existing.id} ${existing.title}` : areaName}</Link>
      </p>
      <h1 className="mt-1 font-serif text-3xl font-semibold">{existing ? `Edit ${existing.id}` : `New requirement in ${areaName}`}</h1>
      {existing?.status === 'approved' && (
        <p className="border-rule bg-surface mt-4 rounded-md border px-4 py-3 text-sm">
          This requirement is approved. Saving a change to its text sets it back to proposed, so it gets reviewed again.
        </p>
      )}
      {!existing && <p className="text-muted mt-2">It gets the next free ID in {areaName} and starts as a draft.</p>}

      {sections.map((section) => {
        const inSection = fields.filter((f) => (sectionOf[f.key] ?? 'Where it applies') === section)
        if (inSection.length === 0) return null
        return (
          <section key={section} id={section === 'Tests' ? 'tests' : undefined} className="border-rule mt-10 scroll-mt-6 border-t pt-6">
            <h2 className="mb-5 font-serif text-xl font-semibold">{section}</h2>
            <div className="space-y-5">
              {inSection.map((field) => (
                <FieldInput key={field.key} field={field} value={draft[field.key as keyof Draft]} onChange={(v) => setDraft((d) => ({ ...d, [field.key]: v }))} />
              ))}
            </div>
          </section>
        )
      })}

      {failure && <SaveError failure={failure} onReload={() => location.reload()} />}

      <div className="bg-paper border-rule sticky bottom-0 mt-8 flex flex-wrap items-center gap-3 border-t py-4">
        <button type="submit" className={primaryClass} disabled={saving}><Check {...smallIcon} />{saving ? 'Saving' : existing ? 'Save changes' : 'Create requirement'}</button>
        <Link href={back} className={buttonClass}><X {...smallIcon} />Cancel</Link>
        {existing && <button type="button" className={`${quietClass} ml-auto`} onClick={onRaw}><FileCode {...smallIcon} />Edit the YAML instead</button>}
      </div>
    </form>
  )
}
