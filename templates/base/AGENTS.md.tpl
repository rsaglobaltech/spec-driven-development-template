# Agent Manifest — {{PROJECT_NAME}}

> This file helps AI coding agents (Claude, Copilot, Cursor, Aider, etc.)
> understand the structure and constraints of this project.

## Project overview
- **Name**: {{PROJECT_NAME}}
- **Domain**: {{DOMAIN}}
- **Stack**: {{STACK}}
- **API style**: {{API_STYLE}}
- **Testing**: {{TESTING}}

## Specification entry points
| Artefact | Path | Purpose |
|---|---|---|
| Root spec | `spec.md` | Vision, requirements, bounded contexts, risks |
| Domain model | `docs/specs/domain-model.md` | Aggregates, bounded contexts, value objects |
| Traceability | `docs/specs/traceability.md` | REQ → Scenario → UC → Aggregate → test |
| AI guardrails | `AI_RULES.md` | Stack constraints and conventions for this project |
| ADRs | `docs/specs/adr/` | Architecture decision records |

## Constraints
- **Always read `AI_RULES.md` before writing any code.** It specifies the exact stack, conventions and forbidden patterns.
- **Always check `docs/specs/traceability.md`** before claiming a requirement is implemented.
- **Do not implement features not linked to a requirement** in `spec.md`.
- **Run `npx create-spec-driven-app validate .`** after any change to `docs/specs/` or `features/`.

## Quality gates
A change is considered complete only when:
1. `npx create-spec-driven-app validate .` exits 0.
2. All Gherkin scenarios linked to the changed requirement are passing.
3. The traceability matrix is updated to reflect the new status.
