# Quickstart — you just cloned a spec-driven repo

> 5 minutes. For a developer **joining** an existing spec-driven project — not
> scaffolding a new one. For the full build-from-scratch walkthrough see the
> [tutorial](tutorial.md).

## 0. Prerequisites

- **Node.js ≥ 22**.
- Run everything below with `csda` (installed via `npx create-spec-driven-app`
  or a global install). All commands auto-detect the project root from your
  current directory — no `--project-dir` needed once you're inside the repo.

```bash
git clone <your-repo> && cd <your-repo>
npm install            # or your project's setup
```

## 1. See where the project stands

```bash
csda plan
```

Lists every requirement and what it still needs — a missing `.feature`, a
missing test, production code, or just a status update. Pick one to work on.

## 2. Read the requirement, then work

Each requirement maps to a Gherkin `.feature` file (the executable spec) and a
row in `docs/specs/traceability.md`. Read the feature, **write the test first**,
then the code until the test passes.

```bash
csda req list          # readable view of the matrix (no raw markdown)
```

## 3. Link your work to the requirement — never edit the matrix by hand

```bash
# Point the requirement at the test and code you just wrote
csda req link REQ-007 --feature features/billing/pay.feature \
                      --test src/test/PayTest.java \
                      --code src/main/Pay.java
```

Adding a brand-new requirement? `csda req add "<what it does>"` appends a
well-formed row and assigns the next `REQ-NNN` for you.

## 4. Close the loop

```bash
csda done REQ-007 --check     # flips status to Implemented (validates first)
```

## 5. Validate before you push

```bash
csda validate --strict-tdd
```

Every failure tells you the exact fix. Mechanical problems (an orphan
`.feature`, a requirement in `spec.md` with no row) can be auto-repaired:

```bash
csda fix --dry-run       # see what it would change
csda fix                 # apply, then re-run validate
```

## Daily loop, in one line

```
csda plan  →  work (test first)  →  csda req link  →  csda done  →  csda validate --strict-tdd
```

That's the whole day-to-day. Reach for the [how-to guide](how-to.md) for
specific recipes, or the [tutorial](tutorial.md) to build a project end-to-end.
