// SpecAI: CLI-020
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Requirement, RootConfig } from './model.ts'
import { emptyScan, type ScanResult, scanText } from './trace.ts'

/** A place in a changed file that names a requirement. */
export interface ImpactPlace {
  kind: 'implementation' | 'test'
  /** Relative to the checkouts folder, with forward slashes. */
  file: string
  line: number
  /** For a test, the test definition it names. */
  testId?: string
  /** True when the place was in the file before the change and is gone now. */
  removed?: true
}

export interface ImpactResult {
  since: string
  /** Requirements named in changed files, in spec tree order. */
  requirements: { id: string; title: string; status: string; places: ImpactPlace[] }[]
  /** Components that could not be compared, and why. */
  skipped: { component: string; reason: string }[]
}

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })

/**
 * Finds the requirements whose implementation annotations or linked tests are in files changed
 * since a revision: between where the current checkout branched from it and the files on disk now.
 * Both sides of each changed file are read, so code that was deleted still counts.
 */
export function impact(config: RootConfig, requirements: Requirement[], checkouts: string, since: string): ImpactResult {
  const skipped: ImpactResult['skipped'] = []
  const repos = new Map<string, { base: string; changed: string[] } | string>()
  const after = emptyScan()
  const before = emptyScan()
  const seen = new Set<string>()
  for (const component of config.components ?? []) {
    const dir = join(checkouts, component.path ?? component.name)
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      skipped.push({ component: component.name, reason: `no checkout at ${dir}` })
      continue
    }
    let top: string
    try {
      top = git(dir, 'rev-parse', '--show-toplevel').trim()
    } catch {
      skipped.push({ component: component.name, reason: 'not in a git repository' })
      continue
    }
    if (!repos.has(top)) repos.set(top, compare(top, since))
    const repo = repos.get(top)!
    if (typeof repo === 'string') {
      skipped.push({ component: component.name, reason: repo })
      continue
    }
    const prefix = relative(top, dir).split(sep).join('/')
    for (const path of repo.changed) {
      if (prefix && path !== prefix && !path.startsWith(`${prefix}/`)) continue
      if (seen.has(`${top}\0${path}`)) continue
      seen.add(`${top}\0${path}`)
      const file = relative(checkouts, join(top, path)).split(sep).join('/')
      const now = join(top, path)
      if (existsSync(now) && statSync(now).isFile() && statSync(now).size <= 1_000_000) scanText(readFileSync(now, 'utf8'), file, after)
      try {
        scanText(git(top, 'show', `${repo.base}:${path}`), file, before)
      } catch {
        // The file is new.
      }
    }
  }
  return { since, requirements: touched(requirements, after, before), skipped }
}

function compare(top: string, since: string): { base: string; changed: string[] } | string {
  let base: string
  try {
    base = git(top, 'merge-base', since, 'HEAD').trim()
  } catch {
    return `${since} is not a revision in ${top}`
  }
  const changed = git(top, 'diff', '--name-only', '--no-renames', '-z', base).split('\0').filter(Boolean)
  const untracked = git(top, 'ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)
  return { base, changed: [...new Set([...changed, ...untracked])] }
}

function touched(requirements: Requirement[], after: ScanResult, before: ScanResult): ImpactResult['requirements'] {
  const owner = new Map(requirements.flatMap((r) => (r.tests ?? []).map((t) => [t.id, r.id] as const)))
  const places = (scan: ScanResult): [string, ImpactPlace][] => [
    ...scan.annotations.map((a): [string, ImpactPlace] => [a.requirementId, { kind: 'implementation', file: a.file, line: a.line }]),
    ...scan.links.flatMap((l): [string, ImpactPlace][] => {
      const id = owner.get(l.testId)
      return id ? [[id, { kind: 'test', file: l.file, line: l.line, testId: l.testId }]] : []
    }),
  ]
  const now = places(after)
  // A place counts as removed when its requirement (and test definition) no longer appears in that file.
  const present = new Set(now.map(([id, p]) => `${id} ${p.kind} ${p.testId ?? ''} ${p.file}`))
  const gone = places(before)
    .filter(([id, p]) => !present.has(`${id} ${p.kind} ${p.testId ?? ''} ${p.file}`))
    .map(([id, p]): [string, ImpactPlace] => [id, { ...p, removed: true }])
  const byId = new Map<string, ImpactPlace[]>()
  const keys = new Set<string>()
  for (const [id, p] of [...now, ...gone]) {
    const key = `${id} ${p.kind} ${p.testId ?? ''} ${p.file}:${p.line} ${p.removed ?? ''}`
    if (keys.has(key)) continue
    keys.add(key)
    byId.set(id, [...(byId.get(id) ?? []), p])
  }
  return requirements.filter((r) => byId.has(r.id)).map((r) => ({ id: r.id, title: r.title, status: r.status, places: byId.get(r.id)! }))
}
