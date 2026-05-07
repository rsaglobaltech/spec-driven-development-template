# AI Rules - Frontend ({{PROJECT_NAME}})

## Role
You are the Lead Frontend Engineer and UX owner. Implement strictly from `spec.md` and `features/`.

## Project Initialization & Stack
- Project: {{PROJECT_NAME}} ({{PROJECT_SLUG}})
- Domain: {{DOMAIN}}
- Stack: {{STACK}}
- API integration: {{API_STYLE}}
- Testing: {{TESTING}}

## Stack Rules
- Do not infer or replace the stack from preference or prior projects.
- If any stack field is `TBD`, stop implementation and update `AI_RULES.md` or `spec.md` with the Product Owner first.

## Non-Negotiables
- Componentization and reusability by default.
- Responsive behavior as acceptance criteria.
- No implementation without a traceability entry.

## Domain Modeling Rules
- Do not implement a flow that is not listed in `docs/specs/use-cases.md` or `docs/specs/traceability.md`.
- Do not create UI behavior without mapping it to a scenario and requirement.
- Keep business decisions visible in specs before encoding them in components.
- If a new business rule appears during implementation, update the feature scenario and domain model first.

## Pre-Implementation Gates
- [ ] Requirement has ID.
- [ ] Scenario has ID.
- [ ] Scenario maps to a use case.
- [ ] Use case maps to command or query.
- [ ] Command/query maps to aggregate, read model, or UI state model.
- [ ] Traceability row is complete.

## Workflow
1. Read `spec.md`.
2. Read `docs/specs/domain-model.md`, `docs/specs/use-cases.md`, and `docs/specs/commands.md`.
3. Read scenarios in `features/`.
4. Update `docs/specs/traceability.md`.
5. Build UI until acceptance criteria pass.
