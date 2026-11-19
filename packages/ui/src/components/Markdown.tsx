import { useMemo } from 'react'
import { renderMarkdown } from '../lib/markdown.ts'
import { onInternalClick } from '../router.tsx'
import { useSpec } from './SpecContext.tsx'

export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const { resolve } = useSpec()
  const html = useMemo(() => renderMarkdown(source, resolve), [source, resolve])
  return <div className={`prose-spec ${className}`} onClick={onInternalClick} dangerouslySetInnerHTML={{ __html: html }} />
}
