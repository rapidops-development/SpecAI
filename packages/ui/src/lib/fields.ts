// Turns the JSON Schema into the fields an edit form shows, so forms follow the schema.

export type FieldKind =
  | 'text'
  | 'longText'
  | 'markdown'
  | 'textList'
  | 'requirementId'
  | 'requirementIds'
  | 'tags'
  | 'components'
  | 'names'
  | 'enum'
  | 'tests'

export interface Field {
  key: string
  label: string
  kind: FieldKind
  required: boolean
  description?: string
  options?: string[]
}

type Schema = {
  $ref?: string
  type?: string
  enum?: string[]
  items?: Schema
  description?: string
  properties?: Record<string, Schema>
  required?: string[]
  $defs?: Record<string, Schema>
}

export type SchemaKind = 'requirement' | 'test' | 'glossary-term'

const labels: Record<string, string> = {
  title: 'Title',
  statement: 'Statement',
  rationale: 'Reason',
  acceptance: 'Acceptance criteria',
  notes: 'Notes',
  tags: 'Tags',
  components: 'Components',
  parent: 'Refines',
  related: 'Related requirements',
  issues: 'Issues',
  tests: 'Tests',
  level: 'Level',
  given: 'Given',
  when: 'When',
  then: 'Then',
  term: 'Term',
  aliases: 'Other names',
  definition: 'Definition',
  avoid: 'Words to avoid',
}

// Fields with their own controls elsewhere: the version, the ID and the status buttons.
const hidden = new Set(['specai', 'id', 'status'])
// Single-line text fields that usually hold a sentence or more.
const long = new Set(['statement', 'when'])

const help: Record<string, string> = {
  statement: 'One testable sentence. Use an EARS pattern: When <trigger>, the <system> shall <response>.',
  rationale: 'Why this requirement exists. Markdown.',
  tags: 'Lowercase words joined by hyphens.',
  parent: 'The requirement this one refines.',
  issues: 'Issues tracking work still to do, as owner/repo#number or a link. Remove one once it is closed.',
  aliases: 'Links may use any of these names.',
  avoid: 'The validator warns when these words appear in requirements or tests.',
}

export function formFields(schemas: Record<string, Schema>, kind: SchemaKind): Field[] {
  // The served schemas are the spec tree's version, so look them up by kind whatever the version.
  const byKind = (name: string) => Object.entries(schemas).find(([id]) => id.endsWith(`:${name}`))![1]
  const root = kind === 'test' ? byKind('requirement').$defs!.test : byKind(kind)
  const required = new Set(root.required ?? [])
  return Object.entries(root.properties ?? {})
    .filter(([key]) => !hidden.has(key))
    .map(([key, schema]): Field => ({
      key,
      label: labels[key] ?? key,
      kind: fieldKind(key, schema),
      required: required.has(key),
      description: help[key] ?? schema.description,
      options: schema.enum,
    }))
}

function fieldKind(key: string, schema: Schema): FieldKind {
  const ref = (s?: Schema) => s?.$ref?.split('/').pop()
  if (schema.enum) return 'enum'
  if (key === 'components') return 'components'
  switch (ref(schema)) {
    case 'text':
      return long.has(key) ? 'longText' : 'text'
    case 'markdown':
      return 'markdown'
    case 'textList':
      return 'textList'
    case 'requirementId':
      return 'requirementId'
    case 'test':
      return 'tests'
  }
  if (schema.type === 'array') {
    switch (ref(schema.items)) {
      case 'requirementId':
        return 'requirementIds'
      case 'slug':
        return 'tags'
      case 'test':
        return 'tests'
      default:
        return 'names'
    }
  }
  return 'text'
}

/** Drops empty optional values, so clearing a field removes it from the file. */
export function cleanData<T extends object>(data: T): T {
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const items = value.map(clean).filter((v) => v !== undefined)
      return items.length > 0 ? items : undefined
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value).map(([k, v]) => [k, clean(v)] as const).filter(([, v]) => v !== undefined)
      return Object.fromEntries(entries)
    }
    if (typeof value === 'string' && value.trim() === '') return undefined
    return value
  }
  return clean(data) as T
}

/** Gives test definitions without an ID the next unused `<requirement ID>-Tn`. */
export function assignTestIds<T extends { id?: string }>(requirementId: string, tests: T[]): T[] {
  const pattern = new RegExp(`^${requirementId}-T(\\d+)$`)
  let next = Math.max(0, ...tests.map((t) => Number(pattern.exec(t.id ?? '')?.[1] ?? 0))) + 1
  return tests.map((t) => (t.id ? t : { ...t, id: `${requirementId}-T${next++}` }))
}
