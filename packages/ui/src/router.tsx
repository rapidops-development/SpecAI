import { type AnchorHTMLAttributes, type MouseEvent, useEffect, useState } from 'react'

export type Route =
  | { page: 'list' }
  | { page: 'requirement'; id: string }
  | { page: 'edit-requirement'; id: string }
  | { page: 'new-requirement'; folder: string }
  | { page: 'edit-term'; slug: string }
  | { page: 'new-term' }
  | { page: 'file'; path: string }
  | { page: 'term'; slug: string }
  | { page: 'area'; folder: string }
  | { page: 'glossary' }
  | { page: 'problems' }
  | { page: 'not-found' }

export function parseRoute(pathname: string, search = ''): Route {
  const [, first, second, third] = pathname.split('/').map(decodeURIComponent)
  if (!first) return { page: 'list' }
  if (third === 'edit' && first === 'r' && second) return { page: 'edit-requirement', id: second }
  if (third === 'new' && first === 'a' && second) return { page: 'new-requirement', folder: second }
  if (third === 'edit' && first === 'g' && second) return { page: 'edit-term', slug: second }
  if (third !== undefined) return { page: 'not-found' }
  if (first === 'glossary' && second === 'new') return { page: 'new-term' }
  if (first === 'file' && !second) {
    const path = new URLSearchParams(search).get('path')
    return path ? { page: 'file', path } : { page: 'not-found' }
  }
  if (first === 'r' && second) return { page: 'requirement', id: second }
  if (first === 'g' && second) return { page: 'term', slug: second }
  if (first === 'a' && second) return { page: 'area', folder: second }
  if (first === 'glossary' && !second) return { page: 'glossary' }
  if (first === 'problems' && !second) return { page: 'problems' }
  return { page: 'not-found' }
}

export const paths = {
  requirement: (id: string) => `/r/${encodeURIComponent(id)}`,
  term: (slug: string) => `/g/${encodeURIComponent(slug)}`,
  area: (folder: string) => `/a/${encodeURIComponent(folder)}`,
  editRequirement: (id: string) => `/r/${encodeURIComponent(id)}/edit`,
  newRequirement: (folder: string) => `/a/${encodeURIComponent(folder)}/new`,
  editTerm: (slug: string) => `/g/${encodeURIComponent(slug)}/edit`,
  file: (path: string) => `/file?path=${encodeURIComponent(path)}`,
}

const listeners = new Set<() => void>()

export function navigate(to: string, { replace = false } = {}) {
  if (to === location.pathname + location.search + location.hash) return
  history[replace ? 'replaceState' : 'pushState'](null, '', to)
  for (const listener of listeners) listener()
  // A link to a #section leaves scrolling to the page, which knows when that section has rendered.
  if (!replace && !to.includes('#')) window.scrollTo(0, 0)
}

export function useLocation(): { pathname: string; search: string } {
  const [, setTick] = useState(0)
  useEffect(() => {
    const update = () => setTick((t) => t + 1)
    listeners.add(update)
    window.addEventListener('popstate', update)
    return () => {
      listeners.delete(update)
      window.removeEventListener('popstate', update)
    }
  }, [])
  return { pathname: location.pathname, search: location.search }
}

/** Follows internal links without reloading. Lets modified clicks open new tabs. */
export function onInternalClick(event: MouseEvent<HTMLElement>) {
  const anchor = (event.target as HTMLElement).closest('a')
  if (!anchor || anchor.target || anchor.origin !== location.origin) return
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(anchor.pathname + anchor.search + anchor.hash)
}

export function Link(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} onClick={onInternalClick} />
}
