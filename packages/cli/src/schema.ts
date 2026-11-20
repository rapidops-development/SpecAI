import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js'
import { parse } from 'yaml'
import type { FileKind, SpecFile } from './tree.ts'

/** The versions of the standard the tools read, oldest first. */
export const supportedVersions = ['0.1', '0.2']
export const latestVersion = supportedVersions[supportedVersions.length - 1]

const schemaRoot = fileURLToPath(new URL('../../../schema/', import.meta.url))

const cached = new Map<string, Record<FileKind, ValidateFunction>>()

/** The schema checks for each kind of file, for one version of the standard. */
export function validators(version = latestVersion): Record<FileKind, ValidateFunction> {
  const hit = cached.get(version)
  if (hit) return hit
  if (!supportedVersions.includes(version)) throw new Error(`unsupported SpecAI version ${version}`)
  const ajv = new Ajv2020({ allErrors: true, strict: true, verbose: true })
  const dir = join(schemaRoot, `v${version}`)
  for (const file of readdirSync(dir)) ajv.addSchema(parse(readFileSync(join(dir, file), 'utf8')))
  const get = (kind: string) => ajv.getSchema(`urn:specai:v${version}:${kind}`)!
  const result = { specai: get('specai'), area: get('area'), requirement: get('requirement'), 'glossary-term': get('glossary-term') }
  cached.set(version, result)
  return result
}

/**
 * The version a spec tree is written for: the one its root specai.yaml declares, or the latest when
 * there is no root file. Undefined when the root declares a version the tools do not support.
 */
export function treeVersion(files: SpecFile[]): string | undefined {
  const root = files.find((f) => f.kind === 'specai')
  if (!root) return latestVersion
  const declared = (root.data as { specai?: unknown } | null)?.specai
  return typeof declared === 'string' && supportedVersions.includes(declared) ? declared : undefined
}

/** The version of the spec tree at root, read from its specai.yaml; the latest when it has none or it cannot be read. */
export function versionAt(root: string): string {
  try {
    const declared = (parse(readFileSync(join(root, 'specai.yaml'), 'utf8')) as { specai?: unknown } | null)?.specai
    return typeof declared === 'string' && supportedVersions.includes(declared) ? declared : latestVersion
  } catch {
    return latestVersion
  }
}

/** A readable message and the field it is about. */
export function describeError(error: ErrorObject): { field: string; message: string } {
  switch (error.keyword) {
    case 'additionalProperty':
    case 'additionalProperties': {
      const name = String(error.params.additionalProperty)
      return { field: `${error.instancePath}/${name}`, message: `unknown field "${name}"` }
    }
    case 'required':
      return { field: error.instancePath, message: `missing required field "${error.params.missingProperty}"` }
    case 'enum':
      return { field: error.instancePath, message: `must be one of ${(error.params.allowedValues as string[]).join(', ')}` }
    case 'const':
      return { field: error.instancePath, message: `must be "${error.params.allowedValue}" (quoted)` }
    case 'pattern':
      return { field: error.instancePath, message: `"${error.data}" does not match the expected format ${error.params.pattern}` }
    default:
      return { field: error.instancePath, message: error.message ?? error.keyword }
  }
}

/** The schema documents, by $id, for the UI to build its edit forms from. */
export function schemaDocuments(version = latestVersion): Record<string, unknown> {
  const dir = join(schemaRoot, `v${version}`)
  return Object.fromEntries(
    readdirSync(dir).map((file) => {
      const schema = parse(readFileSync(join(dir, file), 'utf8')) as { $id: string }
      return [schema.$id, schema]
    }),
  )
}
