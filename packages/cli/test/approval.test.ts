import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkApprovals } from '../src/approval.ts'
import { baseTree, writeTree } from './fixtures.ts'

const agent = 'Co-Authored-By: Claude <noreply@anthropic.com>'

function repo() {
  const root = writeTree()
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'dev@example.com')
  git('config', 'user.name', 'Dev')
  git('add', '-A')
  git('commit', '-q', '-m', 'Initial specs')
  const commit = (path: string, from: string, to: string, message: string) => {
    const file = join(root, path)
    const text = execFileSync('cat', [file], { encoding: 'utf8' })
    if (!text.includes(from)) throw new Error(`${path} does not contain ${from}`)
    writeFileSync(file, text.replace(from, to))
    git('commit', '-q', '-am', message)
  }
  return { root, commit, base: git('rev-parse', 'HEAD').trim() }
}

describe('approval guard', () => {
  it('[CLI-006-T1] fails when a Claude co-authored commit approves a requirement', () => {
    const { root, commit, base } = repo()
    commit('loans/LOAN-002.yaml', 'status: proposed', 'status: approved', `Approve\n\n${agent}`)
    expect(checkApprovals(root, base)).toMatchObject([
      { severity: 'error', rule: 'approval', file: 'loans/LOAN-002.yaml', id: 'LOAN-002', message: expect.stringContaining('only a human approves') },
    ])
  })

  it('[CLI-006-T2] allows a human commit to approve', () => {
    const { root, commit, base } = repo()
    commit('loans/LOAN-002.yaml', 'status: proposed', 'status: approved', 'Approve LOAN-002')
    expect(checkApprovals(root, base)).toEqual([])
  })

  it('catches an approved test definition', () => {
    const { root, commit, base } = repo()
    commit('loans/LOAN-001.yaml', '    status: proposed', '    status: approved', `Approve test\n\n${agent}`)
    expect(checkApprovals(root, base)).toMatchObject([{ id: 'LOAN-001-T1' }])
  })

  it('[CLI-006-T3] fails when a Claude co-authored commit edits approved text but leaves it approved', () => {
    const { root, commit, base } = repo()
    commit('loans/LOAN-002.yaml', 'status: proposed', 'status: approved', 'Approve LOAN-002')
    commit('loans/LOAN-002.yaml', 'overdue loan', 'overdue or lost loan', `Widen\n\n${agent}`)
    expect(checkApprovals(root, base)).toMatchObject([{ id: 'LOAN-002', message: expect.stringContaining('without returning it to proposed') }])
  })

  it('allows a Claude co-authored commit that returns edited text to proposed', () => {
    const { root, commit, base } = repo()
    commit('loans/LOAN-002.yaml', 'status: proposed', 'status: approved', 'Approve LOAN-002')
    commit('loans/LOAN-002.yaml', 'status: approved\nstatement: If a [[members|member]] has an overdue loan', 'status: proposed\nstatement: If a [[members|member]] has an overdue or lost loan', `Widen\n\n${agent}`)
    expect(checkApprovals(root, base)).toEqual([])
  })

  it('checks a spec tree in a subfolder of the repo', () => {
    const root = writeTree(Object.fromEntries(Object.entries(baseTree).map(([p, t]) => [`specs/${p}`, t])))
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
    git('init', '-q', '-b', 'main')
    git('-c', 'user.email=d@e.com', '-c', 'user.name=D', 'add', '-A')
    git('-c', 'user.email=d@e.com', '-c', 'user.name=D', 'commit', '-q', '-m', 'init')
    const base = git('rev-parse', 'HEAD').trim()
    const file = join(root, 'specs/loans/LOAN-002.yaml')
    writeFileSync(file, baseTree['loans/LOAN-002.yaml'].replace('status: proposed', 'status: approved'))
    git('-c', 'user.email=d@e.com', '-c', 'user.name=D', 'commit', '-q', '-am', `Approve\n\n${agent}`)
    expect(checkApprovals(join(root, 'specs'), base)).toMatchObject([{ file: 'loans/LOAN-002.yaml', id: 'LOAN-002' }])
  })
})
