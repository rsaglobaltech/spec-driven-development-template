# ADR-0007: Flip Default `init` Engine to Node.js

**Date:** 2026-05-12
**Status:** Accepted
**Depends on:** [ADR-0006 — Node.js Engine for init](0006-node-engine-for-init.md)

## Context

ADR-0006 introduced `--engine=node` as an opt-in alongside the existing Bash engine.
After parity tests confirmed identical output (same top-level file structure, same
`validate` pass rate across ubuntu, macOS, and Windows), the Node engine is mature
enough to become the default.

Keeping Bash as the default would:
- Require all users to install Bash (problematic on Windows).
- Split maintainer attention indefinitely between two code paths.
- Contradict the direction toward a fully JavaScript-native CLI.

## Decision

The `init` command now uses the Node.js engine (`scripts/init_project.js`) by default.
Users who explicitly pass `--engine=shell` continue to get the Bash engine, but a
deprecation warning is printed to stderr:

```
⚠️ [WARN] --engine=shell is deprecated and will be removed in a future release.
```

The Bash script (`scripts/new_spec_project.sh`) is **not deleted** in this release —
it remains available via `--engine=shell` for users who depend on it in existing
pipelines. It will be removed in a subsequent major version.

## Consequences

**Positive:**
- Cross-platform by default: Windows, Linux, macOS work without Bash.
- Single primary code path to maintain going forward.
- All existing tests pass without modification (BDD, E2E, unit, parity).

**Negative:**
- Users who relied on the Bash engine implicitly will see a no-op change (same output),
  but any Bash-specific edge case would now surface.
- The deprecation warning may appear in CI logs until pipelines are updated to drop
  `--engine=shell`.

## Migration

Remove `--engine=shell` (or `--engine=node`) from any explicit invocations — neither
flag is needed anymore. The Node engine is the default.
