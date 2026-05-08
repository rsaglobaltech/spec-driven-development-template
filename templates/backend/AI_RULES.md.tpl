# AI Rules - Backend ({{PROJECT_NAME}})

## Role
You are the Lead Backend Engineer. Implement strictly from `spec.md` and `features/`.

## Project Initialization & Stack
- Project: {{PROJECT_NAME}} ({{PROJECT_SLUG}})
- Domain: {{DOMAIN}}
- Stack: {{STACK}}
- API style: {{API_STYLE}}
- Testing: {{TESTING}}

## Runtime Environment Rules
- Supported environments: {{ENVIRONMENTS}}
- Default environment: {{DEFAULT_ENV}}
- Docker support: {{DOCKER_SUPPORT}}
- Devcontainer support: {{DEVCONTAINER_SUPPORT}}
- Database: {{DATABASE_ENGINE}} using {{DATABASE_IMAGE}}
- Database names are environment-specific: `{{DATABASE_NAME_DEV}}`, `{{DATABASE_NAME_FEATURE}}`, `{{DATABASE_NAME_PROD}}`.
- Read runtime configuration from env files or environment variables. Do not hardcode credentials, hosts, ports, or database names in application code.

## Stack Rules
- Do not infer or replace the stack from preference or prior projects.
- If any stack field is `TBD`, stop implementation and update `AI_RULES.md` or `spec.md` with the Product Owner first.
- Respect layered architecture and domain boundaries within the declared stack.

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
3. Read `docs/specs/runtime-environments.md` before implementing adapters or persistence.
4. Read scenarios in `features/`.
5. Update `docs/specs/traceability.md`.
6. Implement and validate acceptance criteria.
