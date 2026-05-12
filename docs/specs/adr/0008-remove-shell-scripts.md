# ADR-0008: Remove Bash Engine and `validate_specs.sh`

**Date:** 2026-05-12
**Status:** Accepted
**Depends on:** [ADR-0007 — Flip Default Engine to Node.js](0007-flip-default-engine-to-node.md)
**Supersedes (full):** [ADR-0002 — Bash for Init Script](0002-bash-for-init-script.md)

## Context

ADR-0006 introduced a Node.js engine and ADR-0007 made it the default. The Bash
engine has been opt-in (`--engine=shell`) for one release with a deprecation
warning. No bug reports against the deprecation warning have been received in
that window, and the Node engine has full parity (verified by snapshot and
integration tests).

The `validate_specs.sh` script — although small — duplicates logic that the
new Node port (`scripts/validate_specs.js`) already implements identically.
Keeping both indefinitely splits maintenance.

## Decision

Remove the following in this release:

- `scripts/new_spec_project.sh` (Bash init engine)
- `scripts/validate_specs.sh` (Bash validate)
- `tests/shell/new_spec_project.bats` and `tests/shell/env_split.bats`
- The Bats + ShellCheck CI steps
- The deprecation-warning fallback for `--engine=shell` (now exits 2 with a
  clear "removed" message)

Replace with:

- `scripts/validate_specs.js` — Node port of validate, identical exit codes
- The `init` command always uses `scripts/init_project.js`
- `--engine=node` is silently accepted (no-op for backwards compatibility)
- `--engine=shell` exits 2 with a removal notice

## Consequences

**Positive:**

- The CLI is **pure Node.js**. No more Bash, no more `sed`, no more `find`.
- Cross-platform behaviour is now guaranteed by the Node runtime alone.
- CI is faster: no Bats install, no ShellCheck pass.
- The codebase shrinks by ~700 lines of shell.

**Negative:**

- Pipelines that explicitly pass `--engine=shell` will fail with exit 2. The
  fix is to drop the flag (one-character change).
- Anyone who forked the repo to extend the Bash script must port their
  changes to `scripts/init_project.js`.

## Migration

| If your pipeline does… | Change to… |
|---|---|
| `create-spec-driven-app init --engine=shell …` | `create-spec-driven-app init …` |
| `bash scripts/new_spec_project.sh …` | `node scripts/init_project.js …` |
| `bash scripts/validate_specs.sh <dir>` | `node scripts/validate_specs.js <dir>` |
| Calls `create-spec-driven-app validate <dir>` | No change — same interface |

## Rollback plan

The deleted shell scripts remain accessible in git history. To revive them:

```bash
git checkout v0.1.0-beta.3 -- scripts/new_spec_project.sh scripts/validate_specs.sh
```

…and revert the dispatcher changes in `bin/create-spec-driven-app.js`. We do
not anticipate needing this; the Node engine has run in production for one
release without regression.
