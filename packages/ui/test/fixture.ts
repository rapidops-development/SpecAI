import { buildIndex } from '../../cli/src/spec-index.ts'
import { writeTree } from '../../cli/test/fixtures.ts'

/** A spec index with three requirements across two areas, for UI logic tests. */
export function sampleIndex() {
  return buildIndex(
    writeTree({
      'specai.yaml': 'specai: "0.1"\nareas: [loans, catalogue]\ncomponents:\n  - name: Library.API\n  - name: Library.Web\n',
      'catalogue/area.yaml': 'specai: "0.1"\nprefix: CAT\nname: Catalogue\n',
      'catalogue/CAT-001.yaml': `specai: "0.1"
id: CAT-001
title: Search the catalogue
status: approved
statement: When a visitor searches, the website shall list matching titles.
tags: [search]
components: [Library.Web]
tests:
  - id: CAT-001-T1
    title: Case-insensitive match
    status: proposed
    level: e2e
    when: A visitor searches for hobbit
    then: [The Hobbit is listed]
`,
    }),
  )
}
