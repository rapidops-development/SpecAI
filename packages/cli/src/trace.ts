import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { type Annotation, type BadAnnotation, findAnnotations } from './annotations.ts'
import type { Requirement, RootConfig } from './model.ts'

/** The test frameworks whose tests trace reads. */
export type Framework = 'xunit' | 'vitest' | 'pytest'

/** A place in test code that names a test definition ID. */
export interface TestLink {
  testId: string
  /** Relative to the checkouts folder, with forward slashes. */
  file: string
  line: number
  framework: Framework
}

/** A test found in test code: an xUnit `[Fact]` or `[Theory]` method, or a Vitest `it` or `test` call. */
export interface FoundTest {
  /** Relative to the checkouts folder, with forward slashes. */
  file: string
  line: number
  framework: Framework
  /** The method name, or the Vitest test name. */
  name: string
}

/** One test that names more than one test definition ID. */
export interface MultiLink {
  file: string
  line: number
  framework: Framework
  testIds: string[]
}

/** A link in a component its requirement does not list, so it is not counted. */
export interface MisplacedLink extends TestLink {
  requirement: string
  /** The components the requirement lists. */
  components: string[]
}

/**
 * How much of a requirement's test definitions have linked test code: `covered` when all of them,
 * `partial` when some, `uncovered` when none, and `untested` when it has no test definitions.
 * Deprecated and removed test definitions are not counted.
 */
export type Coverage = 'covered' | 'partial' | 'uncovered' | 'untested'

/**
 * Whether a requirement has code: `implemented` when an implementation annotation in one of its
 * components names it, `planned` when none does but it lists issues, and `unimplemented` otherwise.
 */
export type Implementation = 'implemented' | 'planned' | 'unimplemented'

/** An annotation in a component its requirement does not list, or naming a removed requirement. */
export interface MisplacedAnnotation extends Annotation {
  /** The components the requirement lists. */
  components: string[]
}

export interface TraceResult {
  checkouts: string
  /** Test definition ID → where test code names it, within the requirement's components. */
  links: Record<string, TestLink[]>
  coverage: Record<string, Coverage>
  /** Test code naming a test definition ID that no requirement has. */
  unknown: TestLink[]
  /** Test definition ID → its links, for each test definition named by more than one test. An error. */
  duplicates: Record<string, TestLink[]>
  /** Tests that name more than one test definition ID. An error. */
  multiple: MultiLink[]
  /** Links in components their requirement does not list. A warning. */
  misplaced: MisplacedLink[]
  /** Component name → its tests that name no test definition ID. Information only. */
  untagged: Record<string, FoundTest[]>
  /** Components whose code is not at the expected path. */
  missing: { component: string; path: string }[]
  /** Requirement ID → the implementation annotations naming it, within its components. */
  implementations: Record<string, Annotation[]>
  implementation: Record<string, Implementation>
  /** Annotations naming a requirement that does not exist. An error. */
  unknownAnnotations: Annotation[]
  /** Annotation entries that are a test definition ID or not an ID at all. An error. */
  badAnnotations: BadAnnotation[]
  /** Annotations in components their requirement does not list, so not counted. A warning. */
  misplacedAnnotations: MisplacedAnnotation[]
  /** Annotations naming a removed requirement, which should no longer have code. A warning. */
  removedAnnotations: Annotation[]
}

/** What one component's test code holds. */
export interface ScanResult {
  links: TestLink[]
  multiple: MultiLink[]
  untagged: FoundTest[]
  annotations: Annotation[]
  badAnnotations: BadAnnotation[]
}

const testId = '[A-Z][A-Z0-9]{1,7}-[0-9]{3,}-T[1-9][0-9]*'
// xUnit: [Trait("SpecAI", "LOAN-042-T1")], alone or among other attributes.
const xunitPattern = new RegExp(`Trait\\s*\\(\\s*"SpecAI"\\s*,\\s*"(${testId})"\\s*\\)`, 'g')
// xUnit test attributes: Fact or Theory inside an attribute list, such as [Fact] or [Fact, Trait(...)].
const xunitTestPattern = /(?<=[[,]\s*)(?:Fact|Theory)(?:Attribute)?(?=\s*[\](,])/g
// Vitest: the start of a string holding an ID in square brackets, such as it('[LOAN-042-T1] refuses …').
const vitestPattern = new RegExp(`['"\`][^'"\`\\n]*?\\[${testId}\\]`, 'g')
const bracketedId = new RegExp(`\\[(${testId})\\]`, 'g')
const hasBracketedId = new RegExp(`\\[${testId}\\]`)
// Vitest test calls: it(…), test(…), it.each(…)(…), it.only(…), test.skip(…) and so on.
const vitestCallPattern = /(?<![\w$.])(?:it|test)((?:\s*\.\s*[A-Za-z]+)*)\s*([(`])/g
const vitestFile = /\.(test|spec)\.[cm]?[jt]sx?$/
// pytest's default test files: test_*.py or *_test.py.
const pytestFile = /(?:^|\/)(?:test_[^/]*|[^/]*_test)\.py$/
// pytest: @pytest.mark.specai("LOAN-042-T1"), or @mark.specai(...) after `from pytest import mark`.
const pytestPattern = new RegExp(`@(?:pytest\\s*\\.\\s*)?mark\\s*\\.\\s*specai\\s*\\(\\s*["'](${testId})["']\\s*\\)`, 'g')
// A def or class statement, with its indentation.
const pythonDefinition = /^([ \t]*)(?:async[ \t]+)?(def|class)[ \t]+(\w+)/gm
// Folders never scanned: dependencies, build output and Python virtual environments.
const skipped = new Set(['node_modules', '.git', 'bin', 'obj', 'dist', 'build', 'coverage', '.next', '.venv', 'venv', '.tox'])
// Files that can hold implementation annotations: not documentation, and not too large to be source.
const documentation = /\.(md|mdx|markdown|txt)$/i
const maxSourceBytes = 1_000_000

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
  const found = new Map<string, ScanResult>()
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

  const all = dedupe([...found.values()].flatMap((s) => s.links))
  const known = new Set(requirements.flatMap((r) => (r.tests ?? []).map((t) => t.id)))
  const links: Record<string, TestLink[]> = {}
  const coverage: Record<string, Coverage> = {}
  const duplicates: Record<string, TestLink[]> = {}
  const misplaced: MisplacedLink[] = []
  for (const req of requirements) {
    const scope = req.components?.length ? req.components : components.map((c) => c.name)
    const inScope = dedupe(scope.flatMap((name) => found.get(name)?.links ?? []))
    const counted = (req.tests ?? []).filter((t) => t.status !== 'deprecated' && t.status !== 'removed')
    for (const test of req.tests ?? []) {
      links[test.id] = inScope.filter((l) => l.testId === test.id)
      if (links[test.id].length > 1) duplicates[test.id] = links[test.id]
      const places = new Set(links[test.id].map(place))
      for (const l of all) {
        if (l.testId === test.id && !places.has(place(l))) misplaced.push({ ...l, requirement: req.id, components: scope })
      }
    }
    const linked = counted.filter((t) => links[t.id].length > 0).length
    coverage[req.id] = counted.length === 0 ? 'untested' : linked === counted.length ? 'covered' : linked === 0 ? 'uncovered' : 'partial'
  }
  const unknown = all.filter((l) => !known.has(l.testId))
  const multiple = dedupeBy([...found.values()].flatMap((s) => s.multiple), (m) => `${m.file}:${m.line}`)
  const untagged = Object.fromEntries([...found].map(([name, s]) => [name, s.untagged]))
  return { checkouts, links, coverage, unknown, duplicates, multiple, misplaced, untagged, missing, ...implementationOf(requirements, components, found) }
}

const annotationPlace = (a: Annotation) => `${a.requirementId} ${a.file}:${a.line}`

/** Links implementation annotations to requirements, the same way test links are scoped to components. */
function implementationOf(requirements: Requirement[], components: { name: string }[], found: Map<string, ScanResult>) {
  const all = dedupeBy([...found.values()].flatMap((s) => s.annotations), annotationPlace)
  const ids = new Set(requirements.map((r) => r.id))
  const implementations: Record<string, Annotation[]> = {}
  const implementation: Record<string, Implementation> = {}
  const misplacedAnnotations: MisplacedAnnotation[] = []
  const removedAnnotations: Annotation[] = []
  for (const req of requirements) {
    const scope = req.components?.length ? req.components : components.map((c) => c.name)
    const inScope = dedupeBy(scope.flatMap((name) => found.get(name)?.annotations ?? []), annotationPlace).filter((a) => a.requirementId === req.id)
    implementations[req.id] = inScope
    const places = new Set(inScope.map(annotationPlace))
    for (const a of all) {
      if (a.requirementId === req.id && !places.has(annotationPlace(a))) misplacedAnnotations.push({ ...a, components: scope })
    }
    if (req.status === 'removed') removedAnnotations.push(...inScope)
    implementation[req.id] = inScope.length > 0 ? 'implemented' : req.issues?.length ? 'planned' : 'unimplemented'
  }
  const unknownAnnotations = all.filter((a) => !ids.has(a.requirementId))
  const badAnnotations = dedupeBy([...found.values()].flatMap((s) => s.badAnnotations), (b) => `${b.text} ${b.file}:${b.line}`)
  return { implementations, implementation, unknownAnnotations, badAnnotations, misplacedAnnotations, removedAnnotations }
}

/**
 * Reads the test code under a folder: the test definition IDs it names, the tests naming more than
 * one, and the tests naming none. It reads source text with regular expressions rather than parsing
 * it, so unusual layouts can be missed or miscounted:
 *
 * - an xUnit test is a method with a `[Fact]` or `[Theory]` attribute, in any `.cs` file; its IDs are
 *   the `Trait("SpecAI", …)` attributes in the attribute lists just before it;
 * - a Vitest test is an `it` or `test` call, with any modifiers such as `.each(…)`, `.only` or `.skip`,
 *   whose first argument is a string literal followed by a function or options object, in a `*.test.*` or `*.spec.*`
 *   file; its IDs are the ones in square brackets in that string. Any other string in the file naming
 *   an ID in square brackets also counts as a link, as it always has.
 */
export function scan(dir: string, checkouts: string): ScanResult {
  const out = emptyScan()
  for (const path of listFiles(dir)) {
    if (documentation.test(path) || statSync(path).size > maxSourceBytes) continue
    scanText(readFileSync(path, 'utf8'), relative(checkouts, path).split(sep).join('/'), out)
  }
  return out
}

export function emptyScan(): ScanResult {
  return { links: [], multiple: [], untagged: [], annotations: [], badAnnotations: [] }
}

/** Reads one file's text into a scan result. `file` is its path, with forward slashes; its name decides how it is read. */
export function scanText(text: string, file: string, out: ScanResult): void {
  if (documentation.test(file) || text.includes('\0')) return
  const framework = file.endsWith('.cs') ? 'xunit' : vitestFile.test(file) ? 'vitest' : pytestFile.test(file) ? 'pytest' : undefined
  const lineAt = (index: number) => lineOf(text, index)
  if (framework === 'xunit') scanXunit(text, file, lineAt, out)
  else if (framework === 'vitest') scanVitest(text, file, lineAt, out)
  else if (framework === 'pytest') scanPytest(text, file, lineAt, out)
  // Test files link to test definitions, not requirements, and often hold example annotations as data.
  if (framework === 'vitest' || framework === 'pytest' || (framework === 'xunit' && new RegExp(xunitTestPattern.source).test(text))) return
  const { annotations, bad } = findAnnotations(text, file)
  out.annotations.push(...annotations)
  out.badAnnotations.push(...bad)
}

function scanXunit(text: string, file: string, lineAt: (i: number) => number, out: ScanResult) {
  // Each attribute belongs to the declaration after its attribute lists; group by that position.
  const ids = new Map<number, string[]>()
  for (const m of text.matchAll(xunitPattern)) {
    out.links.push({ testId: m[1], file, line: lineAt(m.index), framework: 'xunit' })
    const at = declarationAfter(text, m.index)
    ids.set(at, [...(ids.get(at) ?? []), m[1]])
  }
  for (const [at, testIds] of ids) {
    if (new Set(testIds).size > 1) out.multiple.push({ file, line: lineAt(at), framework: 'xunit', testIds: [...new Set(testIds)] })
  }
  const tests = new Set<number>()
  for (const m of text.matchAll(xunitTestPattern)) {
    const at = declarationAfter(text, m.index)
    if (tests.has(at)) continue
    tests.add(at)
    if (ids.has(at)) continue
    const name = /([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(/.exec(text.slice(at, at + 300))?.[1] ?? '?'
    out.untagged.push({ file, line: lineAt(at), framework: 'xunit', name })
  }
}

/**
 * From a position inside a C# attribute list, the position of the declaration the attributes belong
 * to: past the end of this list and any further attribute lists and comments.
 */
function declarationAfter(text: string, index: number): number {
  let i = index
  for (let depth = 0; i < text.length; i++) {
    if (text[i] === '[') depth++
    else if (text[i] === ']' && depth-- === 0) break
  }
  i++
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i++
    if (text.startsWith('//', i)) {
      const end = text.indexOf('\n', i)
      i = end < 0 ? text.length : end
    } else if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i)
      i = end < 0 ? text.length : end + 2
    } else if (text[i] === '[') {
      for (let depth = 0; i < text.length; i++) {
        if (text[i] === '[') depth++
        else if (text[i] === ']' && --depth === 0) break
      }
      i++
    } else return i
  }
}

function scanVitest(text: string, file: string, lineAt: (i: number) => number, out: ScanResult) {
  for (const m of text.matchAll(vitestPattern)) {
    const { body } = stringAt(text, m.index)
    const testIds = [...body.matchAll(bracketedId)].map((b) => b[1])
    for (const id of testIds) out.links.push({ testId: id, file, line: lineAt(m.index), framework: 'vitest' })
    if (new Set(testIds).size > 1) out.multiple.push({ file, line: lineAt(m.index), framework: 'vitest', testIds: [...new Set(testIds)] })
  }
  for (const m of text.matchAll(vitestCallPattern)) {
    let i = m.index + m[0].length - 1
    const modifiers = m[1].replace(/\s/g, '')
    if (/\.(each|for)$/.test(modifiers)) {
      // it.each(table)(name, fn) or it.each`table`(name, fn): skip the table.
      i = m[2] === '`' ? stringAt(text, i).end + 1 : closingParen(text, i) + 1
      while (/\s/.test(text[i] ?? '')) i++
      if (text[i] !== '(') continue
    } else if (m[2] !== '(') continue
    i++
    while (/\s/.test(text[i] ?? '')) i++
    if (!`'"\``.includes(text[i] ?? 'x')) continue
    const name = stringAt(text, i)
    let j = name.end + 1
    while (/\s/.test(text[j] ?? '')) j++
    if (text[j] !== ',') continue
    // The next argument is the test function, or an options object before it.
    if (!/^,\s*(?:async\b|function\b|\(|\{|[\w$]+\s*=>)/.test(text.slice(j, j + 200))) continue
    if (hasBracketedId.test(name.body)) continue
    out.untagged.push({ file, line: lineAt(m.index), framework: 'vitest', name: name.body })
  }
}

/**
 * pytest: a test is a `test*` function at module level, or a `test*` method of a `Test*` class at
 * module level, as pytest finds them by default. Its IDs are the `specai` markers in the decorators
 * just above it. A marker above anything else, such as a class, still links but belongs to no test.
 */
// SpecAI: CLI-022
function scanPytest(text: string, file: string, lineAt: (i: number) => number, out: ScanResult) {
  const definitions = [...text.matchAll(pythonDefinition)].map((m) => ({
    at: m.index + m[1].length,
    indent: m[1].replace(/\t/g, '        ').length,
    kind: m[2],
    name: m[3],
  }))
  const ids = new Map<number, string[]>()
  for (const m of text.matchAll(pytestPattern)) {
    out.links.push({ testId: m[1], file, line: lineAt(m.index), framework: 'pytest' })
    const next = definitions.find((d) => d.at > m.index)
    if (next) ids.set(next.at, [...(ids.get(next.at) ?? []), m[1]])
  }
  const outer: (typeof definitions)[number][] = []
  for (const d of definitions) {
    while (outer.length > 0 && outer[outer.length - 1].indent >= d.indent) outer.pop()
    const parent = outer[outer.length - 1]
    outer.push(d)
    const isTest =
      d.kind === 'def' &&
      /^test/.test(d.name) &&
      (parent === undefined || (outer.length === 2 && parent.kind === 'class' && /^Test/.test(parent.name)))
    if (!isTest) continue
    const name = parent ? `${parent.name}::${d.name}` : d.name
    const testIds = [...new Set(ids.get(d.at) ?? [])]
    if (testIds.length > 1) out.multiple.push({ file, line: lineAt(d.at), framework: 'pytest', testIds })
    if (testIds.length === 0) out.untagged.push({ file, line: lineAt(d.at), framework: 'pytest', name })
  }
}

/** The string literal starting at a quote: its text and the position of its closing quote. */
function stringAt(text: string, start: number): { body: string; end: number } {
  const quote = text[start]
  let i = start + 1
  for (; i < text.length; i++) {
    if (text[i] === '\\') i++
    else if (text[i] === quote || (quote !== '`' && text[i] === '\n')) break
  }
  return { body: text.slice(start + 1, i), end: i }
}

/** The position of the parenthesis closing the one at `start`, skipping strings. */
function closingParen(text: string, start: number): number {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (c === "'" || c === '"' || c === '`') i = stringAt(text, i).end
    else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return i
  }
  return text.length
}

function lineOf(text: string, index: number): number {
  let line = 1
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line++
  return line
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (skipped.has(entry.name)) return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(path)
    return entry.isFile() ? [path] : []
  })
}

const place = (l: TestLink) => `${l.testId} ${l.file}:${l.line}`

/** Components can overlap, such as a repo and a folder inside it; count each place once. */
function dedupe(links: TestLink[]): TestLink[] {
  return dedupeBy(links, place)
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
