# {{PROJECT_NAME}} — Specification

> Adopted into Spec-Driven Development on an existing codebase (brownfield).
> Every new requirement gets a `## REQ-NNN — <title>` section here, a Gherkin
> scenario under `features/`, and a row in `docs/specs/traceability.md`.
> Existing behaviour is retro-filled requirement by requirement — start with
> the ones your team is actively changing.

## Context

- Domain: {{DOMAIN}}
- Stack: {{STACK}}
- API style: {{API_STYLE}}
- Testing: {{TESTING}}

## Requirements

## REQ-001 — Existing behaviour is preserved

The adopted codebase keeps working: the full test suite passes on every
change. This requirement anchors the traceability matrix until real
requirements are retro-filled from the existing code and tests.
{{PROPOSED_REQUIREMENTS}}
