# Contributing to `create-spec-driven-app`

Thank you for investing your time in this project.

---

## Table of contents

1. [Development setup](#1-development-setup)
2. [Running tests](#2-running-tests)
3. [ADR policy](#3-adr-policy)
4. [Pull request checklist](#4-pull-request-checklist)
5. [Coding standards](#5-coding-standards)
6. [Commit message format](#6-commit-message-format)
7. [Releasing](#7-releasing)

---

## 1. Development setup

```bash
git clone https://github.com/rsaglobaltech/spec-driven-development-template.git
cd spec-driven-development-template
npm install
chmod +x bin/*.js scripts/*.sh
```

**Prerequisites:** Node.js ≥ 18, Bash (for the legacy shell engine), `bats-core` (for shell tests).

---

## 2. Running tests

| Command | What it runs |
|---|---|
| `npm test` | E2E integration tests (`tests/cli.test.js`) |
| `npm run test:unit` | Unit tests for JS modules (`tests/unit/`) |
| `npm run test:vscode-unit` | VS Code extension unit tests (no VS Code runtime needed) |
| `npm run test:coverage` | Unit tests with c8 coverage report |
| `npm run test:shell` | Bats shell tests (`tests/shell/`) |
| `npm run test:bdd` | Cucumber BDD scenarios (`features/cli/`) |
| `npm run test:all` | All of the above in sequence |
| `npm run lint` | ESLint |
| `npm run format:check` | Prettier |

All tests must be **green on your branch** before opening a PR.

---

## 3. ADR policy

Every PR that introduces a **non-trivial design decision** must include an
Architecture Decision Record (ADR).

### What counts as non-trivial?

- Choosing a new dependency or replacing an existing one
- Changing a default behaviour that affects users
- Adding a new command or subcommand
- Altering the `pack.yaml` schema format
- Changing the template rendering engine or file layout
- Deprecating or removing a public API / flag

### How to write an ADR

1. Copy the template below into `docs/specs/adr/NNNN-short-title.md`
   where `NNNN` is the next sequential number.
2. Fill in all sections (Context, Decision, Consequences, Alternatives).
3. Set `Status: Proposed` in the PR; change to `Accepted` when merged.
4. Reference the ADR from the PR description.

```markdown
# ADR-NNNN: Short Title

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Superseded by ADR-XXXX
**Depends on / Supersedes:** (link if applicable)

## Context
Why does this decision need to be made now?

## Decision
What exactly are we doing?

## Consequences
Positive and negative effects of this decision.

## Alternatives considered
What else was evaluated and why it was rejected.
```

### ADR index

All ADRs live in [`docs/specs/adr/`](docs/specs/adr/).
The index is maintained in [`docs/specs/adr/README.md`](docs/specs/adr/README.md).

---

## 4. Pull request checklist

Before requesting a review, confirm:

- [ ] `npm run test:all` passes locally
- [ ] `npm run lint && npm run format:check` passes
- [ ] New behaviour is covered by at least one test (unit, BDD, or E2E)
- [ ] If this is a design decision, an ADR is included (see §3)
- [ ] `IMPROVEMENTS.md` items completed in this PR are marked done
- [ ] Public CLI flags / commands are documented in `README.md` and `--help`
- [ ] No `TODO` placeholders remain in committed files

---

## 5. Coding standards

- **Language:** CommonJS Node.js (`"type": "commonjs"`). No ESM unless inside `packages/` sub-packages that opt in explicitly.
- **Style:** ESLint + Prettier enforce the rules automatically — run `npm run lint:fix` and `npm run format`.
- **No comments that describe *what* the code does.** Only add a comment when the *why* is non-obvious (invariant, workaround, hidden constraint).
- **No unused variables.** The `no-unused-vars` rule is set to `error`.
- **Shell scripts** are linted with `shellcheck --severity=warning` in CI. If you must suppress a warning, add `# shellcheck disable=SCXXXX` with a one-line explanation.
- **Templates** live in `templates/` and use `{{VARIABLE}}` interpolation. Never add logic to templates.

---

## 6. Commit message format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `ci`, `chore`

Scope examples: `init`, `validate`, `expand`, `pack`, `vscode`, `ci`, `schema`

Breaking changes must include `!` after the scope and a `BREAKING CHANGE:` footer:

```
feat(init)!: flip default engine to Node.js

BREAKING CHANGE: --engine=shell now emits a deprecation warning.
```

---

## 7. Releasing

Releases are automated via GitHub Actions (`publish-npm.yml`). To cut a release:

1. Update `version` in `package.json` (follow SemVer).
2. Update `CHANGELOG.md` with the release notes.
3. Open a PR targeting `main` with the version bump.
4. After merge, tag `vX.Y.Z` on `main` — the publish workflow fires automatically.

**Pre-release versions** (`0.x.x-beta.N`) may be published from the `develop` branch
using the `publish-github-packages.yml` workflow.
