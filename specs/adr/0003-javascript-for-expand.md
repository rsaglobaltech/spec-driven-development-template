# ADR-0003: Use JavaScript (Node.js) for the domain-pack expansion engine

**Date:** 2024-01-15  
**Status:** Accepted  
**Deciders:** Core maintainers

---

## Context

The `expand` command parses a structured YAML file (`pack.yaml`) with cross-references, renders multiple output templates, validates referential integrity, and builds a traceability matrix. This logic is too complex for shell scripting.

## Decision

Implement `scripts/expand_domain_pack.js` and `scripts/domain-pack/common.js` in Node.js (CommonJS).

## Rationale

| Criterion | JavaScript | Python | Go |
|---|---|---|---|
| Already required (Node ≥ 18) | ✅ | ❌ extra runtime | ❌ extra runtime |
| YAML parsing | Via custom lite parser | `pyyaml` | `gopkg.in/yaml.v3` |
| Template rendering | String replace / regex | Jinja2 | `text/template` |
| Unit-testable with `node:test` | ✅ | ❌ | ❌ |
| Cross-platform | ✅ | ✅ | ✅ |

Using Node.js keeps the toolchain homogeneous (one runtime, one `npm install`) and allows `common.js` to be unit-tested directly in the same test run as the rest of the codebase.

## Consequences

- **Positive:** Single runtime; `common.js` is fully unit-testable; shared with future `pack init` and `pack lint` commands.
- **Negative:** The custom YAML parser (`parseYamlLite`) handles a subset of YAML; complex anchors/aliases are not supported. A migration to `js-yaml` is tracked as a Phase 3 item.
- **Neutral:** The mixed Bash/JS boundary is explicitly documented and will be eliminated when `init` migrates to Node (ADR-0006).
