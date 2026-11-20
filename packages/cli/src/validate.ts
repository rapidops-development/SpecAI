import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Diagnostic } from './diagnostic.ts'
import { findLinks, readableText } from './links.ts'
import {
  type Area,
  type GlossaryTerm,
  type Requirement,
  type RootConfig,
  requirementIdPattern,
  requirementText,
  testText,
} from './model.ts'
import { describeError, supportedVersions, treeVersion, validators } from './schema.ts'
import { fileStem, lineOf, type SpecFile, type SpecTree } from './tree.ts'

// Runs every check on a loaded spec tree. Files that fail the schema skip the later checks.
export function validateTree(tree: SpecTree): Diagnostic[] {
  const out: Diagnostic[] = [...tree.diagnostics]
  const version = treeVersion(tree.files)
  if (version === undefined) {
    const root = tree.files.find((f) => f.kind === 'specai')!
    const declared = JSON.stringify((root.data as { specai?: unknown } | null)?.specai ?? null)
    out.push({
      severity: 'error',
      rule: 'version',
      file: root.path,
      line: lineOf(root, '/specai'),
      field: '/specai',
      message: `version ${declared} is not supported; use one of ${supportedVersions.map((v) => `"${v}"`).join(', ')}`,
    })
    return out
  }
  const valid = tree.files.filter((file) => checkVersion(file, version, out) && checkSchema(file, version, out))
  const root = valid.find((f) => f.kind === 'specai')
  if (!tree.files.some((f) => f.kind === 'specai')) {
    out.push({ severity: 'error', rule: 'layout', file: 'specai.yaml', message: 'missing root specai.yaml' })
  }
  const config = root?.data as RootConfig | undefined
  const prefixes = checkAreas(tree, config, valid, out)
  const requirements = valid.filter((f) => f.kind === 'requirement')
  const terms = valid.filter((f) => f.kind === 'glossary-term')
  const termIndex = indexTerms(terms, out)
  const requirementIds = checkIds(requirements, prefixes, out)
  checkComponents(config, root, requirements, out)
  checkLinks(valid, termIndex, requirementIds, out)
  checkAvoidedWords(requirements, terms, out)
  checkTestNotes(requirements, out)
  return out.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0))
}

/** Whether a file passes the schema for its kind, in the given version of the standard. */
export function passesSchema(file: SpecFile, version: string): boolean {
  return validators(version)[file.kind](file.data)
}

/** A file written for another version than its tree's is reported once, rather than as a schema failure. */
function checkVersion(file: SpecFile, version: string, out: Diagnostic[]): boolean {
  const declared = (file.data as { specai?: unknown } | null)?.specai
  if (typeof declared !== 'string' || declared === version) return true
  out.push({
    severity: 'error',
    rule: 'version',
    file: file.path,
    line: lineOf(file, '/specai'),
    field: '/specai',
    message: `written for version "${declared}", but the spec tree is version "${version}"; every file uses the version in specai.yaml`,
  })
  return false
}

function checkSchema(file: SpecFile, version: string, out: Diagnostic[]): boolean {
  const validate = validators(version)[file.kind]
  if (validate(file.data)) return true
  const id = (file.data as { id?: unknown })?.id
  for (const error of validate.errors ?? []) {
    const { field, message } = describeError(error)
    out.push({
      severity: 'error',
      rule: 'schema',
      file: file.path,
      line: lineOf(file, field),
      id: typeof id === 'string' ? id : undefined,
      field: field || undefined,
      message,
    })
  }
  return false
}

/** Checks the area folders against specai.yaml and returns each area folder's prefix. */
function checkAreas(tree: SpecTree, config: RootConfig | undefined, valid: SpecFile[], out: Diagnostic[]): Map<string, string> {
  const prefixes = new Map<string, string>()
  if (!config) return prefixes
  const listed = new Set(config.areas)
  for (const folder of config.areas) {
    if (folder === 'glossary') {
      out.push({ severity: 'error', rule: 'layout', file: 'specai.yaml', message: 'an area folder may not be called glossary' })
      continue
    }
    const dir = join(tree.root, folder)
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      out.push({ severity: 'error', rule: 'layout', file: 'specai.yaml', message: `area folder "${folder}" does not exist` })
    } else if (!existsSync(join(dir, 'area.yaml'))) {
      out.push({ severity: 'error', rule: 'layout', file: `${folder}/area.yaml`, message: `area folder "${folder}" has no area.yaml` })
    }
  }
  const unlisted = new Set<string>()
  for (const file of tree.files) {
    const folder = file.path.split('/')[0]
    if ((file.kind === 'area' || file.kind === 'requirement') && !listed.has(folder) && !unlisted.has(folder)) {
      unlisted.add(folder)
      out.push({ severity: 'error', rule: 'layout', file: file.path, message: `folder "${folder}" is not listed in specai.yaml areas` })
    }
  }
  const owners = new Map<string, string>()
  for (const file of valid.filter((f) => f.kind === 'area')) {
    const folder = file.path.split('/')[0]
    const { prefix } = file.data as Area
    const owner = owners.get(prefix)
    if (owner) {
      out.push({ severity: 'error', rule: 'ids', file: file.path, line: lineOf(file, '/prefix'), field: '/prefix', message: `prefix ${prefix} is already used by area "${owner}"` })
    } else {
      owners.set(prefix, folder)
      prefixes.set(folder, prefix)
    }
  }
  return prefixes
}

/** Checks requirement and test definition IDs and returns every requirement ID. */
function checkIds(requirements: SpecFile[], prefixes: Map<string, string>, out: Diagnostic[]): Set<string> {
  const seen = new Map<string, string>()
  const claim = (id: string, file: SpecFile, field: string) => {
    const other = seen.get(id)
    if (other) {
      out.push({ severity: 'error', rule: 'ids', file: file.path, line: lineOf(file, field), id, field, message: `ID ${id} is also used in ${other}` })
    } else seen.set(id, file.path)
  }
  for (const file of requirements) {
    const req = file.data as Requirement
    const error = (field: string, message: string) =>
      out.push({ severity: 'error', rule: 'ids', file: file.path, line: lineOf(file, field), id: req.id, field, message })
    if (req.id !== fileStem(file.path)) error('/id', `ID ${req.id} does not match the file name ${fileStem(file.path)}.yaml`)
    const prefix = prefixes.get(file.path.split('/')[0])
    if (prefix && !req.id.startsWith(`${prefix}-`)) error('/id', `ID ${req.id} does not start with the area prefix ${prefix}`)
    claim(req.id, file, '/id')
    req.tests?.forEach((test, i) => {
      if (!test.id.startsWith(`${req.id}-T`)) error(`/tests/${i}/id`, `test ID ${test.id} must start with ${req.id}-T`)
      claim(test.id, file, `/tests/${i}/id`)
    })
  }
  const ids = new Set(requirements.map((f) => (f.data as Requirement).id))
  const parents = new Map(requirements.map((f) => [(f.data as Requirement).id, (f.data as Requirement).parent]))
  for (const file of requirements) {
    const req = file.data as Requirement
    const error = (field: string, message: string) =>
      out.push({ severity: 'error', rule: 'links', file: file.path, line: lineOf(file, field), id: req.id, field, message })
    if (req.parent !== undefined) {
      if (!ids.has(req.parent)) error('/parent', `parent ${req.parent} does not exist`)
      else if (hasCycle(req.id, parents)) error('/parent', `parent chain from ${req.id} loops back to itself`)
    }
    req.related?.forEach((id, i) => {
      if (!ids.has(id)) error(`/related/${i}`, `related requirement ${id} does not exist`)
      else if (id === req.id) error(`/related/${i}`, 'a requirement cannot be related to itself')
    })
  }
  return ids
}

function hasCycle(start: string, parents: Map<string, string | undefined>): boolean {
  const visited = new Set<string>()
  for (let id = parents.get(start); id !== undefined; id = parents.get(id)) {
    if (id === start) return true
    if (visited.has(id)) return false
    visited.add(id)
  }
  return false
}

function checkComponents(config: RootConfig | undefined, root: SpecFile | undefined, requirements: SpecFile[], out: Diagnostic[]) {
  if (!config || !root) return
  const names = new Set<string>()
  config.components?.forEach((c, i) => {
    if (names.has(c.name)) {
      out.push({ severity: 'error', rule: 'components', file: root.path, line: lineOf(root, `/components/${i}/name`), field: `/components/${i}/name`, message: `component ${c.name} is listed twice` })
    }
    names.add(c.name)
  })
  for (const file of requirements) {
    const req = file.data as Requirement
    req.components?.forEach((name, i) => {
      if (!names.has(name)) {
        const field = `/components/${i}`
        out.push({ severity: 'error', rule: 'components', file: file.path, line: lineOf(file, field), id: req.id, field, message: `component ${name} is not listed in specai.yaml` })
      }
    })
  }
}

/** Maps every lowercased slug, term and alias to the slug of the term it names. */
function indexTerms(terms: SpecFile[], out: Diagnostic[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const file of terms) {
    const slug = fileStem(file.path)
    const term = file.data as GlossaryTerm
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      out.push({ severity: 'error', rule: 'layout', file: file.path, message: `glossary file name "${slug}" must be lowercase words joined by hyphens` })
    }
    const names: [string, string][] = [
      [slug, ''],
      [term.term, '/term'],
      ...(term.aliases ?? []).map((a, i): [string, string] => [a, `/aliases/${i}`]),
    ]
    for (const [name, field] of names) {
      const key = name.toLowerCase()
      const owner = index.get(key)
      if (owner === undefined) index.set(key, slug)
      else if (owner !== slug) {
        out.push({ severity: 'error', rule: 'links', file: file.path, line: field ? lineOf(file, field) : undefined, field: field || undefined, message: `"${name}" also names the term in glossary/${owner}.yaml` })
      }
    }
  }
  return index
}

function checkLinks(files: SpecFile[], termIndex: Map<string, string>, requirementIds: Set<string>, out: Diagnostic[]) {
  for (const file of files) {
    for (const { pointer, text, id } of textFields(file)) {
      for (const link of findLinks(text)) {
        const resolves = requirementIdPattern.test(link.target) ? requirementIds.has(link.target) : termIndex.has(link.target.toLowerCase())
        if (!resolves) {
          out.push({ severity: 'error', rule: 'links', file: file.path, line: lineOf(file, pointer), id, field: pointer, message: `[[${link.target}]] does not match any term or requirement` })
        }
      }
    }
  }
}

function checkAvoidedWords(requirements: SpecFile[], terms: SpecFile[], out: Diagnostic[]) {
  const avoided = terms.flatMap((file) =>
    ((file.data as GlossaryTerm).avoid ?? []).map((word) => ({
      word,
      slug: fileStem(file.path),
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu'),
    })),
  )
  for (const file of requirements) {
    for (const { pointer, text, id } of textFields(file)) {
      const readable = readableText(text)
      for (const { word, slug, pattern } of avoided) {
        if (pattern.test(readable)) {
          out.push({ severity: 'warning', rule: 'avoid', file: file.path, line: lineOf(file, pointer), id, field: pointer, message: `"${word}" is an avoided word; use [[${slug}]]` })
        }
      }
    }
  }
}

// Notes that name the test implementing a test definition: "implemented by" or "tested in" followed
// by inline code in the same sentence, or a test file name. Kept narrow to avoid false alarms.
const testLocation = [
  /\b(?:implemented|tested)\s+(?:by|in)\b[^.\n]*`[^`\n]+`/i,
  /[\w-]+\.(?:test|spec)\.[cm]?[jt]sx?\b/,
  /\b\w+Tests?\.cs\b/,
]

function checkTestNotes(requirements: SpecFile[], out: Diagnostic[]) {
  for (const file of requirements) {
    for (const [i, test] of ((file.data as Requirement).tests ?? []).entries()) {
      const notes = test.notes
      if (!notes || !testLocation.some((pattern) => pattern.test(notes))) continue
      const field = `/tests/${i}/notes`
      out.push({
        severity: 'warning',
        rule: 'notes',
        file: file.path,
        line: lineOf(file, field),
        id: test.id,
        field,
        message: 'notes appear to name the test that implements this test definition; leave that out, since `specai trace` works it out',
      })
    }
  }
}

function textFields(file: SpecFile): { pointer: string; text: string; id?: string }[] {
  switch (file.kind) {
    case 'requirement': {
      const req = file.data as Requirement
      return [
        ...requirementText(req).map(([pointer, text]) => ({ pointer, text, id: req.id })),
        ...(req.tests ?? []).flatMap((test, i) =>
          testText(test).map(([pointer, text]) => ({ pointer: `/tests/${i}${pointer}`, text, id: test.id })),
        ),
      ]
    }
    case 'area': {
      const area = file.data as Area
      return [
        { pointer: '/name', text: area.name },
        ...(area.description ? [{ pointer: '/description', text: area.description }] : []),
        ...(area.overview ? [{ pointer: '/overview', text: area.overview }] : []),
      ]
    }
    case 'glossary-term':
      return [{ pointer: '/definition', text: (file.data as GlossaryTerm).definition }]
    case 'specai':
      return []
  }
}
