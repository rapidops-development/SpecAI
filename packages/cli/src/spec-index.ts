import { basename, dirname } from 'node:path'
import type { Diagnostic } from './diagnostic.ts'
import { findLinks } from './links.ts'
import { type Area, type GlossaryTerm, type Requirement, type RootConfig, requirementIdPattern, requirementText, testText } from './model.ts'
import { contentHash, fileStem, loadSpecTree, type SpecFile } from './tree.ts'
import { type TraceResult, trace } from './trace.ts'
import { passesSchema, validateTree } from './validate.ts'

export interface IndexedArea extends Area {
  folder: string
  file: string
  requirementIds: string[]
}

export interface IndexedRequirement extends Requirement {
  area: string
  file: string
  /** Fingerprint of the file's text; send it back with an edit. */
  hash: string
}

export interface IndexedTerm extends GlossaryTerm {
  slug: string
  file: string
  hash: string
}

/** A page another page links to: a requirement ID, `term:<slug>` or `area:<folder>`. */
export type PageKey = string

/** Everything the UI shows, worked out from one spec tree. */
export interface SpecIndex {
  name: string
  config: RootConfig | null
  areas: IndexedArea[]
  requirements: IndexedRequirement[]
  terms: IndexedTerm[]
  /** Lowercased slug, term or alias → term slug. */
  termIndex: Record<string, string>
  /** Page → the pages whose text links to it, or whose `related` names it. */
  backlinks: Record<PageKey, PageKey[]>
  /** Requirement ID → the requirements whose parent it is. */
  children: Record<string, string[]>
  diagnostics: Diagnostic[]
  /** Coverage from scanning test code, when the component checkouts are known. */
  trace?: TraceResult
}

export interface IndexOptions {
  /** Where component checkouts are, to work out coverage. */
  checkouts?: string
  /** Reuses a trace instead of scanning again, for when only spec files changed. */
  traceCache?: TraceCache
}

/** Remembers the last scan of test code for a while, since scanning large repos takes time. */
export class TraceCache {
  private value?: { at: number; key: string; result: ReturnType<typeof trace> }
  private readonly maxAgeMs: number

  constructor(maxAgeMs = 15_000) {
    this.maxAgeMs = maxAgeMs
  }

  get(key: string, compute: () => ReturnType<typeof trace>): ReturnType<typeof trace> {
    if (this.value && this.value.key === key && Date.now() - this.value.at < this.maxAgeMs) return this.value.result
    const result = compute()
    this.value = { at: Date.now(), key, result }
    return result
  }
}

export function buildIndex(root: string, options: IndexOptions = {}): SpecIndex {
  const tree = loadSpecTree(root)
  const diagnostics = validateTree(tree)
  const valid = tree.files.filter(passesSchema)
  const config = (valid.find((f) => f.kind === 'specai')?.data as RootConfig | undefined) ?? null
  const order = new Map(config?.areas.map((folder, i) => [folder, i]))
  const folderOf = (file: SpecFile) => file.path.split('/')[0]

  const requirements = valid
    .filter((f) => f.kind === 'requirement')
    .map((f): IndexedRequirement => ({ ...(f.data as Requirement), area: folderOf(f), file: f.path, hash: contentHash(f.text) }))
    .sort((a, b) => (order.get(a.area) ?? Infinity) - (order.get(b.area) ?? Infinity) || a.id.localeCompare(b.id, undefined, { numeric: true }))
  const areas = valid
    .filter((f) => f.kind === 'area')
    .map((f): IndexedArea => ({
      ...(f.data as Area),
      folder: folderOf(f),
      file: f.path,
      requirementIds: requirements.filter((r) => r.area === folderOf(f)).map((r) => r.id),
    }))
    .sort((a, b) => (order.get(a.folder) ?? Infinity) - (order.get(b.folder) ?? Infinity))
  const terms = valid
    .filter((f) => f.kind === 'glossary-term')
    .map((f): IndexedTerm => ({ ...(f.data as GlossaryTerm), slug: fileStem(f.path), file: f.path, hash: contentHash(f.text) }))
    .sort((a, b) => a.term.localeCompare(b.term))

  const termIndex: Record<string, string> = {}
  for (const t of terms) {
    for (const name of [t.slug, t.term, ...(t.aliases ?? [])]) termIndex[name.toLowerCase()] ??= t.slug
  }

  const backlinks: Record<PageKey, PageKey[]> = {}
  const link = (from: PageKey, to: PageKey) => {
    if (from === to) return
    const list = (backlinks[to] ??= [])
    if (!list.includes(from)) list.push(from)
  }
  const resolve = (target: string): PageKey | undefined => {
    if (requirementIdPattern.test(target)) return target
    const slug = termIndex[target.toLowerCase()]
    return slug ? `term:${slug}` : undefined
  }
  const linkText = (from: PageKey, texts: string[]) => {
    for (const text of texts) for (const l of findLinks(text)) {
      const to = resolve(l.target)
      if (to) link(from, to)
    }
  }
  for (const r of requirements) {
    linkText(r.id, [...requirementText(r), ...(r.tests ?? []).flatMap(testText)].map(([, text]) => text))
    for (const id of r.related ?? []) link(r.id, id)
  }
  for (const t of terms) linkText(`term:${t.slug}`, [t.definition])
  for (const a of areas) linkText(`area:${a.folder}`, [a.name, a.description ?? '', a.overview ?? ''])

  const children: Record<string, string[]> = {}
  for (const r of requirements) if (r.parent) (children[r.parent] ??= []).push(r.id)

  let traced: SpecIndex['trace']
  if (options.checkouts && config) {
    const run = () => trace(config, requirements, options.checkouts!)
    // The key covers what the scan depends on, so editing tests or components rescans at once.
    const key = JSON.stringify([config.components, requirements.map((r) => [r.id, r.components, r.tests?.map((t) => [t.id, t.status])])])
    traced = options.traceCache ? options.traceCache.get(key, run) : run()
  }
  return { name: config?.name ?? displayName(root), config, areas, requirements, terms, termIndex, backlinks, children, diagnostics, trace: traced }
}

/** The spec tree's folder name, or its parent's when the folder is just called specs. */
function displayName(root: string): string {
  const name = basename(root)
  return name === 'specs' ? basename(dirname(root)) : name
}
