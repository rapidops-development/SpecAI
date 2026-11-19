import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { parse } from 'yaml'
import type { Diagnostic } from './diagnostic.ts'
import { type Requirement, requirementText, type Status, testText } from './model.ts'
import { classify } from './tree.ts'

const agentTrailer = /^co-authored-by:\s*claude\b/im

interface Item {
  status: Status
  text: string
}

// Checks every non-merge commit in since..HEAD that carries a Claude co-author trailer: it must
// not set any status to approved, and must not change an approved item's text and leave it approved.
export function checkApprovals(specRoot: string, since: string): Diagnostic[] {
  // stderr is captured, not shown: reading a file from before a commit that added it fails on purpose.
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', specRoot, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  const top = git('rev-parse', '--show-toplevel').trim()
  const prefix = relative(realpathSync(top), realpathSync(specRoot)).split(sep).filter(Boolean).join('/')
  const commits = git('rev-list', '--no-merges', '--reverse', `${since}..HEAD`).split('\n').filter(Boolean)
  const out: Diagnostic[] = []
  for (const commit of commits) {
    if (!agentTrailer.test(git('log', '-1', '--format=%B', commit))) continue
    const changed = git('diff-tree', '--root', '--no-commit-id', '-r', '--name-only', commit).split('\n').filter(Boolean)
    for (const repoPath of changed) {
      const path = prefix ? (repoPath.startsWith(`${prefix}/`) ? repoPath.slice(prefix.length + 1) : undefined) : repoPath
      if (!path || classify(path) !== 'requirement') continue
      const read = (rev: string) => {
        try {
          return items(parse(git('show', `${rev}:${repoPath}`)))
        } catch {
          return new Map<string, Item>()
        }
      }
      const before = read(`${commit}^`)
      const after = read(commit)
      const short = commit.slice(0, 7)
      for (const [id, item] of after) {
        const previous = before.get(id)
        if (item.status !== 'approved') continue
        const message =
          previous?.status !== 'approved'
            ? `commit ${short} is co-authored by Claude and approves ${id}; only a human approves`
            : previous.text !== item.text
              ? `commit ${short} is co-authored by Claude and changes approved ${id} without returning it to proposed`
              : undefined
        if (message) out.push({ severity: 'error', rule: 'approval', file: path, id, message })
      }
    }
  }
  return out
}

/** Every requirement and test definition in a parsed requirement file, by ID. */
function items(data: unknown): Map<string, Item> {
  const map = new Map<string, Item>()
  const req = data as Requirement | undefined
  if (!req || typeof req.id !== 'string') return map
  map.set(req.id, { status: req.status, text: JSON.stringify(requirementText(req)) })
  for (const test of req.tests ?? []) {
    if (test && typeof test.id === 'string') map.set(test.id, { status: test.status, text: JSON.stringify(testText(test)) })
  }
  return map
}
