#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { checkApprovals } from './approval.ts'
import { createSpecServer } from './serve.ts'
import { buildIndex } from './spec-index.ts'
import { defaultCheckouts } from './trace.ts'
import { formatText, formatTrace } from './report.ts'
import { loadSpecTree } from './tree.ts'
import { validateTree } from './validate.ts'

const usage = `Usage: specai <command> [options]

Commands:
  validate [dir]   Check a spec tree (default: current folder)
    --since <rev>  Also check commits in <rev>..HEAD against the approval guard
    --strict       Fail on warnings as well as errors
    --json         Print diagnostics as JSON
  trace [dir]      Report which test definitions have linked test code
    --checkouts <dir>  Folder holding the component checkouts (default: the folder
                       holding the spec tree's git repo)
    --strict       Also fail unless every approved requirement is covered
    --json         Print the result as JSON
                   Fails on errors: unknown IDs, a test definition named by
                   more than one test, or a test naming more than one
  serve [dir]      Browse a spec tree in the web UI (default: current folder)
    --port <n>     Port to listen on (default: 4321)
    --checkouts <dir>  As for trace, to show coverage
`

export function run(argv: string[]): number {
  const [command, ...rest] = argv
  if (command === 'validate') return validate(rest)
  if (command === 'serve') return serve(rest)
  if (command === 'trace') return traceCommand(rest)
  process.stdout.write(usage)
  return command === undefined || command === '--help' || command === '-h' ? 0 : 2
}

function validate(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { since: { type: 'string' }, strict: { type: 'boolean' }, json: { type: 'boolean' } },
  })
  const dir = positionals[0] ?? '.'
  const root = resolve(dir)
  if (!existsSync(root)) {
    process.stderr.write(`specai: ${dir} does not exist\n`)
    return 2
  }
  const tree = loadSpecTree(root)
  const diagnostics = validateTree(tree)
  if (values.since) diagnostics.push(...checkApprovals(root, values.since))
  process.stdout.write(
    values.json ? `${JSON.stringify(diagnostics, null, 2)}\n` : `${formatText(diagnostics, dir.replace(/\/$/, ''), tree.files.length)}\n`,
  )
  const failing = diagnostics.filter((d) => d.severity === 'error' || values.strict)
  return failing.length > 0 ? 1 : 0
}

function serve(argv: string[]): number {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { port: { type: 'string' }, checkouts: { type: 'string' } } })
  const dir = positionals[0] ?? '.'
  const root = resolve(dir)
  if (!existsSync(root)) {
    process.stderr.write(`specai: ${dir} does not exist\n`)
    return 2
  }
  const port = Number(values.port ?? 4321)
  const server = createSpecServer({ root, checkouts: resolve(values.checkouts ?? defaultCheckouts(root)) })
  server.on('error', (error) => {
    process.stderr.write(`specai: ${error.message}\n`)
    process.exit(1)
  })
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Serving ${dir} at http://localhost:${port}\n`))
  return 0
}

function traceCommand(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { checkouts: { type: 'string' }, strict: { type: 'boolean' }, json: { type: 'boolean' } },
  })
  const dir = positionals[0] ?? '.'
  const root = resolve(dir)
  if (!existsSync(root)) {
    process.stderr.write(`specai: ${dir} does not exist\n`)
    return 2
  }
  const index = buildIndex(root, { checkouts: resolve(values.checkouts ?? defaultCheckouts(root)) })
  if (!index.trace) {
    process.stderr.write(`specai: ${dir} has no valid specai.yaml; run specai validate\n`)
    return 2
  }
  const result = index.trace
  const approved = index.requirements.filter((r) => r.status === 'approved')
  const uncovered = approved.filter((r) => result.coverage[r.id] !== 'covered')
  if (values.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    process.stdout.write(`${formatTrace(index.requirements, result)}\n`)
  }
  const errors = result.unknown.length + Object.keys(result.duplicates).length + result.multiple.length
  return errors > 0 || (values.strict && uncovered.length > 0) ? 1 : 0
}

if (import.meta.main) process.exitCode = run(process.argv.slice(2))
