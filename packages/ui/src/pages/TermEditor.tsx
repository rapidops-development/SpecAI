import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { isSaveFailure, type SaveFailure, save } from '../api.ts'
import { buttonClass, primaryClass, smallIcon } from '../components/forms/controls.ts'
import { FieldInput } from '../components/forms/FieldInput.tsx'
import { useFields } from '../components/forms/TestsInput.tsx'
import { announce, SaveError } from '../components/SaveFeedback.tsx'
import { useSpec } from '../components/SpecContext.tsx'
import { cleanData } from '../lib/fields.ts'
import { Link, navigate, paths } from '../router.tsx'
import type { GlossaryTerm } from '../types.ts'
import { Missing } from './RequirementPage.tsx'

/** Edits a glossary term, or creates one when no slug is given. */
export function TermEditor({ slug }: { slug?: string }) {
  const { index } = useSpec()
  const existing = slug ? index.terms.find((t) => t.slug === slug) : undefined
  const fields = useFields('glossary-term')
  const [draft, setDraft] = useState<Partial<GlossaryTerm>>(() => {
    if (!existing) return { term: '', definition: '' }
    const { slug: _s, file: _f, hash: _h, ...data } = existing
    return data
  })
  const [failure, setFailure] = useState<SaveFailure>()
  const [saving, setSaving] = useState(false)
  if (slug && !existing) return <Missing what={`glossary term ${slug}`} />
  const back = existing ? paths.term(existing.slug) : '/glossary'

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFailure(undefined)
    try {
      const data = cleanData(draft)
      if (existing) {
        await save('PUT', `/api/terms/${encodeURIComponent(existing.slug)}`, { data, hash: existing.hash })
        announce([`${data.term} saved`])
        navigate(paths.term(existing.slug))
      } else {
        const { specai: _v, ...fields } = data
        const result = await save('POST', '/api/terms', { data: fields })
        announce([`${data.term} added to the glossary`])
        navigate(paths.term(result.slug!))
      }
    } catch (error) {
      setFailure(isSaveFailure(error) ? error : { status: 0, error: String(error), diagnostics: [] })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <p className="text-muted text-sm"><Link href={back} className="hover:underline">{existing ? existing.term : 'Glossary'}</Link></p>
      <h1 className="mt-1 font-serif text-3xl font-semibold">{existing ? `Edit ${existing.term}` : 'New glossary term'}</h1>
      {!existing && <p className="text-muted mt-2">The file is named after the term, so link to it by the term or any other name you give it.</p>}
      <div className="border-rule mt-8 space-y-5 border-t pt-6">
        {fields.map((field) => (
          <FieldInput key={field.key} field={field} value={draft[field.key as keyof GlossaryTerm]} onChange={(v) => setDraft((d) => ({ ...d, [field.key]: v }))} />
        ))}
      </div>
      {failure && <SaveError failure={failure} onReload={() => location.reload()} />}
      <div className="mt-8 flex gap-3">
        <button type="submit" className={primaryClass} disabled={saving}><Check {...smallIcon} />{saving ? 'Saving' : existing ? 'Save changes' : 'Add term'}</button>
        <Link href={back} className={buttonClass}><X {...smallIcon} />Cancel</Link>
      </div>
    </form>
  )
}
