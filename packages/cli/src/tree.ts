import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { type Document, isAlias, isNode, LineCounter, parseDocument, visit } from 'yaml'
import type { Diagnostic } from './diagnostic.ts'

export type FileKind = 'specai' | 'area' | 'requirement' | 'glossary-term'

export interface SpecFile {
  /** Path relative to the spec tree root, with forward slashes. */
  path: string
  kind: FileKind
  data: unknown
  doc: Document
  lines: LineCounter
  /** The file's text, as read. */
  text: string
}

export interface SpecTree {
  root: string
  files: SpecFile[]
  /** Problems found while reading: parse errors and files outside the layout. */
  diagnostics: Diagnostic[]
}

// Reads every YAML file under root and classifies it by its place in the layout.
export function loadSpecTree(root: string): SpecTree {
  const files: SpecFile[] = []
  const diagnostics: Diagnostic[] = []
  for (const absolute of listFiles(root)) {
    const path = relative(root, absolute).split(sep).join('/')
    if (path.endsWith('.yml')) {
      diagnostics.push({ severity: 'error', rule: 'layout', file: path, message: 'spec files use the .yaml extension' })
      continue
    }
    if (!path.endsWith('.yaml')) continue
    const kind = classify(path)
    if (!kind) {
      diagnostics.push({ severity: 'error', rule: 'layout', file: path, message: 'not part of the spec tree layout' })
      continue
    }
    const text = readFileSync(absolute, 'utf8')
    const parsed = parseSpecYaml(text, path)
    if ('error' in parsed) diagnostics.push(parsed.error)
    else files.push({ path, kind, text, ...parsed })
  }
  return { root, files, diagnostics }
}

export function classify(path: string): FileKind | undefined {
  const parts = path.split('/')
  if (parts.length === 1) return parts[0] === 'specai.yaml' ? 'specai' : undefined
  if (parts.length !== 2) return undefined
  if (parts[0] === 'glossary') return 'glossary-term'
  return parts[1] === 'area.yaml' ? 'area' : 'requirement'
}

// Parses text in the restricted YAML subset: no anchors, aliases or custom tags.
export function parseSpecYaml(
  text: string,
  path: string,
): { data: unknown; doc: Document; lines: LineCounter } | { error: Diagnostic } {
  const lines = new LineCounter()
  const doc = parseDocument(text, { lineCounter: lines, uniqueKeys: true })
  const fail = (offset: number, message: string) => ({
    error: { severity: 'error', rule: 'yaml', file: path, line: lines.linePos(offset).line, message } satisfies Diagnostic,
  })
  if (doc.errors.length > 0) {
    const error = doc.errors[0]
    return fail(error.pos[0], error.message.split('\n')[0])
  }
  let problem: { offset: number; message: string } | undefined
  visit(doc, (_key, node) => {
    const offset = isNode(node) ? (node.range?.[0] ?? 0) : 0
    if (isAlias(node)) problem = { offset, message: 'aliases are not allowed' }
    else if (isNode(node) && node.anchor) problem = { offset, message: 'anchors are not allowed' }
    else if (isNode(node) && node.tag && !node.tag.startsWith('tag:yaml.org,2002:')) {
      problem = { offset, message: 'custom tags are not allowed' }
    }
    return problem ? visit.BREAK : undefined
  })
  if (problem) return fail(problem.offset, problem.message)
  return { data: doc.toJS(), doc, lines }
}

/** The line of the deepest node that exists on a JSON pointer path, such as `/tests/0/then`. */
export function lineOf(file: SpecFile, pointer: string): number | undefined {
  const keys = pointer.split('/').slice(1).map((k) => (/^\d+$/.test(k) ? Number(k) : k.replace(/~1/g, '/').replace(/~0/g, '~')))
  for (let depth = keys.length; depth >= 0; depth--) {
    const node = depth === 0 ? file.doc.contents : file.doc.getIn(keys.slice(0, depth), true)
    if (isNode(node) && node.range) return file.lines.linePos(node.range[0]).line
  }
  return undefined
}

export function fileStem(path: string): string {
  return basename(path, '.yaml')
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.') || name === 'node_modules') return []
    const path = join(dir, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

/** A short fingerprint of a file's text, used to notice edits made on disk in the meantime. */
export function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}
