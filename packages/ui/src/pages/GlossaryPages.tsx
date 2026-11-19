import { Pencil, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import Fuse from 'fuse.js'
import { Markdown } from '../components/Markdown.tsx'
import { PageLinks } from '../components/PageLinks.tsx'
import { useSpec } from '../components/SpecContext.tsx'
import { buttonClass, icon, primaryClass, smallIcon } from '../components/forms/controls.ts'
import { Link, paths } from '../router.tsx'
import { Missing } from './RequirementPage.tsx'

export function GlossaryPage() {
  const { index } = useSpec()
  const [q, setQ] = useState('')
  const terms = q.trim()
    ? new Fuse(index.terms, { keys: ['term', 'aliases', 'definition'], threshold: 0.35, ignoreLocation: true }).search(q).map((r) => r.item)
    : index.terms
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-semibold">Glossary</h1>
        <Link href="/glossary/new" className={primaryClass}><Plus {...smallIcon} />New term</Link>
      </div>
      <label className="relative mt-4 block">
        <Search {...icon} className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
        <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search terms"
        aria-label="Search terms"
        className="border-rule bg-surface placeholder:text-muted w-full rounded-md border py-2 pr-3 pl-9 outline-none focus:border-[var(--focus)]"
        />
      </label>
      {terms.length === 0 ? (
        <p className="text-muted mt-4">No term matches.</p>
      ) : (
        <dl className="border-rule bg-surface mt-4 rounded-md border px-4">
          {terms.map((t) => (
            <div key={t.slug} className="border-rule border-b py-3 last:border-b-0">
              <dt>
                <Link href={paths.term(t.slug)} className="font-medium hover:underline hover:underline-offset-2">{t.term}</Link>
              </dt>
              <dd className="text-muted mt-0.5"><Markdown source={t.definition} /></dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

export function TermPage({ slug }: { slug: string }) {
  const { index } = useSpec()
  const term = index.terms.find((t) => t.slug === slug)
  if (!term) return <Missing what={`glossary term ${slug}`} />
  return (
    <article>
      <p className="text-muted text-sm"><Link href="/glossary" className="hover:underline">Glossary</Link></p>
      <h1 className="mt-1 font-serif text-3xl font-semibold">{term.term}</h1>
      {term.aliases && <p className="text-muted mt-1">Also written {term.aliases.join(', ')}</p>}
      <p className="mt-4"><Link href={paths.editTerm(term.slug)} className={buttonClass}><Pencil {...smallIcon} />Edit</Link></p>
      <Markdown source={term.definition} className="mt-5 text-[1.2rem]" />
      {term.avoid && (
        <p className="border-rule bg-surface mt-6 rounded-md border px-4 py-3 text-sm">
          Don’t call this {term.avoid.map((w, i) => <span key={w}>{i > 0 && (i === term.avoid!.length - 1 ? ' or ' : ', ')}<q>{w}</q></span>)}. The validator warns when requirements or tests do.
        </p>
      )}
      <section className="mt-8">
        <h2 className="font-serif text-lg font-semibold">Linked from</h2>
        <div className="mt-2"><PageLinks keys={index.backlinks[`term:${slug}`] ?? []} empty="Nothing links to this term yet." /></div>
      </section>
      <p className="text-muted mt-8 text-sm">File <code>glossary/{slug}.yaml</code></p>
    </article>
  )
}
