# Authoring SpecAI specs

The rules for writing spec files, for SpecAI version 0.1. `<specai> validate` checks the mechanical
ones; the rest are judgement, and the human reviews them.

## Layout and IDs

```
specs/
  specai.yaml          # version, areas, components
  glossary/<slug>.yaml # one glossary term per file
  <area>/area.yaml     # the area's prefix, name and overview
  <area>/<ID>.yaml     # one requirement per file, named by its ID
```

- A new requirement takes the next number in its area, counting deprecated and removed ones:
  after `LOAN-007`, the next is `LOAN-008`. IDs are never reused or renumbered.
- A test definition's ID is its requirement's ID plus `-Tn`, numbered from the highest `n` in that
  requirement.
- `components` take names listed in `specai.yaml`. A new component is a change to `specai.yaml` the
  human agrees to.

## Requirements

A requirement is one **testable** statement of behaviour the software should have now. History,
decisions and plans live elsewhere; the specs are the current desired state.

| Field | What to write |
|---|---|
| `title` | a few words naming the behaviour |
| `statement` | one sentence, in an EARS pattern (below) |
| `rationale` | why the behaviour is wanted, in Markdown; the reasoning behind a decision goes here |
| `acceptance` | optional criteria that pin the statement down, one per line |
| `notes` | anything else a reader needs, in Markdown |
| `tags` | lowercase-hyphenated labels for grouping |
| `components` | where the behaviour is implemented |
| `parent` | the requirement this one refines, when it breaks a larger one down |
| `related` | requirements a reader should look at alongside this one |

### Statements in EARS

Write the statement as one sentence with one "shall", in the pattern that fits:

| Pattern | Form |
|---|---|
| Always | The `<system>` shall `<response>`. |
| Event | When `<trigger>`, the `<system>` shall `<response>`. |
| State | While `<state>`, the `<system>` shall `<response>`. |
| Unwanted | If `<condition>`, then the `<system>` shall `<response>`. |
| Optional | Where `<feature is included>`, the `<system>` shall `<response>`. |

- Name the system or component that acts: "the loans service", "the catalogue UI".
- Make the response observable: a value, a message, a state a test can check.
- One behaviour per requirement. A statement with "and" joining two responses is two requirements.
- "Shall" states what is wanted; "should" and "may" leave the reader guessing, so pick: wanted, or
  not in the spec.

## Test definitions

A test definition describes one check of its requirement, as prose a human reviews. It verifies only
the requirement it sits in.

| Field | What to write |
|---|---|
| `title` | the case, such as "Sixth loan is refused" |
| `level` | `unit`, `integration`, `e2e` or `manual`: the cheapest level that can observe the behaviour |
| `given` | preconditions, one per line |
| `when` | the one action |
| `then` | expected outcomes, one per line, each one a test can assert |
| `notes` | anything else, in Markdown |

- Cover the requirement: its main case first, then each unwanted or boundary case its statement or
  acceptance criteria name.
- Write domain words, not code: "a member with five open loans", not `new Member { Loans = 5 }`.
- When a change must leave other behaviour as it is, that behaviour's own requirement and its tests
  already guard it. Link the requirement in `related`, and add a test definition there if it has none.
- Test code that implements it names its ID: `[Trait("SpecAI", "LOAN-042-T1")]` in xUnit;
  `it('[LOAN-042-T1] …')` in Vitest, the ID in square brackets in the test name.

## Glossary terms

Add a term when a requirement uses a domain word a newcomer could misread, or one the team means
something specific by.

| Field | What to write |
|---|---|
| `term` | the word as written in sentences, in sentence case unless it is a proper name |
| `aliases` | plurals and other spellings links may use |
| `definition` | what it means here, in Markdown |
| `avoid` | words people wrongly use for it; the validator warns when they appear |

The file is named by a slug of the term: `Overdue loan notice` → `glossary/overdue-loan-notice.yaml`.

## Links and Markdown

- Link a glossary term or requirement the first time a statement, rationale or test uses it:
  `[[loan]]`, `[[loan|loans]]`, `[[LOAN-042]]`. Link by the word as it reads in the
  sentence; any name or alias of the term works.
- `rationale`, `notes`, `definition` and the area `overview` are Markdown. Every other text field is
  plain text plus links.
- Inline code (`` `like this` ``) marks field names, commands, options and literal values, in every
  field including `given`, `when` and `then`: "When `specai validate` runs with `--quiet`".

## YAML

- Start every file with `specai: "0.1"`, quoted.
- Write text containing `: ` or starting with a backtick, quote or bracket as a block scalar:

  ```yaml
  statement: >-
    When a commit carries a `Co-Authored-By: Claude` trailer, the guard shall reject it.
  rationale: |
    First paragraph.

    Second paragraph.
  ```

- Plain data only: no anchors, aliases or tags.
- Keep comments and the existing key order when editing a file.

## Statuses

| Status | When you set it |
|---|---|
| `draft` | you are part-way through and the item is not ready for review |
| `proposed` | anything you added or changed, ready for review |
| `deprecated` | the behaviour is no longer wanted; the file and ID stay |

`approved` and `removed` are the human's. Changing the text of an approved item makes it `proposed`
again.
