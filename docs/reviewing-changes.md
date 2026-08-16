# Reviewing changes

How to modify a spec that already shipped, without the matrix and the
feature files drifting apart.

---

## Change a requirement that already shipped

**Goal:** modify the spec tree of a live project without the matrix, the specs
and the feature files drifting apart. Recipes 2–3 cover writing requirements on
day one; this is the loop for every day after.

### 1. Open the change

```bash
csda change new add-dynamic-pricing
```

```
  ✔ Change add-dynamic-pricing created (lite · REQ ids REQ-014…REQ-016 reserved)

    + docs/specs/changes/add-dynamic-pricing/change.yaml
    + docs/specs/changes/add-dynamic-pricing/proposal.md
    + docs/specs/changes/add-dynamic-pricing/tasks.md
```

The reserved ID range is written into `change.yaml`, so two changes in flight
never hand out the same `REQ-NNN`. Use `--full` instead of the default `--lite`
when the change also needs a `design.md` and contract artefacts.

### 2. Let the tool tell you what to write next

```bash
csda change status
```

```
  add-dynamic-pricing (spec-driven)

    ✔ proposal   proposal.md
    ▶ specs      specs/**/spec.md
    — design     design.md
    ✔ tasks      tasks.md

  Next
    → Write specs/**/spec.md
```

Artefacts are a dependency graph, not a phase gate (ADR-0018): `▶` is what is
ready to write, `—` is not applicable at this rigor level. Nothing blocks you
from writing them out of order.

### 3. Write the delta

Only what moves — never a copy of the whole spec. One file per capability
under `specs/<capability>/spec.md`:

```markdown
# Delta — pricing

## ADDED Requirements

### Requirement: REQ-014 — Dynamic peak pricing

The system SHALL raise the tariff automatically when occupancy crosses a
configured threshold.

#### Scenario: SCN-014 — Peak rate applies above the threshold

- GIVEN occupancy is above 85%
- WHEN a vehicle enters
- THEN the peak tariff is applied

<!-- csda:trace uc=UC-007 cmd=CMD-011 agg=AGG-Pricing evt=EVT-PriceApplied
     feature=features/pricing/dynamic_pricing.feature -->
```

Three sections are valid: `## ADDED Requirements`, `## MODIFIED Requirements`,
`## REMOVED Requirements`. `MODIFIED` replaces the whole requirement block — it
does not merge scenario by scenario.

Two things the validator is strict about:

- **Steps are plain `- GIVEN` bullets.** `- **GIVEN**` fails with
  `scenario_not_gherkin`, because the keyword has to start the line.
- **The body needs an RFC-2119 keyword** (`SHALL` / `MUST` / `SHOULD` / `MAY`),
  otherwise you get `no_rfc2119_keyword`. A requirement that states no
  obligation is not a requirement.

The `csda:trace` comment is optional — it is the bridge to the DDD matrix.
Without it the requirement still archives, with `-` in those columns.

### 4. Validate

```bash
csda change validate add-dynamic-pricing
```

```
  ✔ add-dynamic-pricing (1 delta(s))
```

You rarely need to run this by hand: plain `csda validate` validates every
active change, so a broken delta fails the PR gate on its own. A project with
no `docs/specs/changes/` directory is unaffected.

### 5. Archive it

Archiving is the step that earns the ceremony. Preview first:

```bash
csda change archive add-dynamic-pricing --dry-run
```

```
  Archive plan (dry run — nothing written)

    ~ docs/specs/capabilities/pricing/spec.md (spec)
    ~ docs/specs/traceability.md (traceability)
    → docs/specs/changes/add-dynamic-pricing moves to docs/specs/changes/archive/2026-08-16-add-dynamic-pricing
```

Unchecked tasks block it (`archive_tasks_incomplete`); `--force` overrides.
Then apply:

```bash
csda change archive add-dynamic-pricing --yes
```

```
  ✔ Archived as 2026-08-16-add-dynamic-pricing

    specs:        1 added · 0 modified · 0 removed
    traceability: 1 row(s) added · 0 updated · 0 removed
    features:     0 materialised
```

### 6. The requirement is now real work

The archive merged the delta into `docs/specs/capabilities/pricing/spec.md` and
added the matrix row:

```
| REQ-014 | SCN-014 | `features/pricing/dynamic_pricing.feature` | UC-007 | CMD-011 | AGG-Pricing | EVT-PriceApplied | - | TBD | Draft |
```

`csda plan` lists it as pending immediately. It arrives as `Draft`, which
`--strict-tdd` deliberately tolerates — an accepted proposal is not yet a
commitment to have written the test. The gate bites the moment you start:

```bash
# after moving the row's status to In Dev
csda validate . --strict-tdd
```

```
❌ [ERROR] --strict-tdd violations detected:
  [TDD-1] Test artifact is TBD but status is 'In Dev' (scenario: SCN-014)
💡 [FIX] TDD-1: write the test first, then set its path in the row's 'Test artifact' column (or move the status back to Draft).
```

That is the whole point: a merged proposal cannot quietly become undone work.

### It composes with packs

| You want | Command |
| --- | --- |
| Review an upstream pack bump as intent, not as a file diff | `specops diff --as-change --pack-version v0.2.0` |
| Send a local change back upstream to the pack | `specops contribute --change add-dynamic-pricing` |
| Fail CI when the project has drifted from the locked pack | `validate --against-lock` |

See recipe 10 for the version-bump workflow those hook into.

---

---

## Next

- [The agent surface](agents.md)
- [Pack version bumps as changes](domain-packs.md)
