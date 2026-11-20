# The SpecAI standard, version 0.2

SpecAI is a YAML format for the requirements, test definitions and glossary of a piece of software.
Humans and AI agents read and edit the same files. Agents propose; humans approve.

The schema in [`schema/v0.2/`](../schema/v0.2/) is the official definition: JSON Schema 2020-12,
itself written in YAML. It drives the validator, CI checks, editor validation and the UI's forms, and
it is what agents are told their output must conform to. This document explains it. Where the two
disagree, the schema wins and this document is wrong.

## Why SpecAI works this way

- **The specs record the current desired state.** Not a history of decisions or a backlog: a
  requirement is either wanted or it is not. Git history is the audit trail.
- **Git is the source of truth.** Specs are plain files in a repo, and changes go through normal
  review. Agents and the UI edit the same files.
- **Atomic, stable requirements.** One testable statement per requirement, one requirement per file,
  and IDs are never reused, so links never go stale.
- **Test definitions describe intent, not code.** Agents write the executable tests in whatever
  framework the codebase uses, and link them back by ID.
- **Derived, never written.** Anything the tools can work out, such as backlinks and coverage, is
  computed and never stored, so it cannot drift.
- **Plain YAML only.** A restricted subset that maps cleanly to plain data, so people, agents and
  tools all read the same thing.
- **Not tied to one organisation.** Nothing in the schema is specific to one codebase; extra data
  goes in `x-` fields.

## Versions

Each version of the standard has its own schema folder, and the tools refuse a version they do not
support. The standard stays at 0.x, where breaking changes are allowed, until it has been proved out
on large, real spec trees.

A spec tree uses one version throughout: the one its `specai.yaml` declares. `specai validate`
checks the tree against that version's schema, and reports any file that declares another.
`specai upgrade` rewrites a tree for the latest version, changing only what the new version needs.

| Version | Changes |
|---|---|
| 0.2 | adds `issues` on requirements, `issueUrl` in `specai.yaml`, and [implementation annotations](#implementation-annotations) in code. Upgrading from 0.1 only changes each file's version line. |
| 0.1 | first version |

## Spec tree

A spec tree is a folder with this layout:

```
specs/
  specai.yaml          # root config
  glossary/
    <slug>.yaml        # one glossary term per file
  <area>/
    area.yaml          # one per area
    <PREFIX>-NNN.yaml  # one requirement per file
```

Every other path is an error. An area folder may not be called `glossary`. A glossary term may
have any slug, including `area`, because files in `glossary/` are always terms. [`examples/library/`](../examples/library/) is a complete small
example, and [`specs/`](../specs/) holds SpecAI's own specs.

## YAML rules

- Every file starts with the version, such as `specai: "0.2"`. **Quote the version**: unquoted,
  YAML reads `0.2` as a number.
- Only plain data: no anchors (`&x`), aliases (`*x`) or custom tags (`!tag`).
- Quote, or use a block scalar for, any text containing `: ` or starting with a character YAML
  treats specially (`[`, `{`, `&`, `*`, `!`, `|`, `>`, `'`, `"`, `%`, `@`, `` ` ``). A block scalar
  is usually easier to read:

  ```yaml
  statement: >-
    When given a git range, the tool shall fail if a commit carrying a
    `Co-Authored-By: Claude` trailer changes any status to `approved`.
  ```

- Comments are welcome. The UI keeps them when it saves.
- Any file may carry extra fields whose names start with `x-`, for tool- or organisation-specific
  data. All other unknown fields are errors.

## `specai.yaml`

```yaml
specai: "0.2"
name: Lending library
areas:
  - catalogue
  - loans
components:
  - name: Library.API
    description: The lending service.
  - name: Library.Web
    path: library/web
```

| Field | Required | Description |
|---|---|---|
| `specai` | yes | version of the standard |
| `name` | no | display name for the spec tree, such as the product it specifies; tools fall back to the folder name |
| `areas` | yes | the area folders, in display order |
| `components` | no | the components requirements may name |
| `issueUrl` | no | link template for [issue](#issues) shorthand, using `{owner}`, `{repo}` and `{number}`; defaults to `https://github.com/{owner}/{repo}/issues/{number}` |

Each component has a `name`, an optional `description`, and an optional `path`: where
`specai trace` finds its code, relative to the checkouts folder. `path` defaults to the name, which
suits one repo per component.

## `area.yaml`

```yaml
specai: "0.2"
prefix: LOAN
name: Loans
description: Borrowing and returning copies.
overview: |
  A [[member]] borrows a [[copy]] as a [[loan]] and returns it by the due date.
```

| Field | Required | Description |
|---|---|---|
| `prefix` | yes | 2–8 capital letters or digits, starting with a letter; the start of every requirement ID in the area |
| `name` | yes | display name |
| `description` | no | one line |
| `overview` | no | Markdown introduction to the area |

## Requirements

One file per requirement, named by its ID only (`LOAN-001.yaml`), inside its area folder. The file
name never changes, even when the title does.

```yaml
specai: "0.2"
id: LOAN-001
title: Loan limit
status: proposed
statement: While a [[member]] has five open [[loan|loans]], the lending service shall refuse a new loan.
rationale: |
  Keeps popular titles circulating.
components: [Library.API]
related: [LOAN-002]
tests:
  - id: LOAN-001-T1
    title: Sixth loan is refused
    status: proposed
    level: unit
    given:
      - A member with five open loans
    when: The member borrows another copy
    then:
      - The loan is refused with reason "loan limit reached"
```

| Field | Required | Text | Description |
|---|---|---|---|
| `id` | yes | | `<PREFIX>-NNN`: the area prefix, a hyphen, at least three digits |
| `title` | yes | plain | short title |
| `status` | yes | | [lifecycle](#lifecycle) status |
| `statement` | yes | plain | one testable sentence; see [EARS](#writing-statements-ears) |
| `rationale` | no | Markdown | why the requirement exists |
| `acceptance` | no | plain, list | criteria the statement must meet |
| `notes` | no | Markdown | anything else |
| `tags` | no | | free-form lowercase-hyphenated labels for grouping |
| `components` | no | | names from `specai.yaml` |
| `parent` | no | | a requirement this one refines |
| `related` | no | | other requirement IDs |
| `issues` | no | | [issues](#issues) tracking work still to do to build it |
| `tests` | no | | its [test definitions](#test-definitions) |

"Plain" text allows [links](#links) but not Markdown.

### IDs

- Requirement IDs are unique across the spec tree and never reused.
- A requirement that is no longer wanted keeps its file and ID, with status `deprecated` or
  `removed`.
- New IDs take the next unused number in the area.

### Writing statements (EARS)

Write each statement as one sentence that a test could check, using an EARS (Easy Approach to
Requirements Syntax) pattern where one fits. The schema does not enforce this.

| Pattern | Form |
|---|---|
| Always | The `<system>` shall `<response>`. |
| Event | When `<trigger>`, the `<system>` shall `<response>`. |
| State | While `<state>`, the `<system>` shall `<response>`. |
| Unwanted | If `<condition>`, then the `<system>` shall `<response>`. |
| Optional | Where `<feature is included>`, the `<system>` shall `<response>`. |

Patterns combine: "While a member has an overdue loan, when they borrow a copy, the lending
service shall refuse the loan."

### Issues

When work to build a requirement is tracked as issues, list them in `issues`, each as
`owner/repo#number` shorthand or a URL:

```yaml
issues: [acme/library#12, https://tracker.example.com/browse/LIB-7]
```

Keep an issue listed until it is closed, even once some code implements the requirement, and remove
it then. The tools never look up an issue's state. A requirement with issues but no implementing code
is planned; one with neither has not been looked at.

## Test definitions

A test definition describes what one test checks. It sits inside the requirement it verifies and
verifies no other. It is prose for a human to review, not executable code.

**One test per test definition.** A requirement may have many test definitions; each test definition
is implemented by exactly one test, and each test implements exactly one test definition. A
parameterised test, such as an xUnit `[Theory]`, a Vitest `it.each` or a pytest
`@pytest.mark.parametrize` test, counts as one test. Two tests
of the same case are either two cases, each needing its own test definition, or a duplicate. Tests
may share setup through fixtures or helpers.

| Field | Required | Text | Description |
|---|---|---|---|
| `id` | yes | | `<requirement ID>-Tn`, such as `LOAN-001-T1` |
| `title` | yes | plain | short title |
| `status` | yes | | [lifecycle](#lifecycle) status |
| `level` | yes | | `unit`, `integration`, `e2e` or `manual` |
| `given` | no | plain, list | preconditions |
| `when` | yes | plain | the action |
| `then` | yes | plain, list | expected outcomes |
| `notes` | no | Markdown | anything else |

Test code links back by naming the test-definition ID, once, in the one test that implements it:

- xUnit: `[Trait("SpecAI", "LOAN-001-T1")]`
- Vitest: `it('[LOAN-001-T1] refuses a sixth loan', …)`
- pytest: `@pytest.mark.specai("LOAN-001-T1")` on the test function. Register the marker once in the
  project's pytest configuration, such as `markers = ["specai: SpecAI test definition ID"]` under
  `[tool.pytest.ini_options]` in `pyproject.toml`, or pytest warns about an unknown marker.

Do not record the test's name or file in `notes`: the tools work it out, and `specai validate` warns
when notes appear to.

## Implementation annotations

Code that implements a requirement names the requirement's ID in a comment whose text starts with
`SpecAI:`, directly above the declaration that implements it:

```csharp
// SpecAI: LOAN-001, LOAN-002
public LoanResult Borrow(Member member, Copy copy) { … }
```

```yaml
# SpecAI: LOAN-004
retentionDays: 30
```

At the top of a file, before any code, an annotation covers the whole file. Any comment syntax
counts, so annotations work in any language and in configuration files.

- Annotations name **requirement** IDs. Tests keep linking to test definitions: "implemented by"
  and "tested by" are different facts.
- A requirement may be implemented in many places, and one place may implement many requirements.
- Spec files never record where code is; the tools work it out from the annotations, which move with
  the code.
- Annotations in test files (`*.test.*`, `*.spec.*`, `test_*.py`, `*_test.py`, and `.cs` files
  holding xUnit tests) and in
  documentation (`.md`, `.mdx`, `.txt`) are ignored: tests link to test definitions, and such files
  often show annotations as examples.

See [implementation status](#implementation-status) for what `specai trace` reports from them.

## Glossary terms

One file per term in `glossary/`, named by a lowercase-hyphenated slug (`glossary/loan.yaml`).

```yaml
specai: "0.2"
term: Member
aliases: [members]
definition: A person registered with the library who may borrow [[copy|copies]].
avoid: [customer, patron]
```

| Field | Required | Description |
|---|---|---|
| `term` | yes | the term as written |
| `aliases` | no | other names; links may use them |
| `definition` | yes | Markdown |
| `avoid` | no | words that must not be used for this concept; the validator warns when they appear in requirement or test text |

## Links

Any text field may link, Obsidian-style:

| Link | Goes to |
|---|---|
| `[[loan]]` | the glossary term with slug, name or alias `loan`, ignoring case |
| `[[loan\|loans]]` | the same term, displayed as "loans" |
| `[[LOAN-001]]` | requirement LOAN-001 |

Link by the word as it reads in the sentence, such as `[[spec tree]]`, rather than by a hyphenated
slug: the link text is what readers see.

Link syntax inside inline code (`` `[[like this]]` ``) is not a link. Broken links are errors.
Backlinks are worked out by the tools, never written down.

## Lifecycle

`draft` → `proposed` → `approved` → `deprecated` / `removed`

| Status | Meaning |
|---|---|
| `draft` | being written; not ready for review |
| `proposed` | ready for a human to review |
| `approved` | a human has confirmed this is wanted |
| `deprecated` | no longer wanted; kept so its ID is not reused |
| `removed` | no longer wanted and no longer implemented |

- Agents only ever set `draft` or `proposed`.
- Only a human sets `approved`.
- Editing the text of an approved item returns it to `proposed`.
- `specai validate --since <ref>` fails when a commit carrying a `Co-Authored-By: Claude` trailer sets
  any status to `approved`. It is a guardrail against mistakes, not security.

## Coverage

A requirement is **covered** when every one of its test definitions has linked test code in one of
its components. `specai trace` works this out for every requirement and counts the approved ones in
its summary; coverage is never written into spec files.

| Coverage | Meaning |
|---|---|
| covered | every test definition has linked test code |
| partly covered | some do |
| not covered | none do |
| no test definitions | the requirement has none yet |

Deprecated and removed test definitions are not counted. Test code links to a test definition by:

- **xUnit:** a `[Trait("SpecAI", "<test ID>")]` attribute, in any `.cs` file
- **pytest:** a `@pytest.mark.specai("<test ID>")` marker (or `@mark.specai(…)` after
  `from pytest import mark`), in a `test_*.py` or `*_test.py` file
- **Vitest:** the test ID in square brackets inside a string, such as `it('[LOAN-001-T1] …')`, in a
  `*.test.*` or `*.spec.*` file

Only code in the requirement's own components counts; a requirement with no components counts code in
all of them.

`specai trace` checks the [one-test-per-test-definition](#test-definitions) rule and reports:

| Finding | Severity |
|---|---|
| test code naming an ID that no requirement has | error |
| a test definition named by more than one test | error |
| one test naming more than one test definition: several `Trait("SpecAI", …)` attributes on one xUnit method, several `specai` markers on one pytest test, or several bracketed IDs in one Vitest test name | error |
| test code naming a test definition in a component its requirement does not list, so it is not counted | warning |
| tests naming no test definition, listed per component | information |

| an implementation annotation naming a requirement that does not exist, a test definition ID, or text that is not an ID | error |
| an implementation annotation in a component its requirement does not list, so it is not counted | warning |
| an implementation annotation naming a removed requirement | warning |
| an approved requirement that is not implemented: no annotation and no `issues` | warning |

Errors make `specai trace` fail. It finds tests by pattern matching, not by parsing: an xUnit test is a
method with a `[Fact]` or `[Theory]` attribute; a pytest test is a `test*` function at module level or
a `test*` method of a module-level `Test*` class, as pytest finds them by default; and a Vitest test is
an `it` or `test` call (with any of `.each`, `.only`, `.skip` and the like) whose first argument is a
string literal followed by the test function. The list of untagged tests is a guide, not an exact
count.

## Implementation status

`specai trace` also works out each requirement's implementation status from the
[implementation annotations](#implementation-annotations) in its components:

| Status | Meaning |
|---|---|
| implemented | an annotation in one of its components names it |
| planned | no annotation names it, but it lists [issues](#issues) |
| not implemented | neither |

Like coverage, it is reported and never written into spec files. An approved requirement that is not
implemented is a warning, so a spec tree can adopt annotations gradually; `specai trace --strict`
fails on it, as it does on an approved requirement that is not covered.

`specai impact --since <rev>` lists the requirements named by annotations or linked tests in files
changed since the checkout branched from `<rev>`, including changes not yet committed. It reads each
changed file before and after the change, so deleted code still lists its requirements.

