# Changelog

Notable changes, newest first. Follows [Keep a Changelog](https://keepachangelog.com/)
and [Semantic Versioning](https://semver.org/).

The release process is in [`docs/release-process.md`](docs/release-process.md).

## [Unreleased]

### ⚠️ Breaking

- **The Node floor is 22.** `package.json` declares `>=22`, and CI tests 22 and
  24 across Linux, macOS and Windows — the floor and the current LTS, so a break
  at either end shows up.

  Node 20 left LTS maintenance in April 2026, so the matrix was testing against
  an unsupported runtime and proving nothing. An `npx` invocation that used to
  work and now refuses to run is breaking, whatever else this were called.

  Raised everywhere at once rather than only where it was noticed: the root
  `engines`, the three publishable packages (which still said `>=18`), every
  workflow's `setup-node`, the Docker image, the CI templates handed to users,
  and the prose in the README and the guides.

  **The policy is now written down**: the floor is a maintained LTS, and when
  one leaves maintenance the floor moves in the next release. See
  `docs/release-process.md`.

### Changed

- **`@cucumber/cucumber` 13.** It had been parked for a release because its
  `engines` wanted Node 22 while ours said 20 — the concrete cost of a stale
  floor. The BDD suite passes unchanged.

### Added

- **A test holds the floor in one piece.** It checks the root `engines`, every
  publishable package, each workflow, the CI matrix covering the floor itself,
  the Dockerfile, the templates generated for users, the prose in four guides,
  and that cucumber's own requirement is satisfied. Those had drifted before —
  the packages said 18 while the CLI needed 20 — and a floor only some places
  agree on is not a floor.

## [0.3.0] — 2026-08-17

### ⚠️ Breaking

- **`plan --json` and `report --json` now use camelCase inside `requirements`.**
  `0.2.0` announced the camelCase rename as a breaking change and applied it to
  the top-level keys only. The nested `requirements` array — the one array an
  agent actually iterates — kept `scenario_id`, `feature_file`,
  `technical_artifact`, `test_artifact`, `feature_exists`, `technical_exists`
  and `test_exists`. They are now `scenarioId`, `featureFile`,
  `technicalArtifact`, `testArtifact`, `featureExists`, `technicalExists` and
  `testExists`.

  Half-applied was the worst of the three options: the contract document said
  camelCase, the output disagreed, and nothing failed. The row objects keep
  snake_case internally — that is the matrix's own column vocabulary — so the
  rename happens at the emit boundary only.

  `summary` and `byCategory` are still keyed by the category enum
  (`NEEDS_IMPLEMENTATION` and friends). Those are values, not field names.

### Changed

- **One pack format, with `schemas/pack.schema.json` as its authority**
  ([ADR-0020](docs/specs/adr/0020-pack-format-standard.md)). The schema, the
  validator, the installer, `pack init` and every shipped pack had drifted into
  three descriptions that disagreed, and nothing compared them. The result:
  **all eleven curated packs failed to install**, `pack init` generated packs
  the installer refused, and `pack lint` called every one of them clean.

  - `outputs.features` is gone; `outputs.files` is the only output shape.
  - Domain invariants move from `rules` to a new **`business_rules`**. `rules`
    keeps its narrow meaning — how the pack renders. Two different ideas were
    sharing one key, and that collision is what broke installation.
  - A scenario now requires only what the installer needs: `id`,
    `requirement_id`, `target`, `template`, `feature`, `scenario`, `status`.
    `use_case`, `command`, `aggregate`, `events`, `technical_artifacts` and
    `test_artifact` are optional and validated when present, so a front-end
    pack no longer has to invent a command to satisfy a validator.
  - **`contracts` is a supported project type.** It was in the schema and in
    `pack init` while the installer rejected it outright.

  **No pack that ever installed stops installing.** Every change is a
  relaxation or an addition: the scenario rules got looser, `business_rules`
  and `contracts` are new, and `outputs.features` was never implemented by
  anything. Verified against eight packs authored outside this repository, all
  on `schema_version` 1.1.0 — every one still installs untouched. What needs
  migrating is the shape that never worked, and `pack lint` now names exactly
  what is wrong with it.


- **The CLI is called `csda` in every place it is a command.** The package
  ships two binaries — `create-spec-driven-app` and the `csda` alias — and the
  two were used interchangeably, so the same command appeared under different
  names depending on which guide or which `--help` you landed on. 92
  occurrences across 38 files now use the alias: usage strings, docblocks,
  guides, templates and the landing page.

  **Nothing about invocation changed.** Both binaries still work, and the
  bootstrap line is deliberately untouched: `npx create-spec-driven-app@latest`
  runs before anything is installed, at which point `csda` does not yet exist.
  npm links, the package name and file paths keep the long name too, as does
  `completion`, which registers both binaries on purpose.

  A guard scans the docs and sources so it cannot drift back.

### Added

- **`mobile` is a first-class `PROJECT_TYPE`**, and a pack flavour. Building a
  mobile app previously meant declaring `frontend` and setting the stack, so the
  type recorded in the generated project was untrue and the AI rules it
  inherited talked about responsive behaviour and route navigation.

  `templates/mobile/AI_RULES.md.tpl` is not a copy of the front-end one. It
  states as acceptance criteria the things a mobile app actually gets wrong:
  offline is a state rather than an error, the OS can kill the process at any
  moment, iOS/Android divergence is declared rather than assumed, a permission
  is a flow with a denial branch, deep links are cold entry points, and passing
  store review is part of done. The baseline scenario is a cold start that needs
  no network, not a request to `/`.

  A test pins all four places that list project types — `init`, the wizard,
  `pack init` and the JSON Schema enum — because a type accepted by one and
  refused by another is how `contracts` became scaffoldable and impossible to
  install.

- **`agent_profile` in `harness.config.yaml`**, resolved from
  `.harness/profiles.yaml`. A team commits the agent commands it uses — local,
  CI, a different vendor — and each environment picks one by name, instead of
  committing a single default somebody pays for by accident. An explicit
  `agent:` wins over a profile.

  It comes from a real pilot that was already configured this way: the file
  declared `agent_profile: local-claude` with a matching `profiles.yaml`, the
  CLI read neither, and `harness run` reported "No agent configured" while the
  config plainly declared one.

- **An unknown key in `harness.config.yaml` is now an error.** That silent
  shrug is what let the above go unnoticed. A key nobody reads is worse than a
  missing one, because the file looks configured.

- **Supply-chain documentation and a licence gate.** `docs/supply-chain.md`
  covers pack pinning, the content digest that catches a moved tag, GPG
  signing, and both air-gapped paths — `CSDA_OFFLINE=1` against the cache and
  `pack bundle` for a network that has never seen the pack. `CSDA_OFFLINE`
  appeared in no guide before, so a feature built for closed networks was
  invisible to anyone on one.

  A CycloneDX SBOM is generated on every push and retained 90 days, and
  `scripts/license_check.ts` fails the build on a licence outside an allow-list
  of permissive terms. Both come from `npm sbom` rather than a third-party
  generator — adding a dependency to document having none would be a poor trade.
  Available locally as `npm run sbom` and `npm run licenses`.

- **Pack drift is checked by default in generated CI.** `csda ci init` emits
  `validate --against-lock` for GitHub, GitLab, Azure and Jenkins, guarded on
  `.specops.lock` existing so a project without packs is unaffected.

  Signature verification stays opt-in. `require_signed_packs: true` as a default
  would fail every project installing a pack whose tags are unsigned, and a
  default that fails on correct usage teaches people to switch the check off.

- **Compatibility windows are enforced, not just described.** `pack.yaml`'s
  `schema_version` and `.specops.lock`'s `specops_version` were both written by
  the CLI and read by nothing, so a file from a newer version was accepted and
  then misread field by field. Both now fail up front, naming the versions and
  the upgrade command. Older files still load — only *newer than this CLI* is
  refused.

- **`SECURITY.md`, `MAINTAINERS.md` and `CODEOWNERS`**, with private
  vulnerability reporting enabled so the policy points at a channel that
  exists. `main` is protected with required checks. Approving reviews are
  deliberately off while there is one maintainer — requiring one would make
  `main` unmergeable — and that exception is written down rather than left to
  look like an oversight.

- **Running the gate with no Node on the build agent** is documented in
  `docs/automation.md`: a pinned `ghcr.io/rsaglobaltech/csda` image as a GitLab
  job image or Jenkins docker agent, and the Maven plugin bound to the `verify`
  phase. The generated configs all call `npx`, which a Java shop's agent does
  not have — the reason the image and the plugins exist in the first place.

- **`csda harness init`** — scaffolds `harness.config.yaml` and
  `.harness/prompt-prefix.md`. The config was documented in the tutorial and
  named in `harness run`'s own error message long before anything created it,
  so every project hand-copied it out of a guide.

  It detects the gate from whichever build file is present (`package.json`,
  `pom.xml`, Gradle, Cargo, Go, Python) and **leaves `test_cmd` commented out
  when it cannot tell**. That absence is the point: `test_cmd` is an extra gate
  on top of the `validate --strict-tdd` the harness always runs, so an unset
  key is safe, while a placeholder like `echo "set this"` exits 0 and would let
  the harness mark requirements done without running a single test.

  `agent:` is left unset too. Which agent runs the loop is the operator's
  choice and their credentials, and a default in a committed file is a default
  somebody pays for by accident.

- **`pack lint` runs the installer's own validation.** "Lint passes" now means
  "this pack can be installed". It previously checked cross-references only, so
  a pack that could never be applied reported clean.
- **`pack init` produces an installable pack**, including the template files
  its `pack.yaml` declares. It used to write `pack.yaml` alone, so the pack it
  generated failed at the very next step it told you to run.
- **`--json` on `pack lint` and `specops diff`**, completing the agent
  contract. `specops diff` already had `--format json`; it now accepts `--json`
  and emits camelCase like everything else.
- **`parseYamlLite` understands inline flow sequences** (`[Invoice, Payment]`).
  The curated packs used them 54 times, and each one parsed as a literal string
  and then failed a cross-reference check against an aggregate nobody declared.
- **A test installs every pack in `packs/` into a scaffolded project.** Nothing
  exercised those packs before — not CI, not a test — which is why the drift
  went unnoticed for as long as it did.

- **`csda init --no-sample-req`**, implied by `--from-pack`. `init` seeds
  REQ-000 with a health scenario so a new project has one worked example; a
  domain pack installed afterwards brings its own requirements, often including
  its own health one, and `include_existing_rows` carries the starter forward
  beside them. The result was two requirements describing the same thing —
  found by dogfooding, where the studio app ended up with REQ-000 and the
  pack's REQ-015 both about deployment health.

  `--from-pack` knows a pack is coming and skips the starter. A plain `init`
  cannot know, so **`doctor` now reports the leftover** with the row to delete.
  It stays quiet when no pack is installed, and when the row has been filled in
  — an adapted REQ-000 belongs to the project, not to the scaffold.

- **`--json` on `report`, `fix` and `req list`.** Twelve commands now honour
  the agent contract, which is the figure `docs/agents.md` had been claiming.
  `report --json` is shorthand for `--format json --stdout`; `fix --json`
  requires `--yes` or `--dry-run`, because prompting an agent that never writes
  to stdin is a hang rather than a question.
- **`tests/unit/json-contract.test.ts`** — runs all twelve against a real
  scaffolded project and asserts one parseable document on stdout, a `status`
  array, and no snake_case field names at any depth.

### Fixed

- **Every harness prompt read "(none declared)".** `harness run` feeds the
  prompt builder by shelling out to `plan --format json`, so the camelCase
  rename above landed on one side of that seam only: the scenario, feature
  file and both artefacts came out blank, and no Gherkin was inlined. The
  builder now accepts both spellings, and a test scaffolds a project, asks the
  real CLI for its plan and feeds the first requirement to the real builder.

  It went unnoticed because the builder's unit fixture was written in the old
  vocabulary and pinned a shape `plan` no longer produces.

- **`init` plus a domain pack produced two requirements for the same thing.**
  The scaffold seeds REQ-000 with a health scenario; a pack installed afterwards
  brings its own, and `include_existing_rows` carried the starter forward beside
  it. `--from-pack` now skips the starter, and `doctor` reports the leftover for
  the plain `init` path — staying quiet when no pack is installed, and when the
  row has been filled in.

- **`req list --json` printed the human table and ignored the flag.** Worse
  than rejecting it: the caller believes it received a document. Empty matrix
  cells (`-`, `TBD`) now emit as `null` rather than as strings an agent would
  mistake for paths.

## [0.2.1] — 2026-08-16

### Fixed

- **The Docker image is built for arm64 as well as amd64.** `0.2.0` shipped
  amd64 only, so `docker run ghcr.io/rsaglobaltech/csda` — which the README
  tells people to use — failed on every Apple Silicon laptop and every ARM CI
  runner. The workflow needed QEMU alongside buildx to cross-build.

  The 0.2.0 image tag could not be rebuilt in place: re-running a workflow
  against an old tag checks out the workflow *as it was at that tag*, which did
  not yet have the fix. Hence a patch release rather than moving a published
  tag.

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

- **`csda --help` shows nine commands, not twenty-four.** (This entry said
  "eight, not twenty-one" until the numbers were counted in August 2026.) The
  full surface is
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
