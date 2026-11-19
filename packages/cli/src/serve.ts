import { existsSync, readFileSync, statSync, watch } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequirement, createTerm, EditError, readSpecFile, saveRawFile, saveRequirement, saveTerm } from './edit.ts'
import { schemaDocuments } from './schema.ts'
import { buildIndex, TraceCache } from './spec-index.ts'

export const defaultUiDir = fileURLToPath(new URL('../../ui/dist/', import.meta.url))

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

export interface ServeOptions {
  root: string
  uiDir?: string
  /** How long to wait for file changes to settle before telling pages. */
  debounceMs?: number
  /** Where component checkouts are, to show coverage. Leave out to show none. */
  checkouts?: string
}

// Serves the UI, GET /api/index (the spec index) and GET /api/events (a server-sent event on every
// change under root). Bind it to localhost only: the API exposes the files on disk.
export function createSpecServer({ root, uiDir = defaultUiDir, debounceMs = 100, checkouts }: ServeOptions): Server {
  const traceCache = new TraceCache()
  const clients = new Set<ServerResponse>()
  let timer: NodeJS.Timeout | undefined
  const watcher = watch(root, { recursive: true }, (_event, name) => {
    if (name && !String(name).endsWith('.yaml')) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      for (const client of clients) client.write('event: change\ndata: {}\n\n')
    }, debounceMs)
  })

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!isLocalHost(req.headers.host)) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('specai serve only answers requests for localhost\n')
    } else if (url.pathname.startsWith('/api/') && req.method !== 'GET') {
      void handleWrite(root, req, url).then(
        (body) => sendJson(res, 200, body),
        (error: unknown) =>
          error instanceof EditError
            ? sendJson(res, error.status, { error: error.message, diagnostics: error.diagnostics, current: error.current })
            : sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) }),
      )
    } else if (req.method !== 'GET') {
      res.writeHead(405).end()
    } else if (url.pathname === '/api/file') {
      try {
        sendJson(res, 200, readSpecFile(root, url.searchParams.get('path') ?? ''))
      } catch (error) {
        if (!(error instanceof EditError)) throw error
        sendJson(res, error.status, { error: error.message })
      }
    } else if (url.pathname === '/api/schema') {
      sendJson(res, 200, schemaDocuments())
    } else if (url.pathname === '/api/index') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(buildIndex(root, { checkouts, traceCache })))
    } else if (url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
      res.write(': connected\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
    } else {
      serveStatic(uiDir, url.pathname, res)
    }
  })
  server.on('close', () => {
    watcher.close()
    clearTimeout(timer)
    for (const client of clients) client.end()
  })
  return server
}

// Writes need the X-SpecAI header, which a page on another site cannot send without a CORS
// preflight this server never approves. With the Host check, that keeps other sites from editing files.
async function handleWrite(root: string, req: IncomingMessage, url: URL): Promise<unknown> {
  if (req.headers['x-specai'] !== '1') throw new EditError(403, 'writes need the X-SpecAI: 1 header')
  const body = (await readJson(req)) as Record<string, any>
  const [, , collection, key] = url.pathname.split('/').map(decodeURIComponent)
  if (req.method === 'PUT' && collection === 'file') return saveRawFile(root, url.searchParams.get('path') ?? '', String(body.text), String(body.hash))
  if (req.method === 'PUT' && collection === 'requirements' && key) return saveRequirement(root, key, body.data, String(body.hash))
  if (req.method === 'POST' && collection === 'requirements' && !key) return createRequirement(root, String(body.area), body.data)
  if (req.method === 'PUT' && collection === 'terms' && key) return saveTerm(root, key, body.data, String(body.hash))
  if (req.method === 'POST' && collection === 'terms' && !key) return createTerm(root, body.data)
  throw new EditError(404, `no ${req.method} ${url.pathname}`)
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let text = ''
  for await (const chunk of req) {
    text += chunk
    if (text.length > 1_000_000) throw new EditError(413, 'the request is too large')
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new EditError(400, 'the request body is not JSON')
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function isLocalHost(host: string | undefined): boolean {
  const name = (host ?? '').replace(/:\d+$/, '')
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]'
}

function serveStatic(uiDir: string, pathname: string, res: ServerResponse) {
  const base = resolve(uiDir)
  let path = resolve(base, `.${normalize(decodeURIComponent(pathname))}`)
  if (path !== base && !path.startsWith(base + sep)) {
    res.writeHead(403).end()
    return
  }
  // Every page route is the single-page app.
  if (!existsSync(path) || statSync(path).isDirectory()) path = join(base, 'index.html')
  if (!existsSync(path)) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end('The UI is not built. Run: npm run build\n')
    return
  }
  const immutable = path.includes(`${sep}assets${sep}`)
  res.writeHead(200, {
    'content-type': types[extname(path)] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  res.end(readFileSync(path))
}
