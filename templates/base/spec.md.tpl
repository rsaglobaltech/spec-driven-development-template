# Spec: {{PROJECT_NAME}}

## 1. Product context
{{PROJECT_NAME}} operates in the **{{DOMAIN}}** domain and follows a Spec-Driven Development approach.

## 2. Target users
- Primary users:
- Secondary users:
- Internal stakeholders:

## 3. Main objective
Define functional requirements, domain language, and acceptance criteria clearly before writing implementation code.

## 4. In scope
- Core workflows for the first release.
- Acceptance criteria for externally visible behavior.
- Traceability from requirements to scenarios, domain model, implementation, and tests.

## 5. Out of scope
- Features that are not mapped to requirements or scenarios.
- Infrastructure decisions that do not affect the initial implementation.
- Premature workflow, microservice, CQRS, or Event Sourcing complexity.

## 6. Success criteria
- Every business feature has traceable Gherkin scenarios.
- Every scenario maps to a requirement and a technical artifact.
- Domain terminology is captured before implementation starts.
- The team can reuse this structure in new projects.

## 7. Initial bounded contexts
- Core Domain: central business rules.
- Supporting Domain: integrations and reporting.
- Generic Domain: identity, auditing, and notifications.

## 8. Key requirements

<!--
  Add requirements with `csda req add "<what the requirement does>"`, which
  writes the row here **and** in docs/specs/traceability.md at the same time.

  Do not hand-write a row here alone. A requirement that exists in this file and
  not in the matrix fails `csda validate --strict-tdd` with [TDD-3], and the
  table below is the one a generated project used to ship pre-filled with an
  example — so every new project was born with a red gate (H20).
-->

| ID | Requirement | Priority | Status |
|---|---|---|---|

## 9. Non-functional requirements
| ID | Requirement | Quality attribute | Status |
|---|---|---|---|
| NFR-001 | Define the first measurable non-functional requirement. | Reliability | Draft |

## 10. Risks and open questions
| ID | Topic | Impact | Owner | Status |
|---|---|---|---|---|
| RISK-001 | Capture the first domain, delivery, or architecture risk. | Medium | TBD | Draft |

## 11. Domain language
| Term | Meaning | Notes |
|---|---|---|
| Example term | Define the term using business language. | Replace with project language. |
