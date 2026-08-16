# Traceability Matrix — `create-spec-driven-app` CLI

> Links every CLI requirement to its source file, test case and status.
> Keep this file updated when adding new commands, flags or scripts.
> All requirement IDs reference [`/spec.md`](../../spec.md).
>
> `tests/unit/docs-truth.test.ts` fails the build if any path named below stops
> existing. Statuses are still a human judgement — this file is a contract, so
> do not mark something Verified without a test to point at.

---

## 1. Functional requirements

| REQ | Requirement | Bounded Context | Source file(s) | Test(s) | Status |
|---|---|---|---|---|---|
| REQ-001 | `init` generates a valid project skeleton from a `project.config` file | Scaffolding | `scripts/init_project.ts` | `tests/cli.test.ts`: "runs init in dry-run mode with example config", "can init and validate a generated project end-to-end"; `features/cli/init.feature` | Verified |
| REQ-002 | `validate` enforces required files, no unresolved placeholders, traceability coverage and allowed status values | Validation | `scripts/validate_specs.ts` | `tests/unit/validate-remedies.test.ts`, `tests/unit/validate-strict-tdd.test.ts`, `features/cli/validate.feature` | Verified |
| REQ-003 | `expand` merges a domain pack into an existing project and enriches traceability | DomainPackExpansion | `scripts/expand_domain_pack.ts`, `scripts/domain-pack/common.ts` | `tests/unit/common.test.ts`, `features/pack/expand-parking.feature`, `features/cli/expand.feature` | Verified |
| REQ-004 | All commands run identically on Linux, macOS and Windows (Node ≥ 20) | Scaffolding / Templating | `bin/create-spec-driven-app.ts`, `scripts/run-tests.cjs` | CI matrix: ubuntu · macOS · Windows × Node 20/22, full suite on every one; `tests/unit/init-engine-parity.test.ts` | Verified |
| REQ-005 | `init` generates a Docker Compose stack, a devcontainer, multi-environment `.env` files and the runtime contract when `DOCKER_SUPPORT=true` | RuntimeConfig | `scripts/init_project.ts`, `templates/base/docker-compose.yml.tpl`, `templates/base/docs/specs/runtime-environments.md.tpl` | `tests/cli.test.ts`: "init generates the full runtime contract by default", "DOCKER_SUPPORT=false leaves no orphaned Docker or devcontainer artifacts" | Verified |
| REQ-006 | `pack init` produces a valid `pack.yaml` skeleton | DomainPackExpansion | `scripts/init_pack.ts` | `tests/unit/pack-commands.test.ts` (6 `pack init` cases), `tests/unit/pack-schema.test.ts` | Verified |
| REQ-007 | `pack lint` detects orphan references, duplicate IDs and missing scenarios | DomainPackExpansion | `scripts/lint_pack.ts` | `tests/unit/pack-commands.test.ts` (5 `pack lint` cases), `pack-lint-quality.test.ts`, `pack-lint-graph.test.ts` | Verified |
| REQ-008 | A GitHub Action runs `validate` on every PR in generated projects | Validation | `actions/spec-driven-action/action.yml` | **None** — see §4 | In Dev |
| REQ-009 | Template rendering is deterministic: two identical invocations produce byte-identical output | Templating | `scripts/init_project.ts`, `scripts/domain-pack/common.ts` | `tests/snapshot/init-determinism.test.ts` | Verified |
| REQ-010 | `change` proposes, reviews and archives a delta against the spec tree | ChangeLifecycle | `scripts/change/cli.ts`, `scripts/change/{parser,delta,archive,common}.ts` | `tests/unit/change-cli.test.ts`, `change-delta.test.ts`, `change-archive.test.ts` | Verified |
| REQ-011 | `specops` installs, syncs and diffs versioned domain packs, and contributes local changes back upstream | SpecOps | `scripts/specops/*.ts` | `tests/unit/specops-sync.test.ts`, `specops-as-change.test.ts`, `specops-f1b.test.ts` | Verified |
| REQ-012 | `harness run` drives the plan → agent → verify → done loop on a worktree per requirement | Automation | `scripts/harness/run.ts` | `tests/unit/harness-run.test.ts`, `tests/cli.test.ts` harness cases | Verified |
| REQ-013 | `adopt` installs SDD on an existing repository without moving its files | Scaffolding | `scripts/adopt_project.ts` | `tests/unit/adopt.test.ts` | Verified |
| REQ-014 | `doctor` diagnoses the project and environment, reporting a fix per finding | Validation | `scripts/doctor.ts` | `tests/unit/doctor.test.ts` | Verified |
| REQ-015 | `req` adds, links and closes requirements without hand-editing the matrix | Validation | `scripts/req.ts` | `tests/unit/req-commands.test.ts` | Verified |

---

## 2. Non-functional requirements

| NFR | Requirement | Quality attribute | Measured by | Status |
|---|---|---|---|---|
| NFR-001 | `init` to green `validate` ≤ 60 s on clean env | Performance | Not measured automatically; `npm run smoke:init` is manual and not run by CI | Draft |
| NFR-002 | Unit coverage ≥ 80 % lines / ≥ 70 % branches | Reliability | `c8 --check-coverage`, enforced in CI. **Today: 74.8 % lines · 71.1 % branches · 80.4 % functions**, gated at 74/70/80. Branches and functions meet the target; lines does not | In Dev |
| NFR-003 | Zero ESLint errors and zero Prettier diffs on `main` | Maintainability | CI `lint` job: `npm run typecheck && npm run lint && npm run format:check` | Verified |
| NFR-004 | CLI emits structured JSON for agents via `--json` | Usability | `change --json` and `plan --format json` only. Whole-surface coverage is C3-02 | In Dev |
| NFR-005 | Every shipped `pack.yaml` passes schema and lint checks in CI | Reliability | `npm run registry:build` lints all 11 packs in `packs/` and exits 1 on failure; `tests/unit/pack-schema.test.ts` covers the fixtures | Verified |

> **NFR-003 changed meaning.** It used to promise "zero ShellCheck warnings".
> ADR-0008 removed every shell script from the CLI, so there is nothing for
> ShellCheck to lint but the demo recording scripts. Adding that step is C6-05.

---

## 3. Test inventory

| Test file / suite | Type | Covers | Runner |
|---|---|---|---|
| `tests/cli.test.ts` | E2E / integration | REQ-001..005, REQ-012 — dispatch, dry-run, runtime contract, harness CI mode | `node:test` |
| `tests/unit/**` (26 files) | Unit | REQ-002, REQ-003, REQ-006, REQ-007, REQ-010..015 | `node:test` via `scripts/run-tests.cjs` |
| `tests/snapshot/init-determinism.test.ts` | Snapshot | REQ-009 | `node:test` |
| `features/cli/*.feature`, `features/pack/*.feature` | BDD (22 scenarios) | REQ-001, REQ-002, REQ-003 | Cucumber |
| `packages/*/test/unit/**` | Unit | VS Code extension, MCP server, pack registry, LSP server | `node:test` |
| `tests/unit/docs-truth.test.ts` | Guard | This file — every path named above must exist | `node:test` |

---

## 4. Coverage gaps (open work)

| Gap | Tracking | Priority |
|---|---|---|
| **REQ-008 has no test at all.** `actions/spec-driven-action/action.yml` is a composite action nothing exercises — a broken step would ship unnoticed | C6-08 | P0 |
| NFR-002 target not met: lines at 74.8 % against a target of 80 %. The gate is real now, but ratcheted at 74 | C6-01 | P1 |
| NFR-001 is unmeasured — no automated timing of `init` → green `validate` | C6-08 | P2 |
| ShellCheck is not in CI, though `CONTRIBUTING.md` used to claim it was | C6-05 | P2 |
| `--json` covers 2 commands of ~20 | C3-02 | P0 |
