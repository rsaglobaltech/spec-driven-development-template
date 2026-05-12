# Acme Energy Hub - Spec-Driven Development

This project was generated from the SDD MVP template.

## Context
- Project type: `backend`
- Domain: `community energy`

## Structure
- `spec.md`: business manifesto and goals.
- `AI_RULES.md`: AI execution contract.
- `features/`: acceptance criteria in Gherkin.
- `docs/specs/traceability.md`: requirement -> scenario -> domain -> implementation -> test mapping.
- `docs/specs/domain-model.md`: bounded contexts, aggregates, value objects, and events.
- `docs/specs/use-cases.md`: use cases mapped to requirements and commands/queries.
- `docs/specs/commands.md`: commands and queries expected by the application layer.
- `docs/specs/events.md`: domain events used for meaningful state changes.
- `docs/specs/aggregates.md`: aggregate roots and invariants.
- `docs/specs/status-model.md`: lightweight Unified Process maturity states.
- `docs/specs/review-checklist.md`: pre-implementation and architecture gates.
- `docs/specs/adr/`: architecture decision records.

## Recommended Workflow
1. Define or refine `spec.md`.
2. Refine domain model documents in `docs/specs/`.
3. Adapt scenarios in `features/`.
4. Map scenarios in `docs/specs/traceability.md`.
5. Implement software until acceptance criteria pass.

## Support Command
- Validate spec structure:
  - `../mvp-spec-template/scripts/validate_specs.sh .`
