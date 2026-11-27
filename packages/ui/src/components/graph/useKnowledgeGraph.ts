import { useEffect, useState } from 'react'
import { type KnowledgeGraph, knowledgeGraph } from '../../lib/graph.ts'
import type { SpecIndex } from '../../types.ts'

/**
 * The knowledge graph for the index, laid out after the page has drawn so it never holds the page
 * up. While a new index is laid out, the previous graph stays on screen.
 */
export function useKnowledgeGraph(index: SpecIndex): KnowledgeGraph | undefined {
  const [kg, setKg] = useState<KnowledgeGraph>()
  useEffect(() => {
    const timer = setTimeout(() => setKg(knowledgeGraph(index)))
    return () => clearTimeout(timer)
  }, [index])
  return kg
}
