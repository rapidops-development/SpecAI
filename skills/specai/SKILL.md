---
name: specai
description: SpecAI spec trees (specai.yaml, YAML requirements, test definitions, glossary terms). Use before changing behaviour in a repo whose AGENTS.md names a spec tree, when writing or editing requirements, test definitions or glossary terms, or when linking tests to test definition IDs.
---

# Working with SpecAI specs

A spec tree records what the software should do, as requirements a human approves. You **propose**:
every requirement, test definition and glossary term you write or change gets `status: proposed`, and
the human reviews and approves it. Code follows the specs, so specs change first.

Rules for writing each kind of file are in [authoring.md](authoring.md). Read it before your first
edit to a spec tree in a session.

## Finding the specs and the command

The repo's `AGENTS.md` names the spec tree, the component this repo is, and the `specai` command to
run. Without it, look for a `specai.yaml` in the repo or in a sibling checkout, and ask the human
which component the repo is. `<specai>` below means that command; if it fails for a missing package,
run `npm ci` once in the SpecAI checkout.

## Steps

1. **Read.** Find every requirement that covers the behaviour you are changing: search the spec tree
   for the component name, the glossary terms involved, and the words of the task. Read each match
   and its test definitions. Done when you can name each affected requirement ID, or say that none
   exists.

2. **Propose.** Before touching code, edit the spec tree so it describes the behaviour after your
   change:
   - change an existing requirement's text, or add a requirement with the next free ID in its area;
   - give each changed behaviour a test definition;
   - add glossary terms for new domain words;
   - set `status: proposed` on everything you add or change, including approved items whose text you
     changed;
   - set `deprecated` on requirements the change makes unwanted; keep their files.

   Done when every behaviour the task changes is stated in some requirement, and has a test
   definition.

3. **Validate.** Run `<specai> validate <spec tree>`. Done at 0 errors. Fix warnings about avoided
   words by using the glossary term they name.

4. **Implement.** Change the code and write the tests. Each test that implements a test definition
   names its ID: `[Trait("SpecAI", "LOAN-042-T1")]` in xUnit, `it('[LOAN-042-T1] …')` in Vitest. Done
   when the tests pass.

5. **Trace.** Run `<specai> trace <spec tree>`. Done when every test definition you added or changed
   shows as linked, and no unknown IDs are reported. Trace finds each component's code at
   `<checkouts>/<path from specai.yaml>`; when it reports a missing checkout, such as when you work in
   a worktree or a renamed folder, make a folder of links named as `specai.yaml` expects and pass it
   with `--checkouts`.

6. **Hand off.** In the pull request for the specs, list each requirement and test definition ID you
   proposed, added or deprecated, with one line on why. The human approves them in the SpecAI UI or by
   editing the files. When the spec tree lives in another repo than the code, open a pull request
   there too, and link the two.

Approval belongs to the human. The statuses you set are `draft`, `proposed` and `deprecated`; the
approval guard in CI rejects any commit with your co-author trailer that sets `approved`.
