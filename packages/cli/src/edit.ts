import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { Document, isMap, isScalar, isSeq, type Node, parse, parseDocument, Scalar, visit, type YAMLMap, type YAMLSeq } from 'yaml'
import type { Diagnostic } from './diagnostic.ts'
import { type Area, type GlossaryTerm, type Requirement, requirementText, type RootConfig, testText } from './model.ts'
import { versionAt } from './schema.ts'
import { classify, contentHash, loadSpecTree, parseSpecYaml } from './tree.ts'
import { validateTree } from './validate.ts'

/** A refused edit, with the HTTP status that describes it. */
export class EditError extends Error {
  readonly status: number
  readonly diagnostics: Diagnostic[]
  readonly current?: { text: string; hash: string }

  constructor(status: number, message: string, extra: { diagnostics?: Diagnostic[]; current?: { text: string; hash: string } } = {}) {
    super(message)
    this.status = status
    this.diagnostics = extra.diagnostics ?? []
    this.current = extra.current
  }
}

export interface SaveResult {
  /** The saved file, relative to the spec tree root. */
  file: string
  hash: string
  /** Things the save changed on the user's behalf, such as returning an edited item to proposed. */
  notices: string[]
  /** Problems the saved file still has that do not block saving, such as a broken link. */
  diagnostics: Diagnostic[]
}

// Field order for keys added to a file, so new fields land where a person would put them.
const requirementOrder = ['specai', 'id', 'title', 'status', 'statement', 'rationale', 'acceptance', 'notes', 'tags', 'components', 'parent', 'related', 'issues', 'tests']
const testOrder = ['id', 'title', 'status', 'level', 'given', 'when', 'then', 'notes']
const termOrder = ['specai', 'term', 'aliases', 'definition', 'avoid']
// Keep long lines whole and write flow lists as [a, b], matching hand-written files.
const stringifyOptions = { lineWidth: 0, flowCollectionPadding: false }
const flowLists = new Set(['tags', 'components', 'related', 'aliases', 'avoid'])

// Problems in the saved file that refuse the save. Broken links are allowed, since a link is often
// written before the term or requirement it points to.
const blocking = new Set(['yaml', 'schema', 'layout', 'ids', 'components'])

export function readSpecFile(root: string, path: string): { path: string; text: string; hash: string } {
  const safe = safePath(path)
  const absolute = join(root, safe)
  if (!existsSync(absolute)) throw new EditError(404, `${safe} does not exist`)
  const text = readFileSync(absolute, 'utf8')
  return { path: safe, text, hash: contentHash(text) }
}

/** Replaces a spec file's text, as typed in the raw YAML editor. */
export function saveRawFile(root: string, path: string, text: string, baseHash: string): SaveResult {
  const safe = safePath(path)
  checkBase(root, safe, baseHash)
  return write(root, safe, text, [])
}

/** Saves a requirement's fields into its file, keeping comments, key order and text styles. */
export function saveRequirement(root: string, id: string, data: Requirement, baseHash: string): SaveResult {
  const path = findRequirement(root, id)
  if (data.id !== id) throw new EditError(400, `the ID cannot change from ${id} to ${data.id}`)
  const { text } = checkBase(root, path, baseHash)
  const doc = parseDocument(text)
  const notices = returnEditedToProposed(parse(text) as Requirement, data)
  updateMap(doc, doc.contents as YAMLMap, stripUndefined(data), requirementOrder)
  return write(root, path, doc.toString(stringifyOptions), notices)
}

/** Creates a requirement in an area with the next unused ID, and returns where it went. */
export function createRequirement(root: string, folder: string, data: Omit<Requirement, 'id' | 'specai'>): SaveResult & { id: string } {
  const prefix = areaPrefix(root, folder)
  const id = nextRequirementId(root, folder, prefix)
  const requirement = { specai: versionAt(root), id, ...data, tests: data.tests?.map((t, i) => ({ ...t, id: `${id}-T${i + 1}` })) }
  const doc = newDocument(stripUndefined(requirement), requirementOrder)
  return { ...write(root, `${folder}/${id}.yaml`, doc.toString(stringifyOptions), [], { create: true }), id }
}

export function saveTerm(root: string, slug: string, data: GlossaryTerm, baseHash: string): SaveResult {
  const path = `glossary/${safeSlug(slug)}.yaml`
  const { text } = checkBase(root, path, baseHash)
  const doc = parseDocument(text)
  updateMap(doc, doc.contents as YAMLMap, stripUndefined(data), termOrder)
  return write(root, path, doc.toString(stringifyOptions), [])
}

/** Creates a glossary term in a file named after the term, and returns its slug. */
export function createTerm(root: string, data: Omit<GlossaryTerm, 'specai'>): SaveResult & { slug: string } {
  const slug = slugify(data.term)
  if (!slug) throw new EditError(400, 'a term needs at least one letter or digit')
  const doc = newDocument(stripUndefined({ specai: versionAt(root), ...data }), termOrder)
  return { ...write(root, `glossary/${slug}.yaml`, doc.toString(stringifyOptions), [], { create: true }), slug }
}

/** The next number after the highest requirement ID in the area, counting removed requirements too. */
export function nextRequirementId(root: string, folder: string, prefix = areaPrefix(root, folder)): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)\\.yaml$`)
  const numbers = readdirSync(join(root, folder)).flatMap((name) => {
    const m = pattern.exec(name)
    return m ? [Number(m[1])] : []
  })
  const next = Math.max(0, ...numbers) + 1
  return `${prefix}-${String(next).padStart(3, '0')}`
}

export function slugify(term: string): string {
  return term
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * When an approved requirement or test definition's text changes but its status does not, the
 * change needs a fresh review: set it back to proposed and say so.
 */
function returnEditedToProposed(before: Requirement, after: Requirement): string[] {
  const notices: string[] = []
  if (before.status === 'approved' && after.status === 'approved' && changed(requirementText(before), requirementText(after))) {
    after.status = 'proposed'
    notices.push(`${after.id} was approved and its text changed, so it is proposed again`)
  }
  const previous = new Map((before.tests ?? []).map((t) => [t.id, t]))
  for (const test of after.tests ?? []) {
    const old = previous.get(test.id)
    if (old?.status === 'approved' && test.status === 'approved' && changed(testText(old), testText(test))) {
      test.status = 'proposed'
      notices.push(`${test.id} was approved and its text changed, so it is proposed again`)
    }
  }
  return notices
}

function changed(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b)
}

/** Validates the new text as part of the whole tree, then writes it. */
function write(root: string, path: string, text: string, notices: string[], { create = false } = {}): SaveResult {
  const absolute = join(root, path)
  if (create && existsSync(absolute)) throw new EditError(409, `${path} already exists`)
  const parsed = parseSpecYaml(text, path)
  if ('error' in parsed) throw new EditError(422, parsed.error.message, { diagnostics: [parsed.error] })
  const tree = loadSpecTree(root)
  const kind = classify(path)
  if (!kind) throw new EditError(400, `${path} is not part of the spec tree layout`)
  tree.files = [...tree.files.filter((f) => f.path !== path), { path, kind, text, ...parsed }]
  tree.diagnostics = tree.diagnostics.filter((d) => d.file !== path)
  const problems = validateTree(tree).filter((d) => d.file === path)
  const refused = problems.filter((d) => d.severity === 'error' && blocking.has(d.rule))
  if (refused.length > 0) throw new EditError(422, refused[0].message, { diagnostics: refused })
  // Write beside the file and rename, so a reader never sees half a file.
  const temporary = `${absolute}.specai-${process.pid}.tmp`
  writeFileSync(temporary, text)
  renameSync(temporary, absolute)
  return { file: path, hash: contentHash(text), notices, diagnostics: problems }
}

function checkBase(root: string, path: string, baseHash: string): { text: string } {
  const current = readSpecFile(root, path)
  if (current.hash !== baseHash) {
    throw new EditError(409, `${path} changed on disk since you opened it`, { current: { text: current.text, hash: current.hash } })
  }
  return current
}

function findRequirement(root: string, id: string): string {
  const config = parse(readFileSync(join(root, 'specai.yaml'), 'utf8')) as RootConfig
  for (const folder of config.areas ?? []) {
    if (existsSync(join(root, folder, `${id}.yaml`))) return `${folder}/${id}.yaml`
  }
  throw new EditError(404, `there is no requirement ${id}`)
}

function areaPrefix(root: string, folder: string): string {
  const config = parse(readFileSync(join(root, 'specai.yaml'), 'utf8')) as RootConfig
  if (!config.areas?.includes(folder)) throw new EditError(404, `there is no area ${folder}`)
  const area = parse(readFileSync(join(root, folder, 'area.yaml'), 'utf8')) as Area
  return area.prefix
}

/** A path inside the spec tree that names a spec file, or an EditError. */
function safePath(path: string): string {
  const clean = normalize(path).split('\\').join('/')
  if (clean.startsWith('/') || clean.split('/').includes('..') || !clean.endsWith('.yaml') || !classify(clean)) {
    throw new EditError(400, `${path} is not a spec file path`)
  }
  return clean
}

function safeSlug(slug: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new EditError(400, `${slug} is not a glossary slug`)
  return slug
}

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// ---- Updating a YAML document in place ----

function newDocument(data: object, order: string[]): Document {
  const doc = new Document({})
  updateMap(doc, doc.contents as YAMLMap, data, order)
  return doc
}

/** Makes a map hold exactly the given fields, reusing existing nodes so comments and styles stay. */
function updateMap(doc: Document, map: YAMLMap, value: object, order: string[]) {
  for (const pair of [...map.items]) {
    if (!(keyName(pair.key) in value)) map.delete(pair.key)
  }
  for (const [key, next] of Object.entries(value)) {
    const existing = map.get(key, true) as Node | undefined
    if (existing && update(doc, existing, next, key)) continue
    const node = createNode(doc, next, key)
    if (map.has(key)) map.set(key, node)
    else insertInOrder(doc, map, key, node, order)
  }
}

/** Key order for the maps inside a list, by the list's key. */
function itemOrder(listKey: string): string[] {
  return listKey === 'tests' ? testOrder : []
}

/** Updates a node in place when its shape matches the new value; false when it must be replaced. */
function update(doc: Document, node: Node, next: unknown, key: string, order: string[] = []): boolean {
  if (isScalar(node) && (next === null || typeof next !== 'object')) {
    if (node.value !== next) {
      node.value = next
      if (typeof next === 'string' && next.includes('\n')) {
        if (node.type !== Scalar.BLOCK_LITERAL && node.type !== Scalar.BLOCK_FOLDED) node.type = Scalar.BLOCK_LITERAL
      } else if (node.type === Scalar.BLOCK_LITERAL || node.type === Scalar.BLOCK_FOLDED) {
        // A single line reads better inline than as a block.
        node.type = Scalar.PLAIN
      }
    }
    return true
  }
  if (isMap(node) && next && typeof next === 'object' && !Array.isArray(next)) {
    updateMap(doc, node, next, order)
    return true
  }
  if (isSeq(node) && Array.isArray(next)) {
    updateSeq(doc, node, next, key)
    return true
  }
  return false
}

/** Lists of objects with IDs are matched by ID, so reordering keeps each item's comments. */
function updateSeq(doc: Document, seq: YAMLSeq, next: unknown[], key: string) {
  const byId = new Map<string, Node>()
  for (const item of seq.items) {
    if (isMap(item) && isScalar(item.get('id', true))) byId.set(String(item.get('id')), item)
  }
  const old = [...seq.items] as Node[]
  // The parser hangs a comment above the first item on the list itself; move it onto the item so it
  // travels with that item when the list is reordered.
  if (seq.commentBefore && old[0] && isMap(old[0]) && !old[0].commentBefore) {
    old[0].commentBefore = seq.commentBefore
    seq.commentBefore = undefined
  }
  const order = itemOrder(key)
  seq.items = next.map((value, i) => {
    const id = value && typeof value === 'object' && 'id' in value ? String((value as { id: unknown }).id) : undefined
    const existing = id !== undefined ? byId.get(id) : old[i]
    if (existing && update(doc, existing, value, '', order)) return existing
    return createItem(doc, value, order)
  })
}

function createNode(doc: Document, value: unknown, key: string): Node {
  const order = itemOrder(key)
  const node = doc.createNode(Array.isArray(value) && order.length > 0 ? value.map((v) => orderKeys(v, order)) : value) as Node
  if (isSeq(node) && flowLists.has(key) && node.items.every(isScalar)) node.flow = true
  return blockMultiline(node)
}

function createItem(doc: Document, value: unknown, order: string[]): Node {
  return blockMultiline(doc.createNode(orderKeys(value, order)) as Node)
}

/** Writes multi-line strings as literal blocks. */
function blockMultiline(node: Node): Node {
  visit(node, {
    Scalar(_k, scalar) {
      if (typeof scalar.value === 'string' && scalar.value.includes('\n')) scalar.type = Scalar.BLOCK_LITERAL
    },
  })
  return node
}

function keyName(key: unknown): string {
  return isScalar(key) ? String(key.value) : String(key)
}

function insertInOrder(doc: Document, map: YAMLMap, key: string, node: Node, order: string[]) {
  const rank = order.indexOf(key)
  const pair = doc.createPair(key, node)
  if (rank === -1) {
    map.items.push(pair)
    return
  }
  const index = map.items.findIndex((p) => {
    return order.indexOf(keyName(p.key)) > rank
  })
  if (index === -1) map.items.push(pair)
  else map.items.splice(index, 0, pair)
}

function orderKeys(value: unknown, order: string[]): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || order.length === 0) return value
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length)
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => rank(a) - rank(b)))
}
