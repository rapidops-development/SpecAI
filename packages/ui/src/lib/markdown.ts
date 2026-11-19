import { Marked } from 'marked'

const escapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => escapes[c])

/** Renders Markdown with [[links]]. Raw HTML in the source is shown as text, not rendered. */
export function renderMarkdown(source: string, resolve: (target: string) => string | undefined): string {
  const marked = new Marked({
    gfm: true,
    extensions: [
      {
        name: 'wikilink',
        level: 'inline',
        start: (src: string) => src.indexOf('[['),
        tokenizer(src: string) {
          const m = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(src)
          if (m) return { type: 'wikilink', raw: m[0], target: m[1].trim(), text: (m[2] ?? m[1]).trim() }
          return undefined
        },
        renderer(token) {
          const href = resolve(token.target as string)
          const text = escape(token.text as string)
          return href
            ? `<a class="wikilink" href="${escape(href)}">${text}</a>`
            : `<span class="wikilink-broken" title="No term or requirement called ${escape(token.target as string)}">${text}</span>`
        },
      },
    ],
    renderer: {
      html: ({ text }) => escape(text),
      link({ href, text }) {
        if (!/^(https?:|mailto:|\/|#)/i.test(href)) return escape(text)
        return `<a href="${escape(href)}">${escape(text)}</a>`
      },
    },
  })
  return marked.parse(source, { async: false })
}
