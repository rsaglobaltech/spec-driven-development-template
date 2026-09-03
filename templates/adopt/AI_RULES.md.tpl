# AI Rules — {{PROJECT_NAME}}

Rules for any AI coding agent (and any human) working on this repository.

## Project facts

- Domain: {{DOMAIN}}
- Stack: {{STACK}}
- Testing: {{TESTING}}
- Test command: `{{TEST_CMD}}`

## Boundaries

- `spec.md`, `features/**/*.feature` and `docs/specs/traceability.md` are the
  source of truth. Do not edit them to make a failing gate pass.
- Never delete or weaken an existing test to get to green.
- Implement one requirement (REQ-NNN) at a time; write or extend the test
  first, then the production code.
- Keep changes inside this repository; do not modify generated or vendored
  code unless the requirement says so.

## Definition of done

1. The scenario(s) for the requirement pass.
2. `{{TEST_CMD}}` passes.
3. `specgate validate . --strict` passes.
4. The traceability row is updated via `specgate done REQ-NNN`.
