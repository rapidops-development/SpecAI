# SpecAI

An open standard for defining and tracing specifications for software platforms that are written using AI agents.

Humans and AI agents share one YAML format for requirements, glossary terms and test definitions.
Agents propose changes; humans correct the intent and approve. A local web UI shows the specs in an
easy-to-read form for searching, grouping, filtering and editing.

- [The standard](docs/standard.md)
- [Writing specs, for agents and people](skills/specai/authoring.md), and the [`specai` skill](skills/specai/SKILL.md)
- [Using SpecAI with AI agents](#using-specai-with-ai-agents)
- [Schema](schema/v0.2/)
- [Example spec tree](examples/library/)
- [SpecAI's own specs](specs/)

## Quick start: browse a spec tree

A **spec tree** is the folder that holds a `specai.yaml`, with the area folders and `glossary/`
beside it. Point the tools at that folder.

With Node 24, from a clone of this repo:

```sh
npm install                                               # once
npm run build                                             # once, and after pulling UI changes
node packages/cli/src/main.ts serve ../my-project/specs
```

Then open <http://localhost:4321>. The path is relative to the folder you run the command from, so
this example assumes a `my-project` repo holding its spec tree in `specs/` is checked out beside
this one. To try it without
another repo, serve this repo's own specs with `node packages/cli/src/main.ts serve specs`, or the
example with `node packages/cli/src/main.ts serve examples/library`.

- Leave the path out to serve the folder you are in:
  `cd ../my-project/specs && node <path to this repo>/packages/cli/src/main.ts serve`.
- `--port <n>` changes the port. The server answers only on `localhost`.
- Coverage appears when the repos the specs describe are checked out beside each other. Otherwise pass `--checkouts <folder holding them>`. See
  [which requirements have tests in code](#see-which-requirements-have-tests-in-code).
- If the page says the UI is not built, run `npm run build` and reload.
- Stop the server with Ctrl+C.

## Using it

Requires Node 24. From a clone:

```sh
npm install
node packages/cli/src/main.ts validate path/to/specs
```

Or run `npm link -w packages/cli` once to get a global `specai` command:

```sh
specai validate path/to/specs                 # schema, IDs, layout, links, components, avoided words
specai validate path/to/specs --since main    # also the approval guard on commits in main..HEAD
specai validate path/to/specs --strict        # fail on warnings too
specai validate path/to/specs --json          # machine-readable output
```

### See which requirements have tests in code

```sh
specai trace path/to/specs                    # coverage of every requirement
specai trace path/to/specs --checkouts ~/src  # where the component checkouts are
specai trace path/to/specs --strict           # also fail unless every approved requirement is covered,
                                              # and implemented or planned
specai trace path/to/specs --json             # machine-readable output
```

Test code names the test definition it implements: `[Trait("SpecAI", "LOAN-042-T1")]` in xUnit, or
`it('[LOAN-042-T1] …')` in Vitest. Each test definition is implemented by exactly one test, and each
test implements exactly one test definition; trace fails when test code breaks that rule or names an
ID that does not exist, warns about links in a component the requirement does not list, and lists the
tests that name no test definition. Each component's code is looked for at `<checkouts>/<path>`, and
`--checkouts` defaults to the folder holding the spec tree's git repo, which suits repos cloned side
by side. `specai serve` takes the same option and shows coverage in the UI.

### See which requirements a change touches

```sh
specai impact path/to/specs --since main      # requirements named in code and tests changed since main
specai impact path/to/specs --since main --json
```

Code names the requirements it implements in a comment such as `// SpecAI: LOAN-001`; see
[implementation annotations](docs/standard.md#implementation-annotations). `specai trace` reports each
requirement as implemented, planned (it lists `issues`) or not implemented, alongside its coverage.

### Upgrade to a new version of the standard

```sh
specai upgrade path/to/specs                  # rewrite every file for the latest version
```

Each version so far only adds optional fields, so an upgrade changes nothing but each file's version
line. Run `specai validate` afterwards.

### Browse specs in the web UI

```sh
npm run build                                  # once, and after changing packages/ui
specai serve path/to/specs                     # then open http://localhost:4321
specai serve path/to/specs --port 5000
specai serve path/to/specs --checkouts ~/src   # show coverage from checkouts kept elsewhere
```

`path/to/specs` is the folder holding `specai.yaml`; see the [quick start](#quick-start-browse-a-spec-tree).

The UI updates when files change on disk, so you can watch an agent's edits arrive. You can edit
requirements, test definitions and glossary terms in forms or as raw YAML, create new ones, and
change statuses. Saves keep the file's comments and layout, are refused when they would make the file
invalid or when the file changed on disk since you opened it, and never touch git: review and commit
the changes yourself.

## Using SpecAI with AI agents

Agents find the specs through the `AGENTS.md` (or `CLAUDE.md`) of each repo whose behaviour a spec
tree describes. Paste this in and fill in the three values:

```markdown
## Specifications

This repo's behaviour is specified in the SpecAI spec tree at `<path to the spec tree>`, as component
`<component name>`. Use the `specai` skill before changing behaviour: propose the spec change first,
then implement it. Run the tools with `<specai command>`.
```

For example, with the spec tree in a `docs` repo and every repo checked out side by side, the values
are `../docs/specs`, the repo's name (such as `billing-api`) and
`node ../SpecAI/packages/cli/src/main.ts`.

The [`specai` skill](skills/specai/SKILL.md) carries the rules, so the snippet stays short. Link it
into your Claude Code skills folder once, from a clone of this repo, so every repo can use it:

```sh
ln -s "$PWD/skills/specai" ~/.claude/skills/specai
```

In this repo, `.claude/skills/specai` links to it already.

## Development

Built with TypeScript, npm workspaces, Node 24 and Vitest; Ajv validates against the schema, and the
`yaml` library keeps comments when the UI saves.


```sh
npm install
npm test           # Vitest
npm run typecheck
npm run validate   # validate specs/ and examples/
```

To work on the UI with hot reload, run `npm run serve -- specs` (port 4321) and, in another
terminal, `npm run dev -w packages/ui`. Vite forwards `/api` to the running server. `npm run serve`
runs from this repo's root, so its path is relative to the root; for a spec tree in a sibling repo it is
`npm run serve -- ../my-project/specs`.

## Licence

SpecAI is licensed under the [Apache License, Version 2.0](LICENSE). Copyright 2026 RapidOps Ltd;
see [NOTICE](NOTICE).
