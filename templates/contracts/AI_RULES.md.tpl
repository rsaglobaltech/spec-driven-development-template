# AI_RULES.md — {{PROJECT_NAME}} Contract Layer

> **Scope:** This file governs AI-assisted development in the `{{PROJECT_SLUG}}` contract layer.
> All AI tools (Claude, Copilot, etc.) must follow these rules before generating or modifying any contract artefact.

## 1. Contract-First Mandate

Never write provider implementation code before the OpenAPI / AsyncAPI specification exists and is reviewed.
Every endpoint and every event must have a corresponding entry in `contracts/openapi/` or `contracts/asyncapi/` **before** any code is generated for it.

## 2. Consumer-Driven Test Coverage (TDD Rule 1)

For every API contract (`AC-*` in `pack.yaml`), at least one Pact interaction must exist in `contracts/pacts/`.
Do not mark a contract as `Verified` in the traceability matrix until the Pact test passes in CI.

## 3. No Breaking Changes Without Versioning (TDD Rule 2)

Before modifying any schema file:
1. Check `breaking_change_rules` in `pack.yaml` for the relevant contract.
2. If the change matches a breaking-change rule, bump the contract's major version and create a new schema file (`provider-v2.yaml`). Do **not** overwrite the existing version.
3. Update `api_contracts[].schema_ref` to point to the new version.

## 4. Traceability Gate (TDD Rule 3)

Every contract entry (`AC-*`) must be traceable to a requirement (`REQ-*`) via `api_contracts[].requirement`.
Do not add a contract without a corresponding requirement, and do not close a requirement without at least one associated contract or consumer-driven test.

## 5. Status Promotion Rules (TDD Rule 4)

A contract record in `docs/specs/contract-traceability.md` may only advance past `Ready for Dev` when:
- The schema file referenced by `schema_ref` exists and validates against its format spec (OpenAPI 3.x / AsyncAPI 2.x).
- At least one `CDT-*` entry links this contract's provider.
- The corresponding Pact file exists on disk.

Do not auto-promote status. Status changes must be explicit edits to the traceability document, committed with a message explaining the promotion reason.

## 6. Test Artifact Must Not Be TBD (TDD Rule 5)

In `docs/specs/contract-traceability.md`, the **Test Artifact** column must never contain `TBD` for a record whose **Status** is `In Dev` or later.
If the test artifact is not yet known, keep the record at `Draft` or `Needs Clarification`.

## 7. Schema Files Are Source of Truth

- OpenAPI / AsyncAPI files in `contracts/` are the authoritative contract.
- Generated client stubs, server stubs, and mock servers derive from these — never the reverse.
- If a generated file conflicts with the schema, the schema wins. Update the schema deliberately, not the generated file.

## References

- Requirements: see `pack.yaml` → `requirements[]`
- API Contracts: see `pack.yaml` → `api_contracts[]`
- Consumer-Driven Tests: see `pack.yaml` → `consumer_driven_tests[]`
- Breaking-Change Rules: see `pack.yaml` → `breaking_change_rules[]`
- Traceability: `docs/specs/contract-traceability.md`
- Test Strategy: `docs/specs/test-strategy.md`
