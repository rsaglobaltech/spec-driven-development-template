# ADR-0010: SpecOps — `sync` and `diff` Commands

**Date:** 2026-05-12
**Status:** Accepted
**Depends on:** [ADR-0009 — SpecOps Remote Packs](0009-specops-remote-packs.md)

## Context

ADR-0009 added remote pack consumption and `.specops.lock`. After that
shipped, the natural next questions are:

1. **"My project got cloned to a new machine — how do I rebuild the
   generated artefacts?"** Today the user has to re-type every
   `--pack-repo`, `--pack-version`, `--pack`, `--project-dir`, and every
   `--var` — even though every flag is already recorded in
   `.specops.lock`. That's friction with no value.
2. **"The pack tagged v0.2.0 upstream — what would change in my project
   if I upgraded?"** Today the user has to expand into a scratch
   directory by hand and run `diff -r` themselves. The lockfile carries
   exactly enough information to automate this.

Both questions are about applying the lockfile rather than the lockfile
itself; the lockfile spec from ADR-0009 needs no further breaking
changes to support them.

## Decision

Add two subcommands under a new top-level `specops` namespace:

```text
create-spec-driven-app specops sync [--project-dir <path>] [--pack <pack-id>] [--pack-version <tag>] [--cache-dir <path>] [--dry-run]
create-spec-driven-app specops diff [--project-dir <path>] [--pack <pack-id>] [--pack-version <tag>] [--cache-dir <path>]
```

`sync` reads `.specops.lock`, iterates the `packs[]` array, and for each
entry shells out to `expand` with every flag that was originally typed —
now sourced from the lockfile, including `--var KEY=VALUE` pairs.
`--pack-version` overrides the locked version (and rewrites the
lockfile); `--pack` narrows the operation to a single entry; `--dry-run`
is forwarded to `expand`.

`diff` is the read-only counterpart. For each entry it expands into a
temporary directory, walks that directory, and compares every generated
file to the project copy:

- File missing from project → reported as `+ path` (added).
- File present, content differs → reported as `~ path` (modified).
- File present, content identical → counted as `unchanged`.
- Files in the project that the pack does not generate (user-authored
  source code, custom configs) are never reported.

Both commands depend on the M1 invariant that the lockfile is the source
of truth for "how was this project expanded".

### Lockfile schema change: persist `vars`

M1 wrote `repo`, `version`, `commit`, `pack_id`, `expanded_at`. M2 adds:

```json
"vars": { "PROJECT_NAME": "Smart Parking", "PROJECT_SLUG": "smart-parking", … }
```

`vars` records the substitution values used at expand time. Without it
`sync` could not reproduce the original output (the `--var` arguments
were never persisted). Backwards-compatible: lockfiles without `vars`
are still readable — `sync` simply forwards an empty set, which works
when the pack has no required vars.

### Why a new top-level command (`specops`) rather than extending `expand`

`expand` is the primitive: take a pack source + vars + project dir,
write files. `specops` is the composer: read the lockfile and orchestrate
one or more `expand` invocations.

Keeping them separate means each command stays small and has one job.
`expand` doesn't need to know what a lockfile is; `specops sync` doesn't
duplicate any of expand's logic.

## Consequences

**Positive:**

- A fresh clone of a project becomes reproducible with a single
  command: `specops sync`.
- Upgrading a pack to a new tag is a two-step audit trail:
  `specops diff --pack-version v0.2.0` to preview, then `specops sync
  --pack-version v0.2.0` to apply.
- The `walkFiles` + `diffDirs` helpers in `scripts/specops/diff.js` are
  reusable: `validate --against-lock` (future work) can use exactly the
  same machinery, just changing the exit code policy.
- No new runtime dependency beyond what M1 already required (`git`
  reachable on `PATH`).

**Negative / accepted trade-offs:**

- `diff` actually executes `expand` into a temporary directory rather
  than reasoning about pack content. That's a small cost (10s of files,
  sub-second on local clones) in exchange for a guaranteed-accurate
  diff: whatever `expand` would write is exactly what we compare.
- `sync` always re-runs expand for every locked pack, even when nothing
  changed. Acceptable today; if pack lists grow, a future ADR can add
  per-pack caching keyed off the commit SHA.

## Rejected alternatives

- **Parse `--dry-run` output to compute the diff.** Cleaner — no temp
  files — but ties the diff to the wording of `[dry-run] write` log
  lines and makes content comparison impossible.
- **Embed `sync` and `diff` inside `expand`.** Considered briefly: would
  bloat `expand`'s flag surface (everything would need an
  `--all-from-lock` mode). Composition wins.
- **Exit non-zero when `diff` finds changes (like `prettier --check`).**
  Rejected as the default because `diff` is a "show me" tool, not a
  validation gate. A future `validate --against-lock` flag will provide
  the CI-friendly exit code.

## References

- Workflow page: [`specops.md`](../specops.md)
- Module: `scripts/specops/sync.js`
- Module: `scripts/specops/diff.js`
- Foundational ADR: [ADR-0009](0009-specops-remote-packs.md)
