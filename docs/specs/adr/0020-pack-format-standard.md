# ADR-0020 — One pack format, with the JSON Schema as its authority

## Status

Accepted — 2026-08-17

## Context

The domain pack format had drifted into three descriptions that disagreed with
each other, and nothing in the build compared them.

| | `schemas/pack.schema.json` | `expand` / `validatePackModel` | the eleven packs in `packs/` |
| --- | --- | --- | --- |
| Outputs | `outputs.files[]` (target + template) | same | `outputs.features[]` |
| Rules | `rules.traceability{…}` | same | `rules:` as a list of `RUL-*` |
| Scenarios | 14 required fields | 5 required fields | inline `given/when/then` |
| `contracts` type | in the enum | rejected outright | `sample-contracts` uses it |

The consequences were not theoretical. **Every curated pack failed to install**,
with the same error — `outputs.files must contain at least one file
definition`. `csda pack init` generated packs in the same unusable shape, so
the authoring command produced something the installing command refused. And
`pack lint` reported all of them as clean, because it validated cross-
references between requirements and use cases but never the structure the
installer actually requires.

It went unnoticed for as long as it did because nothing exercised `packs/`:
not CI, not a test. Ten packs were advertised in the README as the reason to
adopt the tool, and not one of them could be applied to a project.

The parser had a matching gap: `parseYamlLite` did not understand inline flow
sequences (`aggregates: [Invoice, Payment]`), which the packs used 54 times.
Those parsed as the literal string `"[Invoice]"` and then failed cross-
reference checks against an aggregate nobody had declared.

## Decision

**`schemas/pack.schema.json` is the single authority.** The validator, the
installer, `pack init` and every shipped pack conform to it. Where they
previously disagreed, the schema moved only where it was wrong on the merits.

**1. `outputs.files` is the only output shape.** `outputs.features` was never
implemented by anything and is gone. A capability pack renders a capability
document under `docs/specs/capabilities/`; the feature files come from
`scenarios[]`, which is where they were always meant to come from.

**2. `business_rules` is a first-class collection.** The invariants the packs
carried — *"Invoices are immutable once issued"* — are genuine domain content
and had no home in the schema at all. They now have one, validated for id
shape and a title, and cross-referenced to a bounded context. `rules` keeps
its narrow meaning: how the pack renders. Two different ideas had been sharing
one key, and that is what made every pack uninstallable.

**3. A scenario requires what the installer needs, and no more.** Required:
`id`, `requirement_id`, `target`, `template`, `feature`, `scenario`, `status` —
enough to render the feature file and write the traceability row. Optional but
validated when present: `use_case`, `command`, `aggregate`, `events`,
`technical_artifacts`, `test_artifact`, `seed`.

The old 14-field requirement forced every pack to express full CQRS. A
front-end pack had to invent a command it does not have, which is the kind of
rule that teaches people to write fiction to satisfy a validator.
`technical_artifacts` in particular is now optional on purpose: a pack author
describes a domain, not the caller's implementation. Absent, the matrix renders
`TBD`, which is exactly the gap `plan` reads as `NEEDS_IMPLEMENTATION`.

**4. `contracts` is a supported project type.** It was in the schema and in
`pack init`, and rejected by the installer. API-first delivery is a real
enterprise case and the sample pack already existed, so the installer now
accepts it rather than the schema quietly withdrawing the promise.

**5. Inline flow sequences are valid YAML and now parse as such.**

## Consequences

**The eleven curated packs were migrated**, and they install. The migration was
mechanical: inline scenarios became `target` + `template` pairs with the
Gherkin moved into real `.feature.tpl` files, `rules:` became
`business_rules:`, and the `commands:` blocks were *derived* rather than
invented — every command name and its use-case linkage was already written in
`use_cases:` and had simply never been declared.

**`pack lint` now runs the installer's own validation.** "Lint passes" means
"this pack can be installed". A lint that says yes to a pack nobody can install
is worse than no lint, because it is trusted.

**`pack init` produces an installable pack**, including the template files its
`pack.yaml` declares. It previously wrote `pack.yaml` alone, so the pack it
produced failed at the very next step it told you to run.

**A test installs every pack in `packs/` into a scaffolded project.** This is
the guard that would have caught all of it, and it is the reason the format can
now be trusted to stay coherent.

`PACK_SCHEMA_VERSION` moves to **1.3.0**. Older packs still load — only a
version newer than the CLI understands is refused, which is the compatibility
window ADR set out in `docs/release-process.md`.

## Alternatives considered

**Relax the schema to match the code.** Cheapest, and it would have made the
schema stop describing anything worth validating — the domain linkage would go
unchecked precisely when a pack does declare it.

**Tighten the code to the schema's 14 fields.** Maximum consistency of the
domain model, at the price of forcing every pack into CQRS. Rejected for the
same reason phase gates were rejected in ADR-0018: a rule that does not survive
contact with real work gets satisfied with fiction.

**Drop the business rules while migrating.** Faster, and it would have thrown
away written domain knowledge to avoid adding one key to a schema.
