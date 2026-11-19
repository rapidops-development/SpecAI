// Splits plain-text fields into pieces the UI renders: text, inline code, [[links]] and EARS keywords.

export type Piece =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; target: string; text: string }
  | { kind: 'ears'; text: string }

const tokenPattern = /`([^`]*)`|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
const earsPattern = /\bshall\b|\b(?:When|While|Where|If)\b|(?<=,\s)(?:then|when|while)\b/g

export function splitText(text: string, { ears = false } = {}): Piece[] {
  const pieces: Piece[] = []
  let last = 0
  for (const m of text.matchAll(tokenPattern)) {
    pushText(pieces, text.slice(last, m.index), ears)
    if (m[1] !== undefined) pieces.push({ kind: 'code', text: m[1] })
    else pieces.push({ kind: 'link', target: m[2].trim(), text: (m[3] ?? m[2]).trim() })
    last = m.index + m[0].length
  }
  pushText(pieces, text.slice(last), ears)
  return pieces
}

function pushText(pieces: Piece[], text: string, ears: boolean) {
  if (!text) return
  if (!ears) {
    pieces.push({ kind: 'text', text })
    return
  }
  let last = 0
  for (const m of text.matchAll(earsPattern)) {
    if (m.index > last) pieces.push({ kind: 'text', text: text.slice(last, m.index) })
    pieces.push({ kind: 'ears', text: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) pieces.push({ kind: 'text', text: text.slice(last) })
}

const requirementId = /^[A-Z][A-Z0-9]{1,7}-[0-9]{3,}$/

/** Where a link goes, or undefined when it names nothing in the index. */
export function resolveLink(target: string, termIndex: Record<string, string>, requirementIds: Set<string>): string | undefined {
  if (requirementId.test(target)) return requirementIds.has(target) ? `/r/${target}` : undefined
  const slug = termIndex[target.toLowerCase()]
  return slug ? `/g/${encodeURIComponent(slug)}` : undefined
}
