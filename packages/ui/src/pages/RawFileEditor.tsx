import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isSaveFailure, type SaveFailure, save } from '../api.ts'
import { buttonClass, inputClass, primaryClass, smallIcon } from '../components/forms/controls.ts'
import { announce, SaveError } from '../components/SaveFeedback.tsx'

/** Edits a spec file's YAML directly. The server refuses text that would make the file invalid. */
export function RawFileEditor({ path, onDone, doneLabel = 'Done' }: { path: string; onDone: () => void; doneLabel?: string }) {
  const [file, setFile] = useState<{ text: string; hash: string }>()
  const [text, setText] = useState('')
  const [failure, setFailure] = useState<SaveFailure>()
  const [loadError, setLoadError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const load = () =>
    fetch(`/api/file?path=${encodeURIComponent(path)}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error)
        setFile(body)
        setText(body.text)
        setFailure(undefined)
      })
      .catch((e: Error) => setLoadError(e.message))
  useEffect(() => void load(), [path])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file) return
    setSaving(true)
    try {
      const result = await save('PUT', `/api/file?path=${encodeURIComponent(path)}`, { text, hash: file.hash })
      setFile({ text, hash: result.hash })
      announce([`${path} saved`, ...result.notices])
      onDone()
    } catch (error) {
      setFailure(isSaveFailure(error) ? error : { status: 0, error: String(error), diagnostics: [] })
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <p className="text-danger">Can’t open {path}: {loadError}</p>
  return (
    <form onSubmit={(e) => void submit(e)}>
      <h1 className="font-serif text-3xl font-semibold">Edit YAML</h1>
      <p className="text-muted mt-1 text-sm"><code className="inline">{path}</code></p>
      <label className="mt-5 block">
        <span className="sr-only">YAML for {path}</span>
        <textarea
          className={`${inputClass} field-sizing-content min-h-[24rem] font-mono text-sm leading-relaxed`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          disabled={!file}
        />
      </label>
      {failure && <SaveError failure={failure} onReload={() => void load()} />}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" className={primaryClass} disabled={!file || saving || text === file.text}><Check {...smallIcon} />{saving ? 'Saving' : 'Save YAML'}</button>
        <button type="button" className={buttonClass} onClick={onDone}>{doneLabel}</button>
      </div>
    </form>
  )
}
