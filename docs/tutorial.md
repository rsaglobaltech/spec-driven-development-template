# 🚗 End-to-end tutorial — building **Smart Parking** with `create-spec-driven-app`

This tutorial walks the **entire** CLI, one command at a time, by building a
real backend project — **Smart Parking** — on top of the public demo pack
[`rsaglobaltech/parking-management-specops`](https://github.com/rsaglobaltech/parking-management-specops).

By the end you will have used every command the tool ships:

`init` · `expand` · `validate` · `plan` · `done` ·
`pack init` · `pack lint` · `pack lint --graph` · `pack infer` ·
`specops add` · `specops sync` · `specops diff` · `specops remove` ·
`harness run`

…and you will know **how to add new requirements** — both as a project
consumer and as a pack author.

> **Conventions**
>
> - `csda` is the short alias for `create-spec-driven-app`. If you have not
>   installed it globally, replace every `csda` with
>   `npx create-spec-driven-app@latest`.
> - Commands are run from inside the project tree unless noted — the project
>   root is auto-detected (`spec.md` / `.specops.lock` are the sentinels).

---

## Table of contents

1. [The mental model](#1-the-mental-model)
2. [Prerequisites](#2-prerequisites)
3. [Step 1 — Scaffold the project (`init`)](#3-step-1--scaffold-the-project-init)
4. [Step 2 — Apply the domain pack (`specops add`)](#4-step-2--apply-the-domain-pack-specops-add)
5. [Step 3 — Validate the project (`validate`)](#5-step-3--validate-the-project-validate)
6. [Step 4 — See what's left (`plan`)](#6-step-4--see-whats-left-plan)
7. [Step 5 — Implement a requirement and close the loop (`done`)](#7-step-5--implement-a-requirement-and-close-the-loop-done)
8. [Step 6 — Add a NEW requirement as a project consumer](#8-step-6--add-a-new-requirement-as-a-project-consumer)
9. [Step 7 — Keep the pack in sync (`specops diff` + `specops sync`)](#9-step-7--keep-the-pack-in-sync-specops-diff--specops-sync)
10. [Step 8 — Remove a pack (`specops remove`)](#10-step-8--remove-a-pack-specops-remove)
11. [Step 9 — Author your own pack (`pack init` · `pack lint` · `pack lint --graph` · `pack infer`)](#11-step-9--author-your-own-pack)
12. [Step 10 — Add a NEW requirement as a pack author](#12-step-10--add-a-new-requirement-as-a-pack-author)
13. [Step 11 — Automate delivery with the harness (`harness run`)](#13-step-11--automate-delivery-with-the-harness-harness-run)
14. [Step 12 — Companion tooling (VS Code · MCP)](#14-step-12--companion-tooling)
15. [Command cheat-sheet](#15-command-cheat-sheet)

---

## 1. The mental model

Three repositories, three lifecycles:

```text
create-spec-driven-app           the tool          (you install this)
parking-management-specops       the domain pack   (versioned knowledge)
smart-parking                    the implementation (the code you build)
```

- The **tool** scaffolds and validates.
- A **domain pack** is a versioned `pack.yaml` that encodes a reusable domain
  model — requirements, use cases, commands, aggregates, events, and the
  Gherkin scenarios that pin them down.
- Your **implementation project** consumes a pack the way an app consumes an
  npm dependency: pinned to a version, recorded in a lockfile, re-syncable.

The thread that ties code to specs is **`docs/specs/traceability.md`** — a
matrix mapping every requirement to its scenario, artifacts and status.
`plan`, `done` and `validate` all read and write that matrix.

---

## 2. Prerequisites

- **Node.js ≥ 20** and **git** on your `PATH`.
- Network access for the first `specops add` (it clones the pack repo into a
  per-user cache; later runs are offline).
- Optionally install the CLI globally so `csda` works:

```bash
npm install -g create-spec-driven-app@latest
csda --version          # 0.1.2
csda --help             # the full command list
```

---

## 3. Step 1 — Scaffold the project (`init`)

`init` generates an empty-but-valid spec-driven project from a config file.

```bash
mkdir -p ~/sandbox && cd ~/sandbox

cat > smart-parking.config <<'EOF'
# Required
PROJECT_NAME="Smart Parking"
PROJECT_SLUG="smart-parking"
PROJECT_TYPE="backend"          # backend | frontend
DOMAIN="parking operations"
STACK="Quarkus 3.x, Java 21, PostgreSQL, RESTEasy Reactive, Maven"
API_STYLE="REST with DTO boundaries"
TESTING="JUnit 5, Testcontainers, Cucumber"

# Optional
LANG="en"
MODULES=""                      # e.g. "auth,billing"
EOF

csda init --config ./smart-parking.config --out .
cd smart-parking
```

**Flags:** `--force` (overwrite an existing target), `--dry-run` (print
actions, write nothing), `--no-git` (skip `git init`).

**What you get:**

```text
smart-parking/
├── spec.md                       # the requirements document
├── AI_RULES.md                   # stack guardrails for AI agents
├── README.md
├── features/                     # Gherkin scenarios live here
└── docs/specs/
    ├── traceability.md           # the requirement ↔ code matrix
    └── adr/
```

The scaffold ships with one placeholder requirement so the project is valid
from the first commit.

---

## 4. Step 2 — Apply the domain pack (`specops add`)

`specops add` layers a domain pack onto the project — the npm-install of
spec-driven development. It clones the pack, renders its templates into your
project, and records the source in `.specops.lock`.

```bash
csda specops add \
  --pack-repo https://github.com/rsaglobaltech/parking-management-specops.git \
  --pack-version v0.1.0 \
  --pack backend \
  --var PROJECT_NAME="Smart Parking" \
  --var PROJECT_SLUG=smart-parking \
  --var DOMAIN="parking operations"
```

**What happens:**

- The pack is cloned into `~/.cache/csda/packs/…` (pinned to tag `v0.1.0`).
- New `.feature` files appear under `features/` (vehicle entry, capacity
  threshold, billing, overstay, receipts…).
- `docs/specs/traceability.md` gains a row per scenario.
- Rich DDD docs are written: `docs/specs/{use-cases,aggregates,commands,events,domain-model}.md`.
- `.specops.lock` records the **repo, version, resolved commit, and the
  `--var` values** — so you never retype them.
- `.specops/baseline/…` stores a verbatim copy of what the pack rendered.
  This is the merge base that makes `specops sync` safe (see Step 7).

> **Commit `.specops.lock` and `.specops/`.** A fresh clone needs both for
> the next `specops sync` to work.

**Useful flags:** `--dry-run`, `--no-examples` (skip files marked
`seed: true` — good for production projects), `--cache-dir <path>`,
`--pack-root <path>` (use a local pack directory instead of a git repo).

> **Lower-level alternative — `expand`.** `specops add` is a thin, ergonomic
> wrapper. `expand` does the same rendering with explicit flags and is what
> `sync` calls under the hood:
>
> ```bash
> csda expand --pack-repo <url> --pack-version v0.1.0 --pack backend \
>   --project-dir . --var PROJECT_NAME="Smart Parking" --var PROJECT_SLUG=smart-parking \
>   --var DOMAIN="parking operations"
> ```
>
> Use `specops add` day-to-day; reach for `expand` only when scripting
> something unusual.

---

## 5. Step 3 — Validate the project (`validate`)

`validate` checks structural integrity: required files and directories, at
least one `.feature`, every feature referenced in the matrix, valid status
values, and well-formed Gherkin.

```bash
csda validate .
```

A clean run prints `Validation passed` and a feature count.

### The TDD gate — `--strict-tdd`

`--strict-tdd` adds enforcement that the matrix cannot run ahead of reality:

```bash
csda validate . --strict-tdd
```

It additionally fails when:

- a row has a `TBD` test artifact but a non-`Draft` status (`[TDD-1]`),
- a row has a status but no Scenario ID (`[TDD-2]`),
- a `REQ-NNN` mentioned in `spec.md` has no row in `traceability.md` (`[TDD-3]`).

Wire `validate --strict-tdd` into CI and a pre-commit hook — it is the gate
that keeps specs and code honest.

---

## 6. Step 4 — See what's left (`plan`)

`plan` reads `traceability.md` plus the filesystem and tells you, per
requirement, what is missing — feature file, test, production code, or just
a status update.

```bash
csda plan
```

```text
📋 Plan  (5 requirements, 5 pending)

  ⚠️  Test missing (write the test first)
    REQ-001   SCN-001
      ✓ feature: features/capacity/capacity_threshold.feature
      · test:    capacity_threshold.steps
      · code:    Occupancy monitor
  …
```

Buckets: `NEEDS_FEATURE`, `NEEDS_EVERYTHING`, `NEEDS_TEST`,
`NEEDS_IMPLEMENTATION`, `NEEDS_STATUS_UPDATE`, `DONE`.

### Machine-readable mode — for AI agents and CI

```bash
csda plan --format json
```

Emits a stable structure (`schema_version`, `summary`, `next_steps[]`,
`requirements[]`, `orphan_features[]`). This is the task queue the
`harness` consumes in Step 11.

---

## 7. Step 5 — Implement a requirement and close the loop (`done`)

Pick the first pending requirement from `plan`. The loop is always:

1. **Read** the `.feature` file — it is the executable spec.
2. **Write the test** so it fails for the right reason (TDD).
3. **Write the production code** until the test passes.
4. **Close the loop** with `done`.

```bash
# After the test + code for REQ-001 exist and pass:
csda done REQ-001 --check
```

`done` flips the requirement's `Status` cell in `traceability.md` to
`Implemented`. `--check` runs `validate` first and aborts on failure, so the
matrix never moves ahead of the gates. `--strict` runs `validate --strict-tdd`
instead. `--status <Status>` targets a different terminal state
(`Verified`, `Released`, …).

Re-run `csda plan` — `REQ-001` is now under **✅ Done**.

---

## 8. Step 6 — Add a NEW requirement as a project consumer

This is the everyday case: the pack covers the domain, but **your** project
needs something extra — say, _"operators can reserve a parking spot in
advance."_ You add it locally, in your project, without touching the pack.

### 8.1 Describe it in `spec.md`

Add a section to `spec.md`:

```markdown
## REQ-101 — Reserve a parking spot in advance

An operator can reserve a specific spot for a future time window so a
known vehicle is guaranteed space on arrival.
```

Use an ID range that will not collide with the pack (the pack uses
`REQ-001…`; your project-local requirements can start at `REQ-101`).

### 8.2 Write the Gherkin scenario first

```bash
mkdir -p features/reservations
cat > features/reservations/reserve_spot.feature <<'EOF'
@REQ-101
Feature: Reserve a parking spot

  Scenario: Reserving an available spot for a future window
    Given spot "A-12" is free between "09:00" and "11:00"
    When an operator reserves spot "A-12" for that window
    Then spot "A-12" is marked "Reserved" for that window
    And a "SpotReserved" event is emitted
EOF
```

### 8.3 Add the traceability row

Append a row to `docs/specs/traceability.md` using the **rich** header
(`| Requirement | Scenario ID | Feature file | Use Case | Command/Query |
Aggregate | Event | Technical artifact | Test artifact | Status |`):

```text
| REQ-101 | SCN-101 | `features/reservations/reserve_spot.feature` | UC-101 | ReserveSpotCommand | ParkingFacility | SpotReserved | ReservationService.java | ReservationServiceTest | Draft |
```

### 8.4 Validate, plan, implement, close

```bash
csda validate . --strict-tdd     # REQ-101 is wired in correctly
csda plan                        # REQ-101 shows as NEEDS_TEST / NEEDS_EVERYTHING
# …write ReservationServiceTest, then ReservationService.java…
csda done REQ-101 --strict
```

That is the full add-a-requirement loop: **spec → scenario → matrix row →
validate → plan → implement → done.** Nothing here touches the pack — your
new requirement lives in your project and survives every `specops sync`
(see Step 7), because sync only reconciles files the pack owns.

> Adding a requirement to the **pack itself** — so every consumer gets it —
> is Step 10.

---

## 9. Step 7 — Keep the pack in sync (`specops diff` + `specops sync`)

When the pack publishes a new version (say `v0.2.0`), you decide when to
adopt it.

### 9.1 Preview the change — `specops diff`

```bash
csda specops diff --pack-version v0.2.0
```

```text
── backend @ v0.2.0 (current: v0.1.0) ──
  + features/pricing/dynamic_pricing.feature
  ~ docs/specs/use-cases.md
  ~ docs/specs/traceability.md

  1 added · 2 modified · 9 unchanged
```

`diff` writes **nothing** — it renders the pack at the target version into a
temp directory and compares. `--format json` (alias `--plan`) emits the same
data for tooling.

### 9.2 Apply it — `specops sync`

```bash
csda specops sync --pack-version v0.2.0
```

`sync` re-renders every pack in `.specops.lock` and **three-way merges** the
result into your project. For each file it compares three versions:

- **base** — what the pack rendered last time (`.specops/baseline/`),
- **local** — what is in your project now (possibly hand-edited),
- **incoming** — what the pack renders at the new version.

Per-file outcomes: `added`, `unchanged`, `updated` (you never touched it →
take the new version), `kept` (the pack didn't change it but you did → your
edit is preserved), `merged` (both changed, non-overlapping → merged
cleanly), `CONFLICT` (both changed the same lines → git-style markers
written). Sync **exits non-zero** if any file is left conflicted, so CI
notices.

Flags: `--dry-run` (preview, write nothing), `--force` (pack always wins —
discard local edits), `--abort-on-conflict` (leave conflicting files
untouched instead of writing markers), `--pack <id>` (sync just one pack).

After a sync:

```bash
csda validate . --strict-tdd
csda plan                        # new REQs from the pack show as pending
git add .specops.lock .specops/ docs/ features/
git commit -m "chore: sync parking pack to v0.2.0"
```

> Without `--pack-version`, `csda specops sync` just re-renders everything at
> the **locked** versions — handy after a fresh clone, or to regenerate files
> someone deleted.

---

## 10. Step 8 — Remove a pack (`specops remove`)

```bash
csda specops remove backend
```

`remove` drops the entry from `.specops.lock`. It does **not** delete the
generated files — you may have hand-edited tests pointing at them. Review
with `git status` and delete what you no longer want by hand. `--dry-run`
shows what would be removed.

---

## 11. Step 9 — Author your own pack

Eventually you will want to package **your** domain knowledge as a reusable
pack. Four commands cover the authoring lifecycle.

### 11.1 Scaffold — `pack init`

```bash
cd ~/sandbox
csda pack init --out ./domain-packs --name "Reservations Backend" --type backend
# pack flavours: backend · frontend · contracts
```

This writes `./domain-packs/reservations/backend/pack.yaml` plus a
`templates/` directory.

### 11.2 Lint — `pack lint`

`pack lint` validates a pack beyond the JSON Schema: unique IDs,
cross-reference integrity, and **scenario quality**.

```bash
csda pack lint --pack-root ./domain-packs --pack reservations/backend
```

Scenario-quality rules flag vague or thin Gherkin — a `Scenario Outline`
with no `Examples`, a scenario with no `When`/`Then`, fewer than three
steps, a generic title, vague step language (`works`, `correctly`, `as
expected`, `etc`, `TODO`, `...`), or a `pack.yaml` scenario name that has
drifted from its template title.

```bash
# In CI, and before a pack feeds `harness run`, promote those to errors:
csda pack lint --pack-root ./domain-packs --pack reservations/backend --strict
```

This matters because the pack's scenarios are the **reward signal** for the
harness (Step 11) — weak scenarios let the harness wave through weak code.

### 11.3 See the reference graph — `pack lint --graph`

The hardest part of authoring a pack is keeping the
`REQ → UC → CMD/QUERY/AGG → EVT` cross-references consistent by hand.
`--graph` renders that spine so you can _see_ it:

```bash
# Mermaid (default) — renders natively in GitHub and VS Code
csda pack lint --pack-root ./domain-packs --pack reservations/backend --graph

# Graphviz DOT
csda pack lint --pack-root ./domain-packs --pack reservations/backend --graph --graph-format dot
```

A reference to an ID/name that does not exist becomes a red **missing** node
in the diagram **and** is listed on stderr — and the command exits non-zero,
so `--graph` doubles as a CI link-check.

### 11.4 Invert the flow — `pack infer`

Writing the model first (requirements → use cases → commands → events) and
the scenarios last has a waterfall smell. `pack infer` flips it: write the
`.feature` first, get a proposed `pack.yaml` skeleton back.

```bash
csda pack infer --from ./drafts/reserve_spot.feature
```

It heuristically maps: a `@REQ-NNN` tag → a requirement reference;
`Feature:` name → the use case name; each `When` step → a command; a quoted
PascalCase token in a `Then` step → an event; each `Scenario:` → a
`scenarios[]` entry. Anything it cannot infer is left as an explicit `TODO:`
— a skeleton to review, never a silent guess. Output goes to stdout
(`--format json` for tooling); it never mutates `pack.yaml`.

```bash
# Review, then merge the parts you want:
csda pack infer --from ./drafts/reserve_spot.feature >> domain-packs/reservations/backend/pack.yaml
```

---

## 12. Step 10 — Add a NEW requirement as a pack author

This is the other half of "new requirements": adding one to the **pack** so
every consuming project receives it on the next `specops sync`.

You are now working inside the pack repo (e.g. a clone of
`parking-management-specops`), not the consumer project.

### 12.1 Draft the scenario, then infer the model

```bash
cat > drafts/waitlist.feature <<'EOF'
@REQ-006
Feature: Capacity waitlist

  Scenario: Joining the waitlist when the facility is full
    Given the facility is at full capacity
    When a driver requests entry
    Then the driver is added to the waitlist
    And a "DriverWaitlisted" event is emitted
EOF

csda pack infer --from drafts/waitlist.feature
```

### 12.2 Merge the inferred skeleton into `pack.yaml`

Add the new `requirement`, `use_case`, `command`, `event` and `scenario`
entries to `pack.yaml`, replacing every `TODO:` with real values and fixing
the IDs so they fit the pack's numbering. Add the rendered feature template
under `templates/features/…` and reference it from the scenario's
`template:` / `target:` fields.

### 12.3 Lint — including the graph

```bash
csda pack lint --pack-root . --pack backend --strict
csda pack lint --pack-root . --pack backend --graph
```

`--strict` catches a weak new scenario; `--graph` shows the new
`REQ-006 → UC-006 → … → DriverWaitlisted` spine and shouts if you mistyped a
reference.

### 12.4 Version, tag, publish

```bash
# Bump metadata.version in pack.yaml (e.g. 0.1.0 → 0.2.0), then:
git commit -am "feat: add capacity waitlist (REQ-006)"
git tag v0.2.0
git push --tags
```

### 12.5 Consumers adopt it

Back in `smart-parking`, the new requirement arrives through the normal sync
flow from Step 7:

```bash
csda specops diff --pack-version v0.2.0     # preview: + waitlist feature, ~ matrix
csda specops sync --pack-version v0.2.0     # three-way merge into the project
csda plan                                   # REQ-006 now shows as pending
```

That is the full pack-author loop: **draft scenario → `pack infer` →
merge → `pack lint --strict --graph` → version + tag → consumers
`diff` + `sync`.**

---

## 13. Step 11 — Automate delivery with the harness (`harness run`)

`harness run` is the orchestration layer: it runs the **plan → context →
agent → verify → done** loop for every pending requirement, with no human
copy-pasting prompts.

For each pending requirement, in an isolated `git worktree` on a fresh
`harness/REQ-NNN` branch, it:

1. builds a self-contained prompt (the Gherkin scenario + `AI_RULES.md` +
   the exact artifact paths + any previous failure),
2. shells out to **your** configured agent,
3. gates the result with `validate --strict-tdd` + your test command,
4. on green → `done` + commit; on red → retries, feeding the failure back,
5. emits a pass/fail/attempts report.

It is **vendor-neutral**: the agent is any shell command containing the
`{prompt_file}` placeholder. The harness never merges a branch — a human
reviews and merges `harness/*`.

### 13.1 Configure it

Optionally drop a `harness.config.yaml` at the project root so you do not
retype flags:

```yaml
harness_version: 1
agent: "claude -p < {prompt_file}"
test_cmd: "mvn -q test"
max_attempts: 3
```

### 13.2 Dry-run first

```bash
csda harness run --dry-run
```

`--dry-run` builds and prints the prompt for every pending requirement
without invoking the agent or touching git — inspect what the agent would
receive.

### 13.3 Run it

```bash
# Working tree must be clean — the harness refuses a dirty tree.
csda harness run --agent "claude -p < {prompt_file}" --test-cmd "mvn -q test"
```

```text
── harness report ──
  ✅ REQ-002  pass (1 attempt)   → harness/REQ-002
  ✅ REQ-003  pass (2 attempts)  → harness/REQ-003
  ❌ REQ-004  fail (3 attempts)  → harness/REQ-004
       Gate failed at: test command

  2 passed · 1 failed · 0 skipped
  Review and merge the harness/* branches you trust.
```

**Flags:** `--req REQ-NNN` (limit to specific requirements, repeatable),
`--max-attempts <n>`, `--base-branch <ref>`, `--timeout <seconds>`,
`--keep-worktrees`, `--force` (recreate existing `harness/*` branches),
`--format json`.

The command exits non-zero if any requirement did not pass — so CI can gate
on it.

---

## 14. Step 12 — Companion tooling

### VS Code extension

The `vscode-spec-driven` extension turns the editor into a pack-authoring
surface: live JSON Schema squigglies on `pack.yaml`, **dangling-reference
diagnostics**, **reference-field autocomplete** (offer the IDs/names that
actually exist), **go-to-definition** on a reference, a **CodeLens** showing
how many use cases and scenarios point at each requirement, validate-on-save,
and the **`Spec-Driven: Show Pack Graph`** command — a side-panel Mermaid
render of the pack graph that refreshes as you edit.

### MCP server

The `mcp-spec-driven` server exposes `plan`, `mark_requirement_done`,
`read_spec`, `lint_pack` and friends as MCP tools, so an MCP-aware client
(Claude Desktop, Cursor, Aider) can drive the same loop natively.

---

## 15. Command cheat-sheet

| Command                                                               | What it does                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `csda init --config <f> --out <dir>`                                  | Scaffold a new spec-driven project                                       |
| `csda validate <dir> [--strict-tdd]`                                  | Check structure, traceability, Gherkin; `--strict-tdd` adds the TDD gate |
| `csda expand --pack-repo … --pack-version … --pack …`                 | Low-level pack render (what `sync` calls)                                |
| `csda plan [--format json]`                                           | List requirements still needing work                                     |
| `csda done REQ-NNN [--check\|--strict] [--status …]`                  | Mark a requirement done in the matrix                                    |
| `csda specops add --pack-repo … --pack-version … --pack … --var …`    | Add a pack; writes `.specops.lock` + `.specops/` baseline                |
| `csda specops diff [--pack-version …] [--format json]`                | Preview what a sync would change — writes nothing                        |
| `csda specops sync [--pack-version …] [--force\|--abort-on-conflict]` | Re-render + three-way merge packs into the project                       |
| `csda specops remove <pack-id>`                                       | Drop a pack from `.specops.lock`                                         |
| `csda pack init --out … --name … --type backend\|frontend\|contracts` | Scaffold a pack skeleton                                                 |
| `csda pack lint --pack-root … --pack … [--strict]`                    | Lint a pack: schema, cross-refs, scenario quality                        |
| `csda pack lint … --graph [--graph-format mermaid\|dot]`              | Render the pack reference graph; CI link-check                           |
| `csda pack infer --from <feature> [--format json]`                    | Propose a `pack.yaml` skeleton from a `.feature`                         |
| `csda harness run --agent "… {prompt_file}" [--test-cmd …]`           | Run the plan→agent→verify→done loop per requirement                      |

**The two "add a requirement" loops, side by side:**

|       | As a project consumer (Step 6) | As a pack author (Step 10)                   |
| ----- | ------------------------------ | -------------------------------------------- |
| Where | your project repo              | the pack repo                                |
| 1     | edit `spec.md`                 | draft a `.feature`, run `pack infer`         |
| 2     | write `features/**.feature`    | merge the inferred skeleton into `pack.yaml` |
| 3     | add a row to `traceability.md` | add the feature template under `templates/`  |
| 4     | `validate --strict-tdd`        | `pack lint --strict --graph`                 |
| 5     | `plan` → implement → `done`    | bump version, tag, push                      |
| 6     | survives every `specops sync`  | consumers `specops diff` + `specops sync`    |

---

You have now exercised every command the tool ships. For deeper reference
see [`docs/how-to.md`](./how-to.md), the
[domain-pack format spec](./specs/domain-pack-format.md), the
[SpecOps workflow](./specs/specops.md) and the
[harness spec](./specs/harness.md).
