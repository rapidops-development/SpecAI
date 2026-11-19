import { useEffect, useState } from 'react'
import type { SpecIndex } from './types.ts'

export type Connection = 'connecting' | 'live' | 'reconnecting'

/** The spec index, reloaded whenever the server reports a file change. */
export function useSpecIndex(): { index?: SpecIndex; error?: string; connection: Connection } {
  const [index, setIndex] = useState<SpecIndex>()
  const [error, setError] = useState<string>()
  const [connection, setConnection] = useState<Connection>('connecting')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/index')
        if (!res.ok) throw new Error(`The server answered ${res.status}`)
        const next = (await res.json()) as SpecIndex
        if (!cancelled) {
          setIndex(next)
          setError(undefined)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void load()
    const events = new EventSource('/api/events')
    events.onopen = () => {
      setConnection('live')
      void load()
    }
    events.onerror = () => setConnection('reconnecting')
    events.addEventListener('change', () => void load())
    return () => {
      cancelled = true
      events.close()
    }
  }, [])

  return { index, error, connection }
}

export interface SaveResponse {
  file: string
  hash: string
  notices: string[]
  diagnostics: import('./types.ts').Diagnostic[]
  id?: string
  slug?: string
}

export interface SaveFailure {
  status: number
  error: string
  diagnostics: import('./types.ts').Diagnostic[]
  current?: { text: string; hash: string }
}

/** Sends a write to the server. Resolves with the saved file, or rejects with a SaveFailure. */
export async function save(method: 'PUT' | 'POST', url: string, body: unknown): Promise<SaveResponse> {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-specai': '1' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({ error: `The server answered ${res.status}` }))
  if (!res.ok) throw { status: res.status, diagnostics: [], ...json } as SaveFailure
  return json as SaveResponse
}

export function isSaveFailure(error: unknown): error is SaveFailure {
  return typeof error === 'object' && error !== null && 'status' in error && 'error' in error
}

let schemas: Promise<Record<string, never>> | undefined

/** The schema documents, fetched once. */
export function loadSchemas(): Promise<Record<string, never>> {
  schemas ??= fetch('/api/schema').then((r) => r.json())
  return schemas
}
