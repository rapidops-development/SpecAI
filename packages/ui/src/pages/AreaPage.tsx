import { Plus } from 'lucide-react'
import { Markdown } from '../components/Markdown.tsx'
import { primaryClass, smallIcon } from '../components/forms/controls.ts'
import { useSpec } from '../components/SpecContext.tsx'
import { Link, paths } from '../router.tsx'
import { ListPage } from './ListPage.tsx'
import { Missing } from './RequirementPage.tsx'

export function AreaPage({ folder, search }: { folder: string; search: string }) {
  const { index } = useSpec()
  const area = index.areas.find((a) => a.folder === folder)
  if (!area) return <Missing what={`area ${folder}`} />
  return (
    <>
      <header>
        <p className="text-muted text-sm tabular-nums">{area.prefix}</p>
        <h1 className="font-serif text-3xl font-semibold">{area.name}</h1>
        {area.description && <p className="text-muted mt-1">{area.description}</p>}
        {area.overview && <Markdown source={area.overview} className="mt-4" />}
        <p className="mt-5"><Link href={paths.newRequirement(area.folder)} className={primaryClass}><Plus {...smallIcon} />New requirement</Link></p>
      </header>
      <div className="mt-8">
        <ListPage search={search} area={folder} />
      </div>
    </>
  )
}
