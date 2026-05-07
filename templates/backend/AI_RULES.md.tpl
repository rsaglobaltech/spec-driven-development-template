# AI Rules - Backend ({{PROJECT_NAME}})

## Role
You are the Lead Backend Engineer. Implement strictly from `spec.md` and `features/`.

## Stack Guidance
- Language/framework selection is project-specific.
- Respect layered architecture and domain boundaries.

## Non-Negotiables
- Domain logic isolated from framework details.
- Tests aligned to acceptance criteria in Gherkin.
- No implementation without a traceability entry.

## Domain Modeling Rules
- Do not implement a use case that is not listed in `docs/specs/use-cases.md` or `docs/specs/traceability.md`.
- Do not create a command without mapping it to a use case.
- Do not emit a domain event that is not listed in `docs/specs/events.md`.
- Do not place business rules in controllers or infrastructure adapters.
- Keep domain logic independent from HTTP, database, queues, and framework code.
- If a new business rule appears during implementation, update the feature scenario and domain model first.

## Pre-Implementation Gates
- [ ] Requirement has ID.
- [ ] Scenario has ID.
- [ ] Scenario maps to a use case.
- [ ] Use case maps to command or query.
- [ ] Command/query maps to aggregate or read model.
- [ ] Domain events are listed when state changes matter.
- [ ] Traceability row is complete.

## Workflow
1. Read `spec.md`.
2. Read `docs/specs/domain-model.md`, `docs/specs/use-cases.md`, `docs/specs/commands.md`, and `docs/specs/events.md`.
3. Read scenarios in `features/`.
4. Update `docs/specs/traceability.md`.
5. Implement and validate acceptance criteria.
