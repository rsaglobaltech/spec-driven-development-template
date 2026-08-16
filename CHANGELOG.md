# Changelog

Notable changes, newest first. Follows [Keep a Changelog](https://keepachangelog.com/)
and [Semantic Versioning](https://semver.org/).

The release process is in [`docs/release-process.md`](docs/release-process.md).

## [0.2.0] — 2026-08-16

Three months of work that never shipped. `0.1.4` went to npm in May and the
change lifecycle, SpecOps contribution loop, agent contract, artefact schemas
and brownfield onboarding have all landed since.

### ⚠️ Breaking

- **Command JSON output is camelCase throughout.** `plan`, `status`, `report`,
  `studio`, `pack infer` and `harness run` emitted `schema_version` and
  `project_dir` alongside nested camelCase keys — `studio` managed both in one
  document. ADR-0017 fixes camelCase, so they are normalised: `schemaVersion`,
  `projectDir`, `nextSteps`, `orphanFeatures`, `nextCommand`, `implementedPct`,
  `byCategory`, `needsTest`, `baselinePresent`.

  **On-disk formats are unaffected.** `pack.yaml` keeps `schema_version` and
  `.specops.lock` keeps `pack_id` and `specops_version` — those are file
  schemas, not command output, and renaming them would break every existing
  pack and lockfile.

  If you parse `plan --format json`, update those key names. The flag itself
  still works; `--json` is now accepted everywhere as the shorter spelling.

- **`csda --help` shows eight commands, not twenty-one.** The full surface is
  behind `--help --all`, or set it as the default with
  `csda config set profile full`.

### Added

- **Change lifecycle** — `csda change new | list | show | status | validate |
  archive`. Modify a spec that already shipped through a reviewable delta.
  Archiving merges it into the spec tree, writes the traceability rows and
  materialises the feature files.
- **`csda change instructions <artifact>`** — the single context engine.
  Returns the template, the rules the validator enforces, the project's stack
  and what writing the artefact unblocks. `harness run` and the generated slash
  commands both consume it.
- **`csda agents init`** — slash commands and instruction files for Claude
  Code, Cursor, Copilot, Windsurf, Aider, Gemini, Cline and Codex, from one
  definition.
- **`csda onboard`** — reads an existing repository and proposes the
  capabilities its layout already implies, with the evidence for each.
- **`csda schema which | init | fork | validate`** — the artefact graph a
  change follows is now configurable. Ships `spec-driven` and `bdd-first`.
- **`csda update`** — three-way merges generated files after a CLI upgrade,
  preserving local edits and reporting conflicts rather than resolving them.
- **`csda init --from-pack <repo>@<tag>`** — scaffold and install a pinned pack
  in one step. An unpinned reference is refused.
- **`csda req`, `csda status`, `csda fix`, `csda studio`, `csda config`,
  `csda completion`** — the daily loop, recovered from an unmerged branch.
- **`specops diff --as-change`** — review a pack version bump as intent rather
  than as a file diff. **`specops contribute`** sends a local change back
  upstream. **`validate --against-lock`** fails CI on drift from the locked
  version.
- **`csda adopt`, `csda doctor`, `csda report`, `csda ci init`,
  `csda alm sync`** — brownfield adoption, diagnostics, an HTML coverage
  dashboard, CI gate generation for four providers, and Jira / Azure Boards
  synchronisation.
- **Maven and Gradle plugins**, an official Docker image, air-gapped pack
  bundles, pack integrity digests, and monorepo validation.
- **Language context** — `csda config set language es|pt`. Generated prose
  follows it; `SHALL`, `GIVEN`/`WHEN`/`THEN` and the section headings never do.
- **Language server** (`packages/lsp-spec-driven`) and an IntelliJ scaffold.
- **`docs/specs/agent-contract.md`** — generated from the source, with CI
  failing when it drifts.

### Fixed

- **`csda change archive` deleted user content.** It rebuilt `traceability.md`
  from its rows alone, discarding every other section of the file — the
  non-functional requirements, test inventories and notes — and reported
  success. It now replaces only the matrix table.
- **`validate` scanned `node_modules/`**, so any project with dependencies
  installed hit false placeholder findings from template libraries. It also
  flagged `.tpl` files, which are unrendered by definition. Both fixed, and the
  scan is now shared with `doctor`, which had drifted into reporting 64 false
  positives.
- **`DOCKER_SUPPORT=false` left an orphaned devcontainer** pointing at the
  `docker-compose.yml` that `init` had just deleted.
- **The coverage gate never enforced anything** — `c8` was missing
  `--check-coverage`, so the declared thresholds were decorative.
- **`doctor` reported every archived requirement as a stale matrix row**,
  because it compared against root `spec.md` alone and did not know about
  `docs/specs/capabilities/`.
- Windows CI ran unit tests only; it now runs the full suite. The Gradle plugin
  failed `validatePlugins` on Gradle 9. The Pages deploy had been broken since
  the TypeScript migration.

### Changed

- `docs/` is reorganised into task guides, none over 300 lines. The README is
  121 lines, down from 397. `docs/tutorial.md` deliberately stays long: it is
  one narrative, and splitting it would make it worse.
- `validate` diagnostics carry stable snake_case codes and a `fix`, and
  `--strict-tdd` emits one diagnostic per violation instead of a prose block.

## [0.1.4] — 2026-05-15

Harness prompt prefix, `harness prompt`, audit log, and the bootstrap document.

## [0.1.0-beta.1] — 2026-05-06

First tagged pre-release.
