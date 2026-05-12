# ADR-0001: Use Node.js built-in test runner instead of Jest

**Date:** 2024-01-15  
**Status:** Accepted  
**Deciders:** Core maintainers

---

## Context

The CLI is a pure Node.js tool with no browser-side code. A test runner is needed for the E2E and unit test suites. The two main options considered were Jest (most popular) and the built-in `node:test` module (available since Node 18).

## Decision

Use `node:test` (Node.js built-in test runner).

## Rationale

| Criterion | `node:test` | Jest |
|---|---|---|
| Zero dependencies | ✅ | ❌ adds ~5 MB |
| Works without config | ✅ | ❌ requires config file |
| TAP output | ✅ native | ❌ via plugin |
| Node ≥ 18 required anyway | ✅ aligned | N/A |
| Snapshot support | ❌ (future) | ✅ |
| Mocking | Limited | Rich |
| Ecosystem maturity | Stable | Very mature |

For the current scope (CLI smoke tests, unit tests for pure functions) `node:test` is sufficient. The lack of snapshot support is noted and addressed in the test-snapshot work item (P2-07).

## Consequences

- **Positive:** No test-runner dependency to maintain or audit; aligned with Node.js LTS lifecycle.
- **Negative:** If snapshot or mock-heavy tests are needed in Phase 3, migrating to Vitest (Jest-compatible, no config) is straightforward.
- **Neutral:** Bats-core is used separately for shell tests — this ADR covers only JS tests.
