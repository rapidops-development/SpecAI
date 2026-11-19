export type Severity = 'error' | 'warning'

export interface Diagnostic {
  severity: Severity
  /** Which check produced it, such as `schema` or `links`. */
  rule: string
  /** Path relative to the spec tree root, with forward slashes. */
  file: string
  line?: number
  /** The requirement, test definition or term the problem is in. */
  id?: string
  /** The field, as a JSON pointer such as `/tests/0/then`. */
  field?: string
  message: string
}
