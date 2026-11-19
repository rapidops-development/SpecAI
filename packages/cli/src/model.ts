// The shapes of spec files that passed the schema.

export interface RootConfig {
  specai: string
  name?: string
  areas: string[]
  components?: { name: string; path?: string; description?: string }[]
}

export interface Area {
  specai: string
  prefix: string
  name: string
  description?: string
  overview?: string
}

export interface TestDefinition {
  id: string
  title: string
  status: Status
  level: 'unit' | 'integration' | 'e2e' | 'manual'
  given?: string[]
  when: string
  then: string[]
  notes?: string
}

export interface Requirement {
  specai: string
  id: string
  title: string
  status: Status
  statement: string
  rationale?: string
  acceptance?: string[]
  notes?: string
  tags?: string[]
  components?: string[]
  parent?: string
  related?: string[]
  tests?: TestDefinition[]
}

export interface GlossaryTerm {
  specai: string
  term: string
  aliases?: string[]
  definition: string
  avoid?: string[]
}

export type Status = 'draft' | 'proposed' | 'approved' | 'deprecated' | 'removed'

export const requirementIdPattern = /^[A-Z][A-Z0-9]{1,7}-[0-9]{3,}$/

/** Text fields of a requirement, excluding its tests, as [JSON pointer, text] pairs. */
export function requirementText(req: Requirement): [string, string][] {
  return [
    ['/title', req.title],
    ['/statement', req.statement],
    ...optional('/rationale', req.rationale),
    ...(req.acceptance ?? []).map((t, i): [string, string] => [`/acceptance/${i}`, t]),
    ...optional('/notes', req.notes),
  ]
}

/** Text fields of a test definition, as [JSON pointer relative to the test, text] pairs. */
export function testText(test: TestDefinition): [string, string][] {
  return [
    ['/title', test.title],
    ...(test.given ?? []).map((t, i): [string, string] => [`/given/${i}`, t]),
    ['/when', test.when],
    ...(test.then ?? []).map((t, i): [string, string] => [`/then/${i}`, t]),
    ...optional('/notes', test.notes),
  ]
}

function optional(pointer: string, text: string | undefined): [string, string][] {
  return text === undefined ? [] : [[pointer, text]]
}
