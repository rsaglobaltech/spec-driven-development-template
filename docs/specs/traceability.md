# Traceability Matrix — `create-spec-driven-app` CLI

> Links every CLI requirement to its source file, test case and status.
> Keep this file updated when adding new commands, flags or scripts.
> All requirement IDs reference [`/spec.md`](../../spec.md).

---

## 1. Functional requirements

| REQ | Requirement | Bounded Context | Source file(s) | Test(s) | Status |
|---|---|---|---|---|---|
| REQ-001 | `init` generates a valid project skeleton from a `project.config` file | Scaffolding | `scripts/new_spec_project.sh` | `cli.test.js: "runs init in dry-run mode"`, `"can init and validate"`, `"can init, expand, and validate"` | Verified |
| REQ-002 | `validate` enforces required files, no unresolved placeholders, traceability coverage and allowed status values | Validation | `scripts/validate_specs.sh` | `cli.test.js: "returns usage error for validate without project dir"`, `"can init and validate"` | Verified |
| REQ-003 | `expand` merges a domain pack into an existing project and enriches traceability | DomainPackExpansion | `scripts/expand_domain_pack.js`, `scripts/domain-pack/common.js` | `cli.test.js: "expands domain pack in dry-run mode"`, `"can init, expand, and validate"` | Verified |
| REQ-004 | All commands run identically on Linux, macOS and Windows (Node ≥ 18) | Scaffolding / Templating | `scripts/new_spec_project.sh`, `bin/create-spec-driven-app.js` | Cross-OS CI matrix (Phase 2 — P2-07) | In Dev |
| REQ-005 | `init` generates Docker Compose and multi-environment `.env` files when `DOCKER_SUPPORT=true` | RuntimeConfig | `scripts/new_spec_project.sh`, `templates/base/docker-compose.yml.tpl`, `templates/base/.env.*.tpl` | `tests/shell/new_spec_project.bats: "creates docker-compose.yml when DOCKER_SUPPORT=true"` | Verified |
| REQ-006 | `pack init` produces a valid `pack.yaml` from interactive prompts | DomainPackExpansion | `scripts/init_pack.js` _(Phase 2 — P2-05)_ | Planned | Draft |
| REQ-007 | `pack lint` detects orphan references, duplicate IDs and missing scenarios | DomainPackExpansion | `scripts/lint_pack.js` _(Phase 2 — P2-05)_ | Planned | Draft |
| REQ-008 | A GitHub Action runs `validate` on every PR in generated projects | Validation | `actions/spec-driven-action/` _(Phase 1 — P1-10)_ | Planned | In Dev |
| REQ-009 | Template rendering is deterministic: two identical invocations produce byte-identical output | Templating | `scripts/new_spec_project.sh`, `scripts/domain-pack/common.js` | Snapshot test _(Phase 2 — P2-07)_ | Draft |

---

## 2. Non-functional requirements

| NFR | Requirement | Quality attribute | Measured by | Status |
|---|---|---|---|---|
| NFR-001 | `init` to green `validate` ≤ 60 s on clean env | Performance | Manual smoke test / `time npm run smoke:init` | Draft |
| NFR-002 | Unit + shell coverage ≥ 80 % lines / ≥ 70 % branches | Reliability | `c8` report _(Phase 1 — P1-05 / P2-02)_ | In Dev |
| NFR-003 | Zero ShellCheck warnings, zero ESLint errors on `main` | Maintainability | CI: `npm run lint`, `shellcheck --severity=warning scripts/*.sh` | Verified |
| NFR-004 | CLI emits structured JSON errors via `--json` | Usability | Planned _(Phase 2)_ | Draft |
| NFR-005 | All `pack.yaml` fixtures pass schema validation in CI | Reliability | `schemas/pack.schema.json` _(Phase 1 — P1-04)_ | In Dev |

---

## 3. Test inventory

| Test file | Type | Covers | Runner |
|---|---|---|---|
| `tests/cli.test.js` | E2E / integration | REQ-001, REQ-002, REQ-003 (happy paths, dry-run, end-to-end) | `node:test` |
| `tests/shell/new_spec_project.bats` | Shell unit | REQ-001 (required fields, defaults, docker flag, db whitelist), REQ-005 | Bats-core |
| `tests/unit/common.test.js` | Unit | REQ-003 (YAML parsing, template rendering, edge cases) — Phase 1 P1-05 | `node:test` |
| `tests/unit/pack-schema.test.js` | Schema validation | REQ-003, NFR-005 — Phase 1 P1-04 | `node:test` |

---

## 4. Coverage gaps (open work)

| Gap | Tracking | Priority |
|---|---|---|
| No unit tests for `scripts/domain-pack/common.js` | P1-05 | P0 |
| No JSON Schema validation for `pack.yaml` in CI | P1-04 | P0 |
| No cross-OS test matrix | P2-07 | P1 |
| No Gherkin scenarios for CLI commands | P2-03 | P0 |
| No Cucumber step definitions | P2-04 | P0 |
| No snapshot / determinism test for `init` output | P2-07 | P1 |
