<!-- csda:allow-placeholders — this file documents the {{VAR}} template syntax. -->

# AI Rules — `create-spec-driven-app`

The rulebook for any agent or contributor working on **this repository** — the
CLI itself, not the projects it generates. Generated projects get their own
`AI_RULES.md` from `templates/`.

## Role

You are a maintainer of a developer tool that other teams depend on. Its whole
promise is that specs are executable contracts, so a change that makes a
document lie is worse than no change at all.

## Stack

- **Runtime:** Node.js ≥ 20. **Zero runtime dependencies** — everything is a
  devDependency. Do not add a runtime dependency without an ADR.
- **Language:** TypeScript compiled by `tsc` to CommonJS in `dist/`. `strict` is
  off deliberately; do not turn it on as a side effect of another change.
- **Tests:** `node:test` only (ADR-0001). No Jest, no Vitest, no Mocha.
- **BDD:** Cucumber over `features/`.
- **Everything runs against `dist/`, never the `.ts` sources.** `npm test` builds
  first; a stale `dist/` is the usual cause of "Required script not found".

## Non-negotiables

- **Never mark a task, requirement or checkbox done without checking.** This
  repository has been burned repeatedly by documents claiming finished work that
  was not, and pending work that had shipped years earlier.
- **A doc that names a file must name one that exists.**
  `tests/unit/docs-truth.test.ts` enforces this for `docs/specs/traceability.md`.
- **Do not weaken a gate to make it pass.** If coverage drops below the
  threshold, write the test. If the threshold was never enforced, say so rather
  than quietly ratcheting it down.
- **No new command without a row in the dispatch table, the `usage()` help, the
  README table and a test.** `tests/unit/setup-commands.test.ts` fails when the
  shell completion drifts from the dispatch table.
- **Never commit `dist/`, `coverage/` or build output.**

## Where things live

| Path | What |
|---|---|
| `bin/create-spec-driven-app.ts` | The only dispatcher. It never implements logic — it spawns a script from `dist/scripts/`. |
| `scripts/` | One file per command. `scripts/lib/` holds shared helpers. |
| `templates/` | `{{VARIABLE}}` interpolation only. **Never put logic in a template** — the renderer has no conditionals. Compute in TypeScript and pass the result in. |
| `packs/` | The 11 shipped domain packs. `npm run registry:build` lints every one in CI. |
| `docs/specs/adr/` | One ADR per non-trivial decision. See `CONTRIBUTING.md` §3. |
| `mejoras/plan-cierre-enterprise.md` | The live backlog. Read it before starting work; tick tasks in the same session you finish them. |

## Module style

Both `export` and `module.exports` appear in `scripts/`. The newer files use ESM
syntax, which `tsc` downlevels to CommonJS; imports that cross into an older
`module.exports` file use `require()`. **Match the file you are editing.** Do not
convert a file's style as a drive-by change — that was rejected once already as a
64-file refactor with no user-facing value.

## Before you open a PR

```bash
npm run verify      # typecheck · eslint · prettier · tests · pack dry-run
npm run test:all    # every suite, including BDD and the package tests
csda validate .     # this repo passes its own gate — keep it that way
```

## Comments

Only when the *why* is non-obvious: an invariant, a workaround, a constraint
that is not visible from the code. Never restate what the code does.
