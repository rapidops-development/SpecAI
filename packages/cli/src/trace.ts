import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { Requirement, RootConfig } from './model.ts'

/** A place in test code that names a test definition ID. */
export interface TestLink {
  testId: string
  /** Relative to the checkouts folder, with forward slashes. */
  file: string
  line: number
  framework: 'xunit' | 'vitest'
}

/**
 * How much of a requirement's test definitions have linked test code: `covered` when all of them,
 * `partial` when some, `uncovered` when none, and `untested` when it has no test definitions.
 * Deprecated and removed test definitions are not counted.
 */
export type Coverage = 'covered' | 'partial' | 'uncovered' | 'untested'

export interface TraceResult {
  checkouts: string
  /** Test definition ID → where test code names it, within the requirement's components. */
  links: Record<string, TestLink[]>
  coverage: Record<string, Coverage>
  /** Test code naming a test definition ID that no requirement has. */
  unknown: TestLink[]
  /** Components whose code is not at the expected path. */
  missing: { component: string; path: string }[]
}

const testId = '[A-Z][A-Z0-9]{1,7}-[0-9]{3,}-T[1-9][0-9]*'
// xUnit: [Trait("SpecAI", "LOAN-042-T1")], alone or among other attributes.
const xunitPattern = new RegExp(`Trait\\s*\\(\\s*"SpecAI"\\s*,\\s*"(${testId})"\\s*\\)`, 'g')
// Vitest: the ID in square brackets inside a string, such as it('[LOAN-042-T1] refuses …').
const vitestPattern = new RegExp(`['"\`][^'"\`\\n]*?\\[(${testId})\\]`, 'g')
const vitestFile = /\.(test|spec)\.[cm]?[jt]sx?$/
const skipped = new Set(['node_modules', '.git', 'bin', 'obj', 'dist', 'build', 'coverage', '.next'])

/** The folder the component checkouts sit in: by default, the folder holding the spec tree's repo. */
export function defaultCheckouts(specRoot: string): string {
  try {
    const top = execFileSync('git', ['-C', specRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return dirname(top)
  } catch {
    return dirname(resolve(specRoot))
  }
}

// Finds test code that names test definition IDs and works out each requirement's coverage.
// Coverage is reported, never written into spec files.
export function trace(config: RootConfig, requirements: Requirement[], checkouts: string): TraceResult {
  const components = config.components ?? []
  const found = new Map<string, TestLink[]>()
  const missing: TraceResult['missing'] = []
  for (const component of components) {
    const path = component.path ?? component.name
    const dir = join(checkouts, path)
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      missing.push({ component: component.name, path })
      continue
    }
    found.set(component.name, scan(dir, checkouts))
  }

  const known = new Set(requirements.flatMap((r) => (r.tests ?? []).map((t) => t.id)))
  const links: Record<string, TestLink[]> = {}
  const coverage: Record<string, Coverage> = {}
  for (const req of requirements) {
    const scope = req.components?.length ? req.components : components.map((c) => c.name)
    const inScope = scope.flatMap((name) => found.get(name) ?? [])
    const counted = (req.tests ?? []).filter((t) => t.status !== 'deprecated' && t.status !== 'removed')
    for (const test of req.tests ?? []) links[test.id] = dedupe(inScope.filter((l) => l.testId === test.id))
    const linked = counted.filter((t) => links[t.id].length > 0).length
    coverage[req.id] = counted.length === 0 ? 'untested' : linked === counted.length ? 'covered' : linked === 0 ? 'uncovered' : 'partial'
  }
  const unknown = dedupe([...found.values()].flat().filter((l) => !known.has(l.testId)))
  return { checkouts, links, coverage, unknown, missing }
}

/** Test definition IDs named in the test code under a folder. */
export function scan(dir: string, checkouts: string): TestLink[] {
  const out: TestLink[] = []
  for (const path of listFiles(dir)) {
    const framework = path.endsWith('.cs') ? 'xunit' : vitestFile.test(path) ? 'vitest' : undefined
    if (!framework) continue
    const text = readFileSync(path, 'utf8')
    const pattern = framework === 'xunit' ? xunitPattern : vitestPattern
    for (const m of text.matchAll(pattern)) {
      out.push({
        testId: m[1],
        file: relative(checkouts, path).split(sep).join('/'),
        line: text.slice(0, m.index).split('\n').length,
        framework,
      })
    }
  }
  return out
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (skipped.has(entry.name)) return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(path)
    return entry.isFile() ? [path] : []
  })
}

/** Components can overlap, such as a repo and a folder inside it; count each place once. */
function dedupe(links: TestLink[]): TestLink[] {
  const seen = new Set<string>()
  return links.filter((l) => {
    const key = `${l.testId} ${l.file}:${l.line}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
