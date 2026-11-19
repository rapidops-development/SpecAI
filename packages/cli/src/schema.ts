import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js'
import { parse } from 'yaml'
import type { FileKind } from './tree.ts'

export const supportedVersions = ['0.1']

const schemaRoot = fileURLToPath(new URL('../../../schema/', import.meta.url))

let cached: Record<FileKind, ValidateFunction> | undefined

export function validators(): Record<FileKind, ValidateFunction> {
  if (cached) return cached
  const ajv = new Ajv2020({ allErrors: true, strict: true, verbose: true })
  const dir = join(schemaRoot, 'v0.1')
  for (const file of readdirSync(dir)) ajv.addSchema(parse(readFileSync(join(dir, file), 'utf8')))
  const get = (kind: string) => ajv.getSchema(`urn:specai:v0.1:${kind}`)!
  cached = { specai: get('specai'), area: get('area'), requirement: get('requirement'), 'glossary-term': get('glossary-term') }
  return cached
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
export function schemaDocuments(): Record<string, unknown> {
  const dir = join(schemaRoot, 'v0.1')
  return Object.fromEntries(
    readdirSync(dir).map((file) => {
      const schema = parse(readFileSync(join(dir, file), 'utf8')) as { $id: string }
      return [schema.$id, schema]
    }),
  )
}
