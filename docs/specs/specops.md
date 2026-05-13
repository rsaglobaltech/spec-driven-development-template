# SpecOps Workflow

**Status:** Stable (M1 — remote packs + lockfile, M2 — `sync` and `diff`)
**Owner:** create-spec-driven-app
**Companion ADRs:** [ADR-0009](./adr/0009-specops-remote-packs.md), [ADR-0010](./adr/0010-specops-sync-diff.md)

This page documents how `create-spec-driven-app` consumes a **versioned
domain pack repository** ("SpecOps repo") into an implementation project.
It is the day-to-day workflow for teams that maintain their domain
knowledge in Git, separately from the code that implements it.

## TL;DR

```bash
npx create-spec-driven-app expand \
  --pack-repo https://github.com/rsaglobaltech/parking-management-specops.git \
  --pack-version v0.1.0 \
  --pack backend \
  --project-dir ./smart-parking \
  --var PROJECT_NAME="Smart Parking" \
  --var PROJECT_SLUG=smart-parking \
  --var DOMAIN="parking operations"
```

The CLI clones the pack into a per-user cache, runs the normal `expand`
pipeline against the resolved local path, then writes
`./smart-parking/.specops.lock` recording the exact commit consumed.

## The three repos

```text
create-spec-driven-app          → the tool       (this repo)
parking-management-specops      → domain pack    (versioned knowledge)
smart-parking                   → implementation (the actual code)
```

Each has a different lifecycle:

| Piece | Changes when… |
|---|---|
| **Tool** | the CLI gains features or fixes |
| **Pack** | the domain evolves (new requirements, scenarios, events) |
| **Implementation** | features are built |

The pack is consumed by tagged version, exactly like an npm dependency.

## Flag reference

`expand` now has two mutually-exclusive sources for the pack:

| Flag | Use when |
|---|---|
| `--pack-root <local-dir>` | The pack lives next to the project (monorepo) or has been cloned manually |
| `--pack-repo <git-url> --pack-version <tag>` | The pack lives in its own Git repo and is consumed by tagged version |

`--pack-version` accepts a tag or a commit SHA. Tags are recommended;
commits are useful when pinning to a specific revision.

Additional flags:

- `--cache-dir <path>` — override the default cache location
  (`~/.cache/csda/packs/`). Mainly useful for CI/tests.

## `.specops.lock`

After a successful (non–dry-run) `expand --pack-repo …`, the CLI writes a
lockfile to the project root:

```json
{
  "specops_version": 1,
  "csda_version": "0.1.0-beta.4",
  "packs": [
    {
      "repo":        "https://github.com/rsaglobaltech/parking-management-specops.git",
      "version":     "v0.1.0",
      "commit":      "c37fbcb1a2…",
      "pack_id":     "backend",
      "expanded_at": "2026-05-12T18:30:00.000Z",
      "vars": {
        "PROJECT_NAME": "Smart Parking",
        "PROJECT_SLUG": "smart-parking",
        "DOMAIN":       "parking operations"
      }
    }
  ]
}
```

**Properties:**

- One entry per `(repo, pack_id)` pair. Re-expanding the same pack
  upgrades the entry in place.
- Multiple packs in the same project are supported (e.g. a backend pack
  plus a frontend pack).
- Sorted deterministically by `repo` then `pack_id` so diffs are stable.
- The `vars` block records the substitution values used at expand time,
  so `specops sync` can reproduce the exact same output without the user
  re-typing every `--var KEY=VALUE`.

**Convention:** commit `.specops.lock` to your project repository.

## `specops sync`

Re-expands every pack listed in `.specops.lock` — useful after re-cloning
the project, after manually editing generated files, or to bump a pack to
a new version without re-typing the original flags.

```bash
# Re-expand everything at the locked versions
npx create-spec-driven-app specops sync --project-dir ./smart-parking

# Bump only one pack to a new tag (updates the lockfile)
npx create-spec-driven-app specops sync \
  --project-dir ./smart-parking \
  --pack parking-management/backend \
  --pack-version v0.2.0

# Preview without writing anything
npx create-spec-driven-app specops sync --project-dir ./smart-parking --dry-run
```

Behaviour:

- Reads `.specops.lock` from `--project-dir` (defaults to `.`).
- For each entry (or the one matching `--pack`), calls `expand` with
  `--pack-repo`, `--pack-version`, `--pack`, `--project-dir`, and every
  `--var KEY=VALUE` from the locked `vars` block.
- Use `--pack-version` to override the locked version; the lockfile is
  rewritten with the new tag + commit.
- Exits non-zero if no lockfile is found or `--pack` does not match.

## `specops diff`

Reports the files that would change if `specops sync` ran at the chosen
version — without writing anything to the project.

```bash
# What would change if I bumped to v0.2.0?
npx create-spec-driven-app specops diff \
  --project-dir ./smart-parking \
  --pack-version v0.2.0
```

Output:

```text
── parking-management/backend @ v0.2.0 (current: v0.1.0) ──
  + features/pricing/dynamic_pricing.feature
  ~ docs/specs/use-cases.md
  ~ docs/specs/traceability.md

  1 added · 2 modified · 9 unchanged

ℹ️ [INFO] Diff completed for 1 pack(s).
```

Legend:

- `+ path` — file would be added (does not exist in the project today)
- `~ path` — file exists but its content would change

Files present in the project but not generated by the pack (your own
source code) are never reported.

## Caching

Resolved packs are cached under
`~/.cache/csda/packs/<sha256(repo)[:16]>/<safe-version>/`. The cache key
hashes the repo URL so different repos with the same tag never collide.
A `.git` directory inside the slot signals "already cloned"; subsequent
runs reuse it without network traffic.

To force a re-clone, delete the cache slot:

```bash
rm -rf ~/.cache/csda/packs
```

## End-to-end example: `smart-parking`

Given the public reference pack at
[`rsaglobaltech/parking-management-specops`](https://github.com/rsaglobaltech/parking-management-specops)
(currently at tag `v0.1.0`):

```bash
# 1. Scaffold the implementation project
mkdir -p ~/dev/smart-parking && cd ~/dev/smart-parking
cat > project.config <<'CFG'
PROJECT_NAME="Smart Parking"
PROJECT_SLUG="smart-parking"
PROJECT_TYPE="backend"
DOMAIN="parking operations"
STACK="Quarkus 3.x, Java 21, PostgreSQL"
API_STYLE="REST + GraphQL"
TESTING="JUnit 5, Cucumber, Testcontainers"
LANG="en"
MODULES=""
CFG

npx create-spec-driven-app init --config ./project.config --out . --force

# 2. Expand the pack into it (writes .specops.lock)
npx create-spec-driven-app expand \
  --pack-repo https://github.com/rsaglobaltech/parking-management-specops.git \
  --pack-version v0.1.0 \
  --pack backend \
  --project-dir ./smart-parking \
  --var PROJECT_NAME="Smart Parking" \
  --var PROJECT_SLUG=smart-parking \
  --var DOMAIN="parking operations"

# 3. Verify
npx create-spec-driven-app validate ./smart-parking
cat smart-parking/.specops.lock
```

## Upgrading a project to a new pack version

When the pack tags a new version (`v0.2.0`), bump the project:

```bash
npx create-spec-driven-app expand \
  --pack-repo https://github.com/rsaglobaltech/parking-management-specops.git \
  --pack-version v0.2.0 \
  --pack backend \
  --project-dir ./smart-parking \
  --var PROJECT_NAME="Smart Parking" \
  --var PROJECT_SLUG=smart-parking \
  --var DOMAIN="parking operations"
```

The lockfile entry is updated in place, and the generated specs (`spec.md`,
`docs/specs/traceability.md`, etc.) re-render. Commit the diff to capture
what changed in the pack since the last sync.

## Roadmap

Shipped:

- **M1** — remote packs + `.specops.lock`
- **M2** — `specops sync` + `specops diff`

Planned:

- `validate --against-lock` — fail in CI if the project has drifted from
  the locked pack version (uses the same diff machinery as `specops
  diff`, just exits non-zero on any difference).
- Multi-pack composition helpers — apply several packs from one config
  file without re-typing each invocation.

## Limitations

- `git` must be available on `PATH` when using `--pack-repo`. The CLI
  detects this and exits cleanly with a message if not.
- Force-moved tags upstream are not detected automatically; the cache
  must be cleared manually to re-fetch.
- Private repos are supported when the user's git is already configured
  for them (SSH keys, credential helpers, etc.). The CLI does not handle
  authentication directly.
