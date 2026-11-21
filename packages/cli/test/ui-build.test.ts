import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { uiBuildIsStale } from '../src/serve.ts'

/** A UI package folder with a build and, unless left out, a source file, each touched at the given time. */
function uiPackage({ builtAt, sourceAt }: { builtAt: number; sourceAt?: number }) {
  const ui = mkdtempSync(join(tmpdir(), 'specai-ui-'))
  mkdirSync(join(ui, 'dist'))
  writeFileSync(join(ui, 'dist', 'index.html'), '<!doctype html>')
  utimesSync(join(ui, 'dist', 'index.html'), builtAt, builtAt)
  if (sourceAt !== undefined) {
    mkdirSync(join(ui, 'src', 'pages'), { recursive: true })
    writeFileSync(join(ui, 'src', 'pages', 'Page.tsx'), 'export {}')
    for (const path of ['src/pages/Page.tsx', 'src/pages', 'src']) utimesSync(join(ui, path), sourceAt, sourceAt)
  }
  return join(ui, 'dist')
}

describe('UI build freshness', () => {
  it('[CLI-023-T1] reports a build older than a source file', () => {
    expect(uiBuildIsStale(uiPackage({ builtAt: 1000, sourceAt: 2000 }))).toBe(true)
  })

  it('[CLI-023-T2] reports neither an up-to-date build nor one with no source', () => {
    expect(uiBuildIsStale(uiPackage({ builtAt: 2000, sourceAt: 1000 }))).toBe(false)
    expect(uiBuildIsStale(uiPackage({ builtAt: 1000 }))).toBe(false)
  })
})
