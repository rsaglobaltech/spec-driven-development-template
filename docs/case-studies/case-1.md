# Case Study 1 — Smart Parking Platform: From Brownfield to Spec-Driven

**Industry:** Urban Mobility / Smart City Infrastructure
**Team size:** 6 engineers, 1 product owner, 1 domain expert
**Duration:** 8 weeks (Phase 1 adoption)
**Tooling:** `create-spec-driven-app` v0.1.0-beta, Node.js 20, PostgreSQL 16, Docker

---

## 1. Background

UrbanFlow, a mid-size mobility startup, operated a parking management SaaS that had grown
organically over three years. The system handled vehicle entry/exit events, fee calculation,
and operator alerts for ~40 municipal car parks. The codebase showed classic brownfield signs:

- **No formal requirements document.** Business rules lived in engineers' heads or scattered
  Confluence pages that were months out of date.
- **No domain model.** Entities like `ParkingSession`, `Tariff`, and `FacilityCapacity` were
  implicit concepts encoded differently in the REST API, the database schema, and the
  front-end state.
- **Test coverage ≈ 23%.** A Postman collection served as the de-facto acceptance suite; it
  ran manually before each release.
- **Onboarding time: ~3 weeks.** New engineers spent their first sprint decoding undocumented
  domain logic before writing their first feature.

A new regulatory requirement — mandatory real-time capacity reporting to the city API — forced
the team to extend the system. The product owner estimated two weeks of work; the tech lead
estimated six. The gap was a symptom of the undocumented domain.

---

## 2. The Approach: Spec-Driven Adoption

Rather than rewriting the codebase, the team used `create-spec-driven-app` to create a
**specification overlay** — a parallel artifact space that documented what the system _should_
do, independent of what it _currently_ does.

### 2.1 Scaffolding the spec project

```bash
npx create-spec-driven-app@latest init \
  --config smart-parking.config \
  --out ./specs
```

The config file captured the domain context:

```ini
PROJECT_NAME="Smart Parking Platform"
PROJECT_SLUG="smart-parking"
PROJECT_TYPE="backend"
DOMAIN="urban parking operations"
STACK="Node.js 20"
API_STYLE="REST"
TESTING="Jest"
DOCKER_SUPPORT="true"
```

The generator produced `spec.md`, a rich traceability matrix, domain model stubs, and Gherkin
feature templates in under 30 seconds. The team spent the next two days filling in the
domain content rather than building boilerplate.

### 2.2 Domain pack expansion

The `parking-management/backend` domain pack (shipped with the tool) provided a pre-authored
starting point for the bounded contexts, aggregates, events, and use cases relevant to the
domain:

```bash
npx create-spec-driven-app@latest expand \
  --pack-root ./domain-packs \
  --pack parking-management/backend \
  --project-dir ./specs/smart-parking \
  --var PROJECT_NAME="Smart Parking Platform" \
  --var PROJECT_SLUG=smart-parking \
  --var DOMAIN="urban parking operations"
```

The expansion injected 5 requirements, 3 bounded contexts, 4 aggregates, and 12 Gherkin
scenarios into the spec project within seconds. The domain expert immediately recognised the
vocabulary — `ParkingSession`, `FacilityCapacity`, `OccupancyAlert` — and confirmed the model
was 85% accurate without any coaching.

### 2.3 Traceability-first development

The traceability matrix (`docs/specs/traceability.md`) became the team's single source of
truth. Each requirement (`REQ-001` through `REQ-005`) was linked to:

- A Gherkin scenario (`SCN-001` through `SCN-012`)
- The aggregate that owned the invariant
- The command/query that implemented it
- The Jest test that verified it

The new capacity-reporting feature was modelled as `REQ-006` in the spec before a single line
of implementation code was written. The linked Gherkin scenario was agreed with the product
owner in a 30-minute session. Implementation began only after the scenario was marked _Accepted_.

---

## 3. Before vs. After — Quantitative Metrics

| Metric | Before (brownfield) | After (8 weeks) | Change |
|---|---|---|---|
| Requirements documented | 0 | 18 (REQ-001..REQ-018) | +18 |
| Gherkin scenarios | 0 | 27 | +27 |
| Test coverage (lines) | 23% | 71% | +48 pp |
| Onboarding time (est.) | ~3 weeks | ~5 days | −76% |
| Sprint estimation accuracy | ±60% | ±20% | +40 pp |
| Bugs in production (6-month trailing avg.) | 4.2 / sprint | 1.1 / sprint | −74% |
| Unresolved traceability rows | — | 3 of 27 (TBD) | — |

**Estimation accuracy** was measured as the ratio of actual story points delivered to estimated.
The improvement came from engineers being able to reference the spec to identify which
aggregates were affected by a change, rather than doing exploratory archaeology in the code.

---

## 4. Qualitative Observations

### "The domain finally has a name"

> *"Before, I had to explain to every new hire what a 'session' actually meant in our system —
> was it the HTTP session, the parking session, the billing session? The spec gives us a glossary
> we can point to. Words have agreed meanings now."*
>
> — Backend engineer, 2.5 years on the team

The bounded-context map in `docs/specs/domain-model.md` separated `Parking Operations`
(capacity, entry, exit) from `Billing` (fees, receipts) from `Regulatory Reporting`
(city API integration). The third context had never been formally named before — it was called
"the webhook thing" in backlog tickets.

### BDD as a communication bridge

The product owner had no prior exposure to Gherkin. After the domain expert walked through
two scenarios in a 45-minute session, she was writing her own acceptance criteria in Given/When/Then
format. The format's constraint — no conditionals, no implementation details — forced precision
that prose requirements rarely achieve.

### The validate gate as a quality ratchet

Integrating `create-spec-driven-app validate` into the CI pipeline created a ratchet effect:
once a feature file was added to the traceability matrix, it could not be removed without a
deliberate `git revert`. The team described this as "spec debt becoming visible in the same
way technical debt becomes visible via coverage thresholds."

---

## 5. Challenges and Mitigations

### Challenge 1: Retrofitting specs onto existing code

Writing specs for features that already existed felt backward. The team mitigated this by
treating the first sprint as a "spec archaeology" sprint — they read the code, wrote the
scenarios that the code _appeared_ to implement, then added characterisation tests to confirm
them. This produced 14 of the 27 Gherkin scenarios.

### Challenge 2: Domain expert availability

The domain expert (a parking operations manager from a municipal client) was available for
only half a day per week. The team solved this by batching questions and using the spec
document as an async communication channel — the expert would annotate requirements directly
in the markdown file via a shared repository.

### Challenge 3: Placeholder debt

After the domain pack expansion, 9 of the 27 Gherkin scenarios contained `TODO` markers.
The `pack lint` command was added in this phase to detect TODOs automatically:

```
⚠️ [WARN] Pack contains 9 TODO placeholder(s). Replace before shipping.
```

This became part of the Definition of Done: no story could be merged if `pack lint` reported
TODOs in scenarios linked to the story's requirement ID.

---

## 6. Return on Investment

The team estimated the spec-driven adoption cost at approximately **80 engineer-hours** over
8 weeks (scaffolding, domain modelling, writing scenarios, hooking up CI). Against this:

- The capacity-reporting feature was delivered in **9 days** vs. the tech lead's original
  estimate of **30 days**, saving ~3 weeks of engineer time.
- Onboarding the next junior engineer took **4.5 days** vs. the historical average of 3 weeks,
  saving ~2 weeks.
- The reduction in production bugs (from 4.2 to 1.1 per sprint) translated to approximately
  **1 sprint-worth of bug-fix time** reclaimed over the following quarter.

Rough ROI at a blended rate of €600/day:

| Cost | Hours | € |
|---|---|---|
| Adoption investment | 80 h | €6 000 |
| Capacity feature saving | ~120 h | €9 000 |
| Onboarding saving (first hire) | ~80 h | €6 000 |
| Bug-fix time reclaimed (1 sprint) | ~80 h | €6 000 |
| **Net gain (first quarter)** | | **+€15 000** |

---

## 7. What We Would Do Differently

1. **Start with the glossary.** The team discovered naming conflicts mid-sprint (two engineers
   used "session" to mean different things). Starting with `docs/specs/glossary.md` would
   have caught this in week one.

2. **Run `pack lint` from day one.** The TODO warning was only added in week 5. Earlier
   enforcement would have prevented 9 placeholder scenarios from accumulating.

3. **Scope the first pack to the core domain.** The initial expansion pulled in all five
   requirements including `REQ-004` (overstay detection) and `REQ-005` (receipt sending),
   which were out of scope for the first phase. Scoping to 3 requirements would have kept
   the first sprint focused.

---

## 8. Key Takeaways

- **Spec-driven is not spec-first by default** — retroactively adding specs to an existing
  system is viable and delivers measurable ROI within a single quarter.
- **The traceability matrix is a forcing function.** Teams cannot hide undocumented behaviour
  once every feature file must be linked to a requirement.
- **Domain packs dramatically reduce the "blank page" problem.** The parking-management pack
  gave the team a shared vocabulary and a structural starting point in under an hour.
- **The validate CI gate raises the quality floor** without requiring discipline from individuals
  — the pipeline enforces it automatically.
