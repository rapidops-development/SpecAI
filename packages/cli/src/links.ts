export interface Link {
  target: string
  display?: string
}

const linkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

const codePattern = /`[^`]*`/g

/** Links in the text, ignoring any written inside inline code. */
export function findLinks(text: string): Link[] {
  return [...text.replace(codePattern, ' ').matchAll(linkPattern)].map((m) => ({ target: m[1].trim(), display: m[2]?.trim() }))
}

/** The text as a reader sees it: links replaced by their display text, inline code removed. */
export function readableText(text: string): string {
  return text.replace(codePattern, ' ').replace(linkPattern, (_m, target: string, display?: string) => display ?? target)
}
