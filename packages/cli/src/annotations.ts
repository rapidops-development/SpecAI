// SpecAI: CLI-017, CLI-018
// Implementation annotations: comments naming the requirements that the code below them implements.
// The comment text starts with "SpecAI:" and lists requirement IDs separated by commas.

/** One requirement ID named by an implementation annotation. */
export interface Annotation {
  requirementId: string
  /** Relative to the checkouts folder, with forward slashes. */
  file: string
  line: number
}

/** An annotation entry that is not a requirement ID. */
export interface BadAnnotation {
  file: string
  line: number
  /** The entry as written. */
  text: string
  reason: 'test-definition' | 'malformed'
}

const requirementId = /^[A-Z][A-Z0-9]{1,7}-[0-9]{3,}$/
const testDefinitionId = /^[A-Z][A-Z0-9]{1,7}-[0-9]{3,}-T[1-9][0-9]*$/
// A line holding only a comment whose text starts with the marker. The comment can open with //, #,
// --, /*, a * continuing a block comment, <!--, ; or {/* (JSX), so annotations work in most languages
// and configuration formats. Text after the marker is read up to the end of the line.
const marker = 'SpecAI:'
const annotationLine = new RegExp(`^[ \\t]*(?:\\/\\/+|#+|--+|\\/\\*+|\\*+|<!--|;+|\\{\\/\\*)[ \\t]*${marker}([^\\n]*)$`, 'gm')
const commentClose = /\s*(?:\*\/\}?|-->)\s*$/

/** The implementation annotations in a file's text. */
export function findAnnotations(text: string, file: string): { annotations: Annotation[]; bad: BadAnnotation[] } {
  const annotations: Annotation[] = []
  const bad: BadAnnotation[] = []
  for (const m of text.matchAll(annotationLine)) {
    const line = lineAt(text, m.index)
    const entries = m[1].replace(commentClose, '').split(',').map((e) => e.trim())
    for (const entry of entries) {
      if (requirementId.test(entry)) annotations.push({ requirementId: entry, file, line })
      else bad.push({ file, line, text: entry, reason: testDefinitionId.test(entry) ? 'test-definition' : 'malformed' })
    }
  }
  return { annotations, bad }
}

function lineAt(text: string, index: number): number {
  let line = 1
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line++
  return line
}
