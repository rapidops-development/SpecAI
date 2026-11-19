import { splitText } from '../lib/text.ts'
import { Link } from '../router.tsx'
import { useSpec } from './SpecContext.tsx'

/**
 * A plain-text field: [[links]] become navigation, inline code is marked, EARS keywords optionally.
 * Pass links={false} inside another link, where nested links are not allowed.
 */
export function Text({ text, ears = false, links = true }: { text: string; ears?: boolean; links?: boolean }) {
  const { resolve } = useSpec()
  return (
    <>
      {splitText(text, { ears }).map((piece, i) => {
        switch (piece.kind) {
          case 'text':
            return piece.text
          case 'code':
            return <code key={i} className="inline">{piece.text}</code>
          case 'ears':
            return <em key={i} className="ears">{piece.text}</em>
          case 'link': {
            if (!links) return piece.text
            const href = resolve(piece.target)
            return href ? (
              <Link key={i} className="wikilink" href={href}>{piece.text}</Link>
            ) : (
              <span key={i} className="wikilink-broken" title={`No term or requirement called ${piece.target}`}>{piece.text}</span>
            )
          }
        }
      })}
    </>
  )
}
