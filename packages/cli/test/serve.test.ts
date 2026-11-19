import { mkdirSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSpecServer } from '../src/serve.ts'
import type { SpecIndex } from '../src/spec-index.ts'
import { baseTree, edit, writeTree } from './fixtures.ts'

const servers: ReturnType<typeof createSpecServer>[] = []
afterEach(() => {
  for (const s of servers.splice(0)) s.close()
})

async function start(root: string, uiDir = join(root, 'no-ui')) {
  const server = createSpecServer({ root, uiDir, debounceMs: 20 })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

describe('specai serve', () => {
  it('[CLI-009-T1] serves the spec index', async () => {
    const url = await start(writeTree(edit('specai.yaml', 'specai: "0.1"', 'specai: "0.1"\nname: Library')))
    const index = (await (await fetch(`${url}/api/index`)).json()) as SpecIndex
    expect(index.name).toBe('Library')
    expect(index.requirements.map((r) => r.id)).toEqual(['LOAN-001', 'LOAN-002'])
    expect(index.areas).toMatchObject([{ folder: 'loans', prefix: 'LOAN', requirementIds: ['LOAN-001', 'LOAN-002'] }])
    expect(index.terms).toMatchObject([{ slug: 'member', term: 'Member' }])
    expect(index.diagnostics).toEqual([])
  })

  it('works out backlinks from links and related fields', async () => {
    const url = await start(writeTree())
    const index = (await (await fetch(`${url}/api/index`)).json()) as SpecIndex
    expect(index.backlinks['term:member']).toEqual(['LOAN-001', 'LOAN-002'])
    expect(index.backlinks['LOAN-001']).toEqual(['LOAN-002'])
    expect(index.termIndex).toEqual({ member: 'member', members: 'member' })
  })

  it('leaves out files that fail the schema and reports them', async () => {
    const url = await start(writeTree(edit('loans/LOAN-002.yaml', 'status: proposed', 'status: done')))
    const index = (await (await fetch(`${url}/api/index`)).json()) as SpecIndex
    expect(index.requirements.map((r) => r.id)).toEqual(['LOAN-001'])
    expect(index.diagnostics).toMatchObject([{ rule: 'schema', file: 'loans/LOAN-002.yaml' }])
  })

  it('[CLI-009-T2] sends a change event when a spec file changes', async () => {
    const root = writeTree()
    const url = await start(root)
    const res = await fetch(`${url}/api/events`)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    await reader.read()
    writeFileSync(join(root, 'loans/LOAN-002.yaml'), baseTree['loans/LOAN-002.yaml'].replace('Overdue', 'Late'))
    let text = ''
    while (!text.includes('event: change')) text += decoder.decode((await reader.read()).value)
    await reader.cancel()
    expect(text).toContain('event: change')
  })

  it('serves the single-page app for page routes and never serves files outside it', async () => {
    const root = writeTree()
    const ui = join(root, 'ui')
    mkdirSync(join(ui, 'assets'), { recursive: true })
    writeFileSync(join(ui, 'index.html'), '<html>app</html>')
    writeFileSync(join(ui, 'assets', 'app.js'), 'console.log(1)')
    const url = await start(root, ui)
    expect(await (await fetch(`${url}/r/LOAN-001`)).text()).toBe('<html>app</html>')
    const asset = await fetch(`${url}/assets/app.js`)
    expect(asset.headers.get('content-type')).toContain('javascript')
    // A raw path, since fetch would normalise the dots away before sending.
    const escaped = await new Promise<string>((resolve) =>
      get(`${url}/..%2f..%2fspecai.yaml`, (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => resolve(body))
      }),
    )
    expect(escaped).toBe('<html>app</html>')
  })

  it('explains when the UI is not built', async () => {
    const url = await start(writeTree())
    const res = await fetch(`${url}/`)
    expect(res.status).toBe(500)
    expect(await res.text()).toContain('npm run build')
  })

  describe('writes', () => {
    const put = (url: string, body: unknown, headers: Record<string, string> = { 'x-specai': '1' }) =>
      fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

    it('[UI-012-T1] refuses writes without the X-SpecAI header', async () => {
      const root = writeTree()
      const url = await start(root)
      const index = (await (await fetch(`${url}/api/index`)).json()) as SpecIndex
      const req = index.requirements[0]
      const res = await put(`${url}/api/requirements/LOAN-001`, { data: { ...req, title: 'Hijacked' }, hash: req.hash }, {})
      expect(res.status).toBe(403)
    })

    it('[UI-012-T2] refuses requests for any host but localhost', async () => {
      const url = await start(writeTree())
      const status = await new Promise<number>((resolve) =>
        get(`${url}/api/index`, { headers: { host: 'evil.example:80' } }, (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        }),
      )
      expect(status).toBe(403)
    })

    it('saves a requirement and reports the new hash', async () => {
      const root = writeTree()
      const url = await start(root)
      const index = (await (await fetch(`${url}/api/index`)).json()) as SpecIndex
      const { area: _a, file: _f, hash, ...data } = index.requirements[0]
      const res = await put(`${url}/api/requirements/LOAN-001`, { data: { ...data, title: 'Five-loan limit' }, hash })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { hash: string }
      expect(body.hash).not.toBe(hash)
      const again = await put(`${url}/api/requirements/LOAN-001`, { data: { ...data, title: 'Stale' }, hash })
      expect(again.status).toBe(409)
    })

    it('answers a refused edit with its problems', async () => {
      const root = writeTree()
      const url = await start(root)
      const file = (await (await fetch(`${url}/api/file?path=loans/LOAN-001.yaml`)).json()) as { text: string; hash: string }
      const res = await put(`${url}/api/file?path=loans/LOAN-001.yaml`, { text: file.text.replace('status: proposed', 'status: done'), hash: file.hash })
      expect(res.status).toBe(422)
      expect(await res.json()).toMatchObject({ diagnostics: [{ rule: 'schema', field: '/status' }] })
    })
  })
})

