---
name: specai
description: SpecAI spec trees (specai.yaml, YAML requirements, test definitions, glossary terms). Use before changing behaviour in a repo whose AGENTS.md names a spec tree, when writing or editing requirements, test definitions or glossary terms, when linking tests to test definition IDs, or when annotating code with the requirements it implements.
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
   - set `deprecated` on requirements the change makes unwanted; keep their files;
   - when behaviour is specified now but built later, list the issue tracking it in the requirement's
     `issues` (`owner/repo#number` or a URL), never as prose in `notes`.

   Done when every behaviour the task changes is stated in some requirement, and has a test
   definition.

3. **Validate.** Run `<specai> validate <spec tree>`. Done at 0 errors. Fix warnings about avoided
   words by using the glossary term they name.

4. **Implement.** Change the code and write the tests.
   - Write exactly one test per test definition, and name exactly one ID in each test:
     `[Trait("SpecAI", "LOAN-042-T1")]` in xUnit, `@pytest.mark.specai("LOAN-042-T1")` in pytest,
     `it('[LOAN-042-T1] …')` in Vitest. A parameterised test (`[Theory]`, `@pytest.mark.parametrize`,
     `it.each`) counts as one. In a Python project, register the `specai` marker in its pytest
     configuration if it is not there yet. Split a test that checks two definitions; share setup
     through fixtures or helpers.
   - Annotate the code that implements each requirement with a comment naming the requirement's ID,
     directly above the declaration that carries the behaviour: `// SpecAI: LOAN-042`, or
     `# SpecAI: LOAN-042, LOAN-043` in YAML, shell or Python. At the top of a file, before any code, it
     covers the whole file. Annotations name requirements; tests name test definitions. Never swap
     them.
   - Remove an issue from the requirement's `issues` once the work it tracks is done and it is closed.

   Done when the tests pass.

5. **Trace.** Run `<specai> trace <spec tree>`. Done when every test definition you added or changed
   shows as linked, every requirement you implemented shows as implemented, and trace reports no
   errors and no links or annotations outside the requirement's components.
   Trace finds each component's code at `<checkouts>/<path from specai.yaml>`; when it reports a
   missing checkout, such as when you work in a worktree or a renamed folder, make a folder of links
   named as `specai.yaml` expects and pass it with `--checkouts`.

6. **Hand off.** In the pull request for the specs, list each requirement and test definition ID you
   proposed, added or deprecated, with one line on why. In the code pull request, list the
   requirements it touches: `<specai> impact <spec tree> --since <base branch>` prints them. The human
   approves them in the SpecAI UI or by
   editing the files. When the spec tree lives in another repo than the code, open a pull request
   there too, and link the two.

## Linking an existing test suite

When tests predate the specs, `<specai> trace` lists each component's untagged tests. Take each one in
turn:

- **Fits an existing test definition:** tag it. If the definition is broader than the test, narrow its
  text to the test's case, and set it to `proposed`.
- **Fits a requirement but no test definition:** add a `proposed` test definition describing its case,
  and tag it.
- **Checks two test definitions:** split it, one test per definition.
- **Same case as a test already tagged:** give it its own test definition if it really is another
  case; otherwise it is a duplicate, so list it for deletion.
- **Fits no requirement:** list it for the human to decide: keep it and add a requirement, treat it as
  an implementation detail and leave it untagged, delete it, or discuss.
- **Fits a requirement whose `components` do not list its repo:** a component mismatch; trace does not
  count it. List it for the human: the requirement's components or the test's place is wrong.
- **Asserts behaviour its requirement rejects:** the spec and the code disagree. Leave it untagged and
  list it for the human to decide which is right.

Put the lists in the pull request.

## Annotating existing code

When code predates its annotations, `<specai> trace` reports approved requirements that are not
implemented. For each requirement, find the declaration that carries its behaviour and annotate it.
When a requirement's behaviour is not built, list the issue tracking it in `issues`, replacing any
"Not yet built" note; when nothing tracks it, list it for the human. Annotate only in components the
requirement lists, and list any mismatch for the human, as for tests.

Approval belongs to the human. The statuses you set are `draft`, `proposed` and `deprecated`; the
approval guard in CI rejects any commit with your co-author trailer that sets `approved`.

A spec tree uses the one version its `specai.yaml` declares. Leave it on that version unless the human
asks for an upgrade, which `<specai> upgrade <spec tree>` does; `issues` needs version 0.2.
