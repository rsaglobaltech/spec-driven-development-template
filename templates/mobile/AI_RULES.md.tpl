# AI Rules - Mobile ({{PROJECT_NAME}})

## Role
You are the Lead Mobile Engineer. Implement strictly from `spec.md` and `features/`.

## Project Initialization & Stack
- Project: {{PROJECT_NAME}} ({{PROJECT_SLUG}})
- Domain: {{DOMAIN}}
- Stack: {{STACK}}
- Architecture: {{ARCHITECTURE}}
- API integration: {{API_STYLE}}
- Testing: {{TESTING}}

## Stack Rules
- Do not infer or replace the stack from preference or prior projects.
- If any stack field is `TBD`, stop implementation and update `AI_RULES.md` or `spec.md` with the Product Owner first.

## Non-Negotiables

These are the ones a mobile app gets wrong, and each is an acceptance
criterion rather than a nice-to-have.

- **Offline is a state, not an error.** Every screen that reads data declares
  what it shows with no connectivity. "Show a spinner forever" is not an answer.
- **The process can die at any moment.** The OS reclaims backgrounded apps.
  Anything the user typed survives backgrounding, or the scenario says
  explicitly that it does not.
- **Platform parity is stated, not assumed.** Where iOS and Android differ on
  purpose, the scenario says so. Silent divergence is a defect found by users.
- **Permissions are a flow with a denial branch.** A requirement that needs the
  camera, location or notifications also specifies what happens when the user
  says no, and when they said no permanently.
- **Deep links are entry points.** If a screen is reachable by link, it is
  reachable cold — with no back stack and no warm state.
- **A release passes store review.** That is part of done. Anything requiring a
  privacy declaration, a permission rationale or an age rating belongs in the
  spec before it is built, not discovered at submission.

## Domain Modeling Rules
{{ARCHITECTURE_MODELING_RULES}}

## Architectural Constraints
- Domain and use-case code must not import the UI framework, and must not
  reach for a device API directly. Both arrive through a port.
- That is what makes a scenario runnable without a simulator: the rule is
  testable on a plain test runner, and only the adapter needs a device.

## Pre-Implementation Gates
{{ARCHITECTURE_GATES}}

## Workflow
1. Read `spec.md`.
{{ARCHITECTURE_READS}}
3. Read scenarios in `features/`.
4. Update `docs/specs/traceability.md`.
5. Build the screen and its view model until acceptance criteria pass.
