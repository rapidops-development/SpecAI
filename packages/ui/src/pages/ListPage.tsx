import { Select } from '../components/forms/Select.tsx'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { icon, smallIcon } from '../components/forms/controls.ts'
import { useMemo, useState } from 'react'
import { RequirementRow } from '../components/RequirementRow.tsx'
import { useSpec } from '../components/SpecContext.tsx'
import {
  applyFilters,
  emptyFilters,
  type Facet,
  facetLabels,
  facetOptions,
  facets,
  type Grouping,
  groupRequirements,
  type ListState,
  parseListState,
  serializeListState,
} from '../lib/filters.ts'
import { createSearch } from '../lib/search.ts'
import { navigate } from '../router.tsx'

export function ListPage({ search, area }: { search: string; area?: string }) {
  const { index } = useSpec()
  const state = parseListState(search)
  const runSearch = useMemo(() => createSearch(index), [index])
  const scoped = area ? { ...state.filters, area: [area] } : state.filters
  const matches = useMemo(() => applyFilters(runSearch(state.q), scoped, index), [runSearch, state.q, JSON.stringify(scoped), index])
  const groups = groupRequirements(index, matches, state.group)
  const update = (next: Partial<ListState>, replace = false) =>
    navigate(location.pathname + serializeListState({ ...state, ...next }), { replace })
  const active = facets.reduce((n, f) => n + (f === 'area' && area ? 0 : state.filters[f].length), 0)

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search requirements</span>
          <Search {...icon} className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
          <input
            type="search"
            value={state.q}
            onChange={(e) => update({ q: e.target.value }, true)}
            placeholder="Search IDs, titles, statements and tests"
            className="border-rule bg-surface placeholder:text-muted w-full rounded-md border py-2 pr-3 pl-9 text-[0.9375rem] outline-none focus:border-[var(--focus)]"
            autoFocus
          />
        </label>
        <label className="text-muted flex items-center gap-2 text-sm">
          Group by
          <Select
            value={state.group}
            onChange={(e) => update({ group: e.target.value as Grouping })}
            className="border-rule bg-surface text-ink rounded-md border py-2 pl-3 outline-none focus:border-[var(--focus)]"
          >
            <option value="none">Nothing</option>
            {facets.filter((f) => !(f === 'area' && area)).map((f) => (
              <option key={f} value={f}>{facetLabels[f]}</option>
            ))}
          </Select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {facets.filter((f) => !(f === 'area' && area)).map((facet) => (
          <FacetFilter
            key={facet}
            facet={facet}
            selected={state.filters[facet]}
            options={facetOptions(index, matches, facet)}
            onChange={(values) => update({ filters: { ...state.filters, [facet]: values } })}
          />
        ))}
        {active > 0 && (
          <button type="button" className="text-accent px-1 text-sm underline underline-offset-2" onClick={() => update({ filters: emptyFilters() })}>
            Clear filters
          </button>
        )}
      </div>

      <p className="text-muted mt-5 text-sm" aria-live="polite">
        {matches.length === 1 ? '1 requirement' : `${matches.length} requirements`}
        {state.q && ' matching your search, best match first'}
      </p>

      {matches.length === 0 ? (
        <p className="border-rule bg-surface mt-3 rounded-md border px-4 py-6">
          Nothing matches. Try fewer words, or clear the filters.
        </p>
      ) : (
        groups.map((group) =>
          state.group === 'none' ? (
            <ul key={group.key} className="border-rule bg-surface mt-3 rounded-md border px-3">
              {group.items.map((req) => <RequirementRow key={req.id} req={req} />)}
            </ul>
          ) : (
            <details key={group.key} open className="group/section mt-5">
              <summary className="flex cursor-pointer list-none items-baseline gap-2 py-1 select-none">
                <ChevronRight {...smallIcon} className="text-muted self-center transition-transform group-open/section:rotate-90" />
                <h2 className="font-serif text-lg font-semibold">{group.label}</h2>
                <span className="text-muted text-sm tabular-nums">{group.items.length}</span>
              </summary>
              <ul className="border-rule bg-surface mt-2 rounded-md border px-3">
                {group.items.map((req) => <RequirementRow key={req.id} req={req} />)}
              </ul>
            </details>
          ),
        )
      )}
    </div>
  )
}

function FacetFilter(props: {
  facet: Facet
  selected: string[]
  options: { value: string; label: string; count: number }[]
  onChange: (values: string[]) => void
}) {
  const { facet, selected, options, onChange } = props
  const [open, setOpen] = useState(false)
  if (options.length === 0) return null
  const summary = selected.length === 0 ? facetLabels[facet] : `${facetLabels[facet]}: ${selected.length === 1 ? options.find((o) => o.value === selected[0])?.label ?? selected[0] : selected.length}`
  return (
    <details className="relative" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary
        className={`flex cursor-pointer list-none items-center gap-1.5 rounded-full border px-3 py-1 text-sm select-none ${
          selected.length ? 'border-[var(--accent)] bg-accent-soft text-ink' : 'border-rule bg-surface text-muted hover:text-ink'
        }`}
      >
        {summary}
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
      </summary>
      <fieldset className="border-rule bg-surface absolute z-10 mt-1 max-h-80 min-w-56 overflow-y-auto rounded-md border p-1 shadow-lg">
        <legend className="sr-only">{facetLabels[facet]}</legend>
        {options.map((o) => (
          <label key={o.value} className="hover:bg-accent-soft flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm">
            <input
              type="checkbox"
              className="accent-[var(--focus)]"
              checked={selected.includes(o.value)}
              onChange={(e) => onChange(e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))}
            />
            <span className="flex-1">{o.label}</span>
            <span className="text-muted text-xs tabular-nums">{o.count}</span>
          </label>
        ))}
      </fieldset>
    </details>
  )
}
