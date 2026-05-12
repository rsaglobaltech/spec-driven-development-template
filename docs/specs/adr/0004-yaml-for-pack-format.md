# ADR-0004: Use YAML as the domain-pack format

**Date:** 2024-01-15  
**Status:** Accepted  
**Deciders:** Core maintainers

---

## Context

Domain packs need a human-authored, machine-readable format that can express nested structures (bounded contexts, aggregates, events, scenarios with cross-references). Options considered: YAML, JSON, TOML, custom DSL.

## Decision

Use YAML with a versioned schema (`schema_version: "1.1.0"`), validated against a JSON Schema at `schemas/pack.schema.json`.

## Rationale

| Criterion | YAML | JSON | TOML |
|---|---|---|---|
| Human readable/writable | ✅ | Acceptable | ✅ |
| Multi-line strings | ✅ `|` blocks | ❌ verbose | ✅ |
| Comments | ✅ `#` | ❌ | ✅ |
| Nested arrays of objects | ✅ | ✅ | Awkward |
| Editor tooling (LSP) | ✅ `yaml-language-server` | ✅ | Limited |
| JSON Schema validation | ✅ via ajv | ✅ native | ❌ |

YAML's comment support is important for domain pack authors who want to annotate their model. The `yaml-language-server` `$schema` header enables editor autocompletion from the JSON Schema (ADR context: Phase 1 P1-04).

## Consequences

- **Positive:** Familiar to engineers; supports comments; `yaml-language-server` gives free IDE autocompletion.
- **Negative:** YAML has footguns (Norway problem, implicit types). Mitigated by the JSON Schema enforcing explicit types and the custom `parseYamlLite` parser treating all unquoted scalars as strings by default unless they match `true/false/null/number`.
- **Neutral:** The `$schema` comment line is the canonical way to link a pack to the schema; the CLI does not enforce its presence but validates the content regardless.
