import { Link, paths } from '../router.tsx'
import type { SpecIndex } from '../types.ts'
import { useSpec } from './SpecContext.tsx'

/** A list of pages by key: a requirement ID, `term:<slug>` or `area:<folder>`. */
export function PageLinks({ keys, empty }: { keys: string[]; empty?: string }) {
  const { index } = useSpec()
  if (keys.length === 0) return empty ? <p className="text-muted text-sm">{empty}</p> : null
  return (
    <ul className="space-y-1.5">
      {keys.map((key) => {
        const page = describe(index, key)
        return (
          <li key={key} className="text-sm leading-snug">
            <Link href={page.href} className="hover:underline hover:underline-offset-2">
              {page.id && <span className="text-muted mr-1.5 font-medium tabular-nums">{page.id}</span>}
              {page.title}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function describe(index: SpecIndex, key: string): { href: string; id?: string; title: string } {
  if (key.startsWith('term:')) {
    const slug = key.slice(5)
    return { href: paths.term(slug), title: index.terms.find((t) => t.slug === slug)?.term ?? slug }
  }
  if (key.startsWith('area:')) {
    const folder = key.slice(5)
    return { href: paths.area(folder), title: `${index.areas.find((a) => a.folder === folder)?.name ?? folder} overview` }
  }
  return { href: paths.requirement(key), id: key, title: index.requirements.find((r) => r.id === key)?.title ?? '' }
}
