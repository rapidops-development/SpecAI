import { createContext, useContext, useMemo } from 'react'
import { resolveLink } from '../lib/text.ts'
import type { SpecIndex } from '../types.ts'

interface SpecContextValue {
  index: SpecIndex
  resolve: (target: string) => string | undefined
}

const SpecContext = createContext<SpecContextValue | null>(null)

export function SpecProvider({ index, children }: { index: SpecIndex; children: React.ReactNode }) {
  const value = useMemo(() => {
    const ids = new Set(index.requirements.map((r) => r.id))
    return { index, resolve: (target: string) => resolveLink(target, index.termIndex, ids) }
  }, [index])
  return <SpecContext value={value}>{children}</SpecContext>
}

export function useSpec(): SpecContextValue {
  const value = useContext(SpecContext)
  if (!value) throw new Error('useSpec outside SpecProvider')
  return value
}
