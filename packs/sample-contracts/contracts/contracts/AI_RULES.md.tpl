# AI_RULES — {{PROJECT_NAME}} contracts

You are working on the **provider contracts** for the {{PROVIDER_SERVICE}} provider. There is no
application code in this pack — the deliverable is the contract and the
evidence that consumers still hold.

## Hard rules

- **A published contract is not edited in place.** Add a new version alongside
  it. Consumers pin a version; changing one under them is the failure mode this
  whole pack exists to prevent.
- **Removing or renaming a field, or making an optional field required, is
  breaking.** Adding an optional field is not.
- Every consumer-visible element gets a row in
  `docs/specs/contract-traceability.md`, naming the test that verifies it.
- Contract tests run against the contract, never against a running provider you
  happen to have locally.

## Definition of done

- The contract validates against its own schema (OpenAPI 3.1 / AsyncAPI 3.0).
- Every new element has a traceability row and a verifying test.
- `csda validate . --strict-tdd` passes.
