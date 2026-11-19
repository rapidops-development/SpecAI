# AGENTS.md

Guidance for AI agents working in this repository.

## Branching and pull requests

- Do **not** commit new features or sets of changes directly to `main`.
- Create a new branch for each feature or set of changes before starting work.
- Each feature gets its own dedicated branch and its own pull request — do not bundle
  unrelated changes together.
- Branch off `main`.
- When the work is complete (implemented, tested, and verified), open a pull request
  for that branch targeting `main`.

## The standard

- [`docs/standard.md`](docs/standard.md) explains the standard; the schema in `schema/` defines it.
  Keep them, SpecAI's own specs in `specs/`, the README and the `specai` skill consistent when any of
  them changes.

## Specifications

This repo's behaviour is specified in the SpecAI spec tree at `specs/`, as components `Schema`
(`schema/`), `CLI` (`packages/cli/`) and `UI` (`packages/ui/`). Use the `specai` skill before changing
behaviour: propose the spec change first, then implement it. Run the tools with
`node packages/cli/src/main.ts`.
