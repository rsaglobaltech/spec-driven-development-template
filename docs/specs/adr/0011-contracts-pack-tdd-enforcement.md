# ADR-0011: `contracts` Pack Type and `validate --strict-tdd`

**Date:** 2026-05-13
**Status:** Accepted
**Depends on:** [ADR-0009 — SpecOps Remote Packs](0009-specops-remote-packs.md), [ADR-0010 — SpecOps sync/diff](0010-specops-sync-diff.md)

## Context

After M1 (remote packs) and M2 (`sync` / `diff`) landed, two gaps remained:

1. **No first-class contract layer.** Teams building microservices use the tool to scaffold
   backend and frontend packs, but there is no `project_type` for cross-service API contracts
   (OpenAPI, AsyncAPI, Pact). Contract artefacts were either omitted or jammed into backend packs
   where they conceptually don't belong.

2. **No machine-enforceable TDD gate.** The traceability matrix supports a `Test artifact`
   column, but nothing prevented engineers from shipping `TBD` in that column while the row's
   status advanced to `In Dev` or beyond. The gap between "we have a requirement" and "we have a
   test for that requirement" was invisible to CI.

## Decision

### 1. Add `contracts` to the `project_type` enum in `schemas/pack.schema.json`

`contracts` packs describe the API surface between services rather than a single service's
internals. They have a different domain model:

| Section | `backend`/`frontend` | `contracts` |
|---|---|---|
| `bounded_contexts` | Required | Optional |
| `use_cases`, `commands`, `aggregates`, `events`, `scenarios` | Required | Optional |
| `api_contracts[]` | Not present | **Required** |
| `consumer_driven_tests[]` | Not present | Optional |
| `breaking_change_rules[]` | Not present | Optional |

The JSON Schema uses an `if`/`then`/`else` to enforce this split: when
`metadata.project_type` is `backend` or `frontend`, the DDD sections remain required; when it is
`contracts`, `api_contracts` is required instead.

New schema sections:

- **`api_contracts[]`** — one entry per API surface (`AC-*`), with `type` (`REST`, `GraphQL`,
  `AsyncAPI`, `gRPC`), `provider`, `consumers[]`, `schema_ref` (path to the OpenAPI/AsyncAPI
  file), and an optional `requirement` back-reference.
- **`consumer_driven_tests[]`** — Pact definitions (`CDT-*`): `consumer`, `provider`, `pact_file`.
- **`breaking_change_rules[]`** — per-contract list of prose rules that define what constitutes
  a breaking change. Enforced by humans and AI rules, not by the CLI (deliberate).

### 2. New templates under `templates/contracts/`

| Template | Generated file |
|---|---|
| `AI_RULES.md.tpl` | `AI_RULES.md` — 7 contract-specific rules for AI tools |
| `test-strategy.md.tpl` | `docs/specs/test-strategy.md` — CDCT pyramid + metrics |
| `openapi-stub.yaml.tpl` | `contracts/openapi/provider-v1.yaml` |
| `asyncapi-stub.yaml.tpl` | `contracts/asyncapi/provider-events-v1.yaml` |
| `contract-traceability.md.tpl` | `docs/specs/contract-traceability.md` |
| `pacts-gitkeep.tpl` | `contracts/pacts/.gitkeep` |

### 3. `validate --strict-tdd`

A new optional flag on the existing `validate` command (no new top-level command). When passed,
three additional checks run after the standard checks:

| Rule | Condition for failure |
|---|---|
| **TDD-1** | A row in the rich traceability matrix has `Test artifact = TBD` and `Status` ∈ `{In Dev, In Review, Verified, Released, Deprecated, …}` |
| **TDD-2** | A rich-mode row has no Scenario ID and `Status` ≠ `Draft` |
| **TDD-3** | A `REQ-*` identifier found in `spec.md` has no corresponding row in `traceability.md` |

The command exits non-zero with a list of violations when any rule triggers.

### 4. `specops.config.yaml` — declarative pack composition

A new optional file at the project root. When `.specops.lock` is absent, `specops sync` reads
this file instead, bootstrapping a fresh clone without requiring a prior `expand` run.

```yaml
specops_version: 1
packs:
  - repo: https://github.com/rsaglobaltech/parking-management-specops.git
    version: v0.1.0
    pack_id: backend
    vars:
      PROJECT_NAME: Smart Parking
      PROJECT_SLUG: smart-parking
      DOMAIN: parking operations
```

After the first successful `sync`, the lockfile is written and subsequent runs use it (pinning
the resolved commit SHA). `specops.config.yaml` is the human-edited declarative source;
`.specops.lock` is the machine-written reproducible source.

## Consequences

**Positive:**

- Contracts between services are first-class citizens with their own type, their own breaking-
  change rules, and AI rules that enforce contract-first development.
- `validate --strict-tdd` gives CI a machine-checkable gate on the gap between requirements and
  tests, which was previously invisible.
- `specops.config.yaml` removes the chicken-and-egg problem: a fresh clone of a project that has
  never been expanded can now run `specops sync` without error.
- No new runtime dependency: the YAML reader in `config.js` reuses `parseYamlLite` from
  `common.js`.

**Negative / accepted trade-offs:**

- `breaking_change_rules` are prose, not machine-checked. The rules exist to inform AI tools and
  reviewers; automated enforcement (via `oasdiff` or similar) is left to the project's own CI.
- `validate --strict-tdd` only covers the rich traceability format; legacy-format projects are
  not checked for TDD-2 and TDD-3 (row structure is ambiguous in the legacy format).
- The `if`/`then`/`else` in the JSON Schema is correct but less obvious than a flat `required`
  list. Pack authors must know which type they are writing.

## Rejected alternatives

- **Separate `validate-contracts` command.** Would duplicate the file-walking, placeholder, and
  status-validation logic already in `validate`. The `--strict-tdd` flag composition is simpler.
- **`fullstack` as a new project_type.** Considered (per external review). Rejected in favour of
  the composition model: a fullstack project is two packs (backend + frontend) both listed in
  `.specops.lock` / `specops.config.yaml`. No new enum value needed; the tool's multi-pack
  support already handles it.
- **Machine-check `breaking_change_rules`.** Would require integrating `oasdiff` or similar as a
  runtime dependency and understanding each contract format. Deferred; a future ADR can add a
  `contracts lint` subcommand.

## References

- Schema: `schemas/pack.schema.json`
- Sample pack: `packs/sample-contracts/contracts/pack.yaml`
- Templates: `templates/contracts/`
- Validator: `scripts/validate_specs.js` (`--strict-tdd` flag)
- Config reader: `scripts/specops/config.js`
- Sync update: `scripts/specops/sync.js` (`resolvePacks` fallback logic)
- Foundational ADRs: [ADR-0009](0009-specops-remote-packs.md), [ADR-0010](0010-specops-sync-diff.md)
