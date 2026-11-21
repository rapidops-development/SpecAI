#!/usr/bin/env node
// Sets up a clone for use: checks Node, installs dependencies, builds the UI and links the `specai`
// command. Run it again after pulling. Plain JavaScript, so it can explain an old Node itself.
//
//   npm run setup               everything
//   npm run setup -- --no-link  without the global `specai` command

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const wanted = Number(readFileSync(join(repo, '.nvmrc'), 'utf8').trim())
const link = !process.argv.includes('--no-link')

const major = Number(process.versions.node.split('.')[0])
if (major < wanted) {
  console.error(`SpecAI needs Node ${wanted} or later; this is Node ${process.versions.node}.`)
  console.error(`Install Node ${wanted} from https://nodejs.org, or with nvm run \`nvm install\` in ${repo}, then run setup again.`)
  process.exit(1)
}

function run(title, args) {
  console.log(`\n> ${title}: npm ${args.join(' ')}`)
  // npm is a script on Windows, which only a shell can start.
  const result = spawnSync('npm', args, { cwd: repo, stdio: 'inherit', shell: process.platform === 'win32' })
  return result.status === 0
}

if (!run('Installing dependencies', ['ci'])) process.exit(1)
if (!run('Building the UI', ['run', 'build'])) process.exit(1)
const linked = link && run('Linking the specai command', ['link', '-w', 'packages/cli'])

const specai = linked ? 'specai' : `node ${join(repo, 'packages', 'cli', 'src', 'main.ts')}`
console.log('\nSpecAI is set up.')
if (link && !linked) {
  console.log('Linking the global `specai` command failed, often for want of permission to write npm\'s global folder.')
  console.log('Use the full command below, or fix npm\'s prefix (https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally) and run setup again.')
}
console.log(`
Browse a spec tree:   ${specai} serve path/to/specs    then open http://localhost:4321
Check it:             ${specai} validate path/to/specs
Try the example:      ${specai} serve ${join(repo, 'examples', 'library')}

Run \`npm run setup\` again after pulling, to pick up new dependencies and UI changes.`)
