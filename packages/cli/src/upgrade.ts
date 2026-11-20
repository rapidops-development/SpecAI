// SpecAI: CLI-016
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { latestVersion, supportedVersions } from './schema.ts'
import { loadSpecTree } from './tree.ts'

export interface UpgradeResult {
  /** The version specai.yaml declared before the upgrade. */
  from: string
  to: string
  /** Files rewritten, relative to the spec tree root. */
  changed: string[]
}

export class UpgradeError extends Error {}

// The top-level version line, keeping any comment after it.
const versionLine = /^specai:[ \t]*(?:"[^"\n]*"|'[^'\n]*'|[^\s#]+)([ \t]+#.*)?$/m

/**
 * Rewrites every file in a spec tree to the latest version of the standard, editing only the
 * version line so comments and layout stay as they were. Each version so far only added optional
 * fields, so a file valid in an older version is valid in the latest once its version changes.
 */
export function upgradeTree(root: string): UpgradeResult {
  const tree = loadSpecTree(root)
  const config = tree.files.find((f) => f.kind === 'specai')
  if (!config) throw new UpgradeError('no specai.yaml at the root of the spec tree')
  const from = (config.data as { specai?: unknown } | null)?.specai
  if (typeof from !== 'string' || !supportedVersions.includes(from)) {
    throw new UpgradeError(`specai.yaml declares version ${JSON.stringify(from ?? null)}, which this tool cannot upgrade`)
  }
  const changed: string[] = []
  for (const file of tree.files) {
    const declared = (file.data as { specai?: unknown } | null)?.specai
    if (declared === latestVersion || typeof declared !== 'string' || !supportedVersions.includes(declared)) continue
    const text = file.text.replace(versionLine, (_line, comment = '') => `specai: "${latestVersion}"${comment}`)
    if (text === file.text) continue
    writeFileSync(join(root, file.path), text)
    changed.push(file.path)
  }
  return { from, to: latestVersion, changed }
}
