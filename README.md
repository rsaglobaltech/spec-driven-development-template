<div align="center">

# 🧭 create-spec-driven-app

**A Spec-Driven Development starter — clear requirements, traceability, and acceptance criteria from day one.**

[![CI](https://github.com/rsaglobaltech/spec-driven-development-template/actions/workflows/ci.yml/badge.svg)](https://github.com/rsaglobaltech/spec-driven-development-template/actions/workflows/ci.yml)
[![npm latest](https://img.shields.io/npm/v/create-spec-driven-app?logo=npm&label=npm)](https://www.npmjs.com/package/create-spec-driven-app)
[![npm beta](https://img.shields.io/npm/v/create-spec-driven-app/beta?logo=npm&label=beta)](https://www.npmjs.com/package/create-spec-driven-app)
[![Docs](https://img.shields.io/badge/docs-github_pages-0e8078)](https://rsaglobaltech.github.io/spec-driven-development-template/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#-license)

</div>

> Stop coding before requirements are operationally clear. Treat specs as **first-class, testable, traceable artifacts** — from REQ → Scenario → Domain → Implementation → Test.

---

## ✨ Why

- 🎯 **Clarity first** — business intent is explicit before code.
- 🔗 **Built-in traceability** — every requirement maps to a scenario, command, aggregate, event, and test.
- 🧩 **DDD Lite** — optional domain pack fields for use cases, commands, aggregates, events.
- ✅ **Executable acceptance** — Gherkin scenarios become CI gates.
- 🤖 **AI-ready** — a standardized `AI_RULES.md` keeps coding agents on rails.

## 🆚 How it compares

| Capability                                         | **this** | [spec-kit](https://github.com/github/spec-kit) | [Cursor rules](https://docs.cursor.com/context/rules-for-ai) | [Aider conventions](https://aider.chat/docs/usage/conventions.html) | README only |
| -------------------------------------------------- | :------: | :--------------------------------------------: | :----------------------------------------------------------: | :-----------------------------------------------------------------: | :---------: |
| Scaffolds a versioned repo structure               |    ✅    |                       ✅                       |                              ❌                              |                                 ❌                                  |     ❌      |
| Reusable domain packs (YAML + JSON Schema 2020-12) |    ✅    |                       ⚠️                       |                              ❌                              |                                 ❌                                  |     ❌      |
| DDD-lite artefacts (aggregates, events, commands)  |    ✅    |                       ❌                       |                              ❌                              |                                 ❌                                  |     ❌      |
| Traceability matrix + `validate` CI gate           |    ✅    |                       ⚠️                       |                              ❌                              |                                 ❌                                  |     ❌      |
| Vendor-neutral (Claude · Cursor · Aider · Copilot) |    ✅    |                       ✅                       |                              ❌                              |                                 ✅                                  |     ✅      |
| VS Code extension + MCP server                     |    ✅    |                       ❌                       |                             n/a                              |                                 ❌                                  |     ❌      |

**🧭 What we add:** a **versioned, schema-validated domain pack format** plus a CI-enforced traceability matrix — giving AI agents and humans a shared, drift-proof vocabulary that survives audit trails and refactors. Everything else (`spec-kit`, Cursor, Aider, plain READMEs) optimises for _prompting_; we optimise for _specs as executable contracts_.

→ Full matrix, honest trade-offs, and migration paths in [`docs/comparisons.md`](docs/comparisons.md).

## 🪜 Adopt it one level at a time

You do **not** need to learn the whole tool to get value. Each level is
useful on its own, takes under a day, and never requires understanding the
levels above it:

| Level  | You get                                                  | Commands you need              | Entry cost |
| ------ | -------------------------------------------------------- | ------------------------------ | ---------- |
| **L1** | Traceable specs in your repo (`spec.md`, `features/`, matrix) | `adopt` (or `init`)        | ~1 hour    |
| **L2** | A PR gate that enforces spec/test coverage                | `validate --strict-tdd` in CI  | ~1 hour    |
| **L3** | Versioned, reusable domain requirements                   | `specops add / sync / diff`    | ~1 day     |
| **L4** | Agent-driven delivery, one requirement at a time          | `harness run`                  | ~1 week    |

## ⚡ Quickstart

### Already have a codebase? (the common enterprise case)

```bash
cd your-existing-repo
npx create-spec-driven-app@latest adopt        # detects your stack from pom.xml / gradle / package.json
npx create-spec-driven-app@latest validate .   # passes immediately
```

`adopt` never overwrites existing files and never touches source code. It
generates the SDD skeleton (spec, rules, baseline feature, traceability
matrix) around what you already have — retro-fill real requirements at your
own pace, then add `validate --strict-tdd` to CI (L2).

### Starting from scratch

```bash
npx create-spec-driven-app@latest init         # interactive wizard, sensible defaults
# or non-interactive: init --yes  ·  or from a config file: init --config project.yaml --out ./projects
```

The wizard saves its answers to `project.yaml` inside the generated project,
so the run is reproducible with `init --config`.

Requires **Node.js ≥ 20** — or none at all with the official Docker image
(mirror it into your internal registry for air-gapped runners):

```bash
docker run --rm -v "$PWD:/workspace" ghcr.io/rsaglobaltech/csda validate . --strict-tdd
```

> 📘 **New here?** The **[end-to-end tutorial](docs/tutorial.md)** builds a real
> project (Smart Parking, on the public `parking-management-specops` pack) and
> walks **every** command — including how to add new requirements both as a
> project consumer and as a pack author.

## 🛠️ CLI

| Command                          | What it does                                                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`                           | Scaffold a new spec-driven project (interactive wizard when no `--config`; `--yes` for defaults).                                                                                |
| `adopt`                          | Install SDD on an **existing** repository: detects the stack, generates the spec skeleton, never overwrites files or touches code.                                               |
| `validate`                       | Check structure, traceability and Gherkin coverage. `--strict-tdd` also fails the build when a `REQ` lacks its `.feature`, its executable test, or its row in `traceability.md`. |
| `expand`                         | Apply a domain pack (local path or remote git repo) onto a project (low-level; `specops add` is the ergonomic path).                                                             |
| `plan`                           | List requirements still needing a test, code, or status update. `--format json` for AI agents and CI.                                                                            |
| `done`                           | Mark a requirement `Implemented` in `traceability.md`. `--check` / `--strict` validate first.                                                                                    |
| `status`                         | The daily dashboard: totals by state, orphan features, locked pack versions, and one suggested next command.                                                                     |
| `req`                            | Add, link and close requirements without hand-editing the ten-column matrix: `req add`, `req link`, `req done`, `req list`.                                                       |
| `fix`                            | Apply the repairs `validate` suggests — orphan features, requirements in `spec.md` with no row. `--dry-run` previews.                                                             |
| `change`                         | **Propose, review and archive a change**: `new`, `list`, `show`, `status`, `validate`, `archive`. See the section below.                                                          |
| `doctor`                         | Diagnose the project and environment; every finding ships a concrete fix.                                                                                                        |
| `report`                         | Spec-coverage dashboard as a self-contained HTML file — a CI or Pages artifact.                                                                                                  |
| `ci init` / `alm sync`           | Generate the spec gate for GitHub/GitLab/Azure/Jenkins; sync requirements with Jira or Azure Boards.                                                                              |
| `pack init` / `pack lint`        | Scaffold a pack, or lint it: schema, cross-refs, and scenario quality (`--strict`).                                                                                              |
| `pack lint --graph`              | Render the pack's `REQ→UC→CMD/AGG→EVT` graph (Mermaid/DOT); doubles as a CI link-check.                                                                                          |
| `pack infer`                     | Propose a `pack.yaml` skeleton from a `.feature` file — write the scenario first.                                                                                                |
| `specops add` / `specops remove` | Add a pack (npm-install-style, writes `.specops.lock`) or drop one.                                                                                                              |
| `specops sync` / `specops diff`  | Three-way-merge a project to a locked pack version, or preview the change.                                                                                                       |
| `harness run`                    | Run the plan → agent → verify → done loop for every pending requirement, in isolated git worktrees.                                                                              |
| `harness prompt`                 | Print the exact prompt the harness would hand the agent for one REQ — useful for previewing what the agent sees before paying tokens.                                            |
| `studio`                         | Serve a local, read-only HTML view of the spec tree. `--json` for the same data as a document.                                                                                    |
| `agents init`                    | Wire the loop into Claude, Cursor, Copilot, Windsurf, Aider, Gemini, Cline and Codex — slash commands and instruction files, from one definition.                                 |
| `config init` / `completion`     | Write a starter config; print a bash or zsh completion script.                                                                                                                   |

Full reference: `npx create-spec-driven-app --help` · **[End-to-end tutorial](docs/tutorial.md)** · **[Architecture overview](docs/specs/architecture.md)** · [Documentation site](https://rsaglobaltech.github.io/spec-driven-development-template/)

## ⚙️ Configuration

`init --config` accepts a **YAML mapping** (`.yaml` / `.yml`) or the legacy
`KEY="value"` format (`.config`) — the parser is chosen by file extension.

```yaml
# project.yaml — a flat mapping, same keys either way
PROJECT_NAME: Acme Energy Hub
PROJECT_SLUG: acme-energy-hub
PROJECT_TYPE: backend # backend | frontend | contracts
DOMAIN: community energy
STACK: Quarkus 3.x, Java 21, PostgreSQL
API_STYLE: REST with DTO boundaries
TESTING: JUnit 5, Testcontainers, Cucumber
```

Optional: `LANG`, `MODULES: "auth,dashboard,billing"`. See
[`examples/project.yaml.example`](examples/project.yaml.example) (YAML) or
[`examples/project.config.example`](examples/project.config.example) (legacy).

## 🧪 Domain packs

A pack is a reusable YAML bundle of requirements, use cases, aggregates, events, and Gherkin templates. Add one to a project the npm-install way — `specops add` writes a `.specops.lock` and a `.specops/` baseline so the source, version and variables are remembered:

```bash
npx create-spec-driven-app@latest specops add \
  --pack-repo https://github.com/rsaglobaltech/parking-management-specops.git \
  --pack-version v0.1.0 \
  --pack backend \
  --var PROJECT_NAME="Smart Parking" \
  --var PROJECT_SLUG=smart-parking \
  --var DOMAIN="parking operations"
```

Browse the [curated pack registry](https://rsaglobaltech.github.io/spec-driven-development-template/), build your own with `pack init`, visualise the cross-reference graph with `pack lint --graph`, or scaffold one from a `.feature` with `pack infer`.

### 📜 `contracts` packs

For API-first work, set `project_type: contracts` in the pack. You get `api_contracts` + `consumer_driven_tests` fields, plus a generated `docs/specs/test-strategy.md` that defines explicit TDD gates. Combined with `validate --strict-tdd`, this enforces "no contract without a test" at PR-time. See the [`sample-contracts`](packs/sample-contracts/contracts/pack.yaml) pack for a reference.

### 🔁 Keep packs in sync

`expand` writes a `.specops.lock` that pins each pack to a version and remembers the variables you used. From then on:

```bash
# Preview what changes when bumping to v0.2.0 (no writes)
npx create-spec-driven-app specops diff \
  --project-dir ./smart-parking \
  --pack-version v0.2.0

# Re-expand everything in .specops.lock (no need to retype --var)
npx create-spec-driven-app specops sync --project-dir ./smart-parking

# Bump a single pack and rewrite the lockfile
npx create-spec-driven-app specops sync \
  --project-dir ./smart-parking \
  --pack parking-management/backend \
  --pack-version v0.2.0
```

Sample `diff` output:

```
── parking-management/backend @ v0.2.0 (current: v0.1.0) ──
  + features/pricing/dynamic_pricing.feature
  ~ docs/specs/use-cases.md
  ~ docs/specs/traceability.md
  1 added · 2 modified · 9 unchanged
```

#### Declarative composition with `specops.config.yaml`

Need to compose multiple packs without writing a lockfile by hand? Commit a `specops.config.yaml` at the project root and `specops sync` reads it as the source of truth on the first run:

```yaml
specops_version: 1
packs:
  - repo: https://github.com/acme/parking-specops.git
    version: v0.1.0
    pack_id: backend
    vars:
      PROJECT_NAME: Smart Parking
      DOMAIN: parking operations
  - repo: https://github.com/acme/billing-specops.git
    version: v0.2.0
    pack_id: contracts
    vars:
      PROJECT_NAME: Smart Parking
```

## 🔄 Change a spec that already exists

`init` and `adopt` cover day one. Every day after that, the question is
different: **how do you change a requirement that already shipped, without the
matrix and the feature files drifting apart?**

The answer is a change: a reviewable proposal that lives alongside the specs,
gets validated in CI, and is *archived* — merged into the spec tree — once the
work lands.

```bash
csda change new add-dynamic-pricing      # scaffolds the proposal, deltas and tasks
csda change status                       # what to write next, in dependency order
csda change validate                     # runs automatically inside `csda validate` too
csda change archive add-dynamic-pricing  # merge into the specs, then file it away
```

You describe the change as a **delta** — only what moves, never a copy of the
whole spec:

```markdown
## ADDED Requirements

### Requirement: REQ-014 — Dynamic peak pricing

The system SHALL raise the tariff automatically when occupancy crosses a
configured threshold.

#### Scenario: SCN-014 — Peak rate applies above the threshold

- GIVEN occupancy is above 85%
- WHEN a vehicle enters
- THEN the peak tariff is applied

<!-- csda:trace uc=UC-007 cmd=CMD-011 agg=AGG-Pricing evt=EVT-PriceApplied
     feature=features/pricing/dynamic_pricing.feature -->
```

Steps are plain `- GIVEN` bullets, not `**GIVEN**` — the validator needs the
keyword at the start of the line. The optional `csda:trace` comment is the
bridge to the DDD matrix: without it the requirement still archives, just with
`-` in those columns.

Archiving is where the leverage is. It does not just move a file: it applies
the `ADDED` / `MODIFIED` / `REMOVED` sections to `docs/specs/capabilities/`,
**inserts the new rows into `traceability.md`**, and copies the proposed
`.feature` files into `features/`. The moment the requirement lands, `csda
plan` lists it as pending; set its status to `In Dev` without a test and
`validate --strict-tdd` fails with `[TDD-1]`. A merged proposal cannot quietly
become undone work.

`change.yaml` carries two escape hatches for the cases that do not fit:
`skip_specs: true` for tooling changes with no behavioural impact, and
`retire_capabilities: true` to allow deleting a spec when its last requirement
goes away.

**It composes with packs.** `specops diff --as-change` turns an upstream pack
bump into a change proposal you review as *intent* rather than as a file diff,
and `specops contribute --change <id>` sends a local change back upstream to
the pack. See [Keep packs in sync](#-keep-packs-in-sync).

→ Full reference: [`docs/how-to.md`](docs/how-to.md) · ADRs
[0015](docs/specs/adr/0015-change-lifecycle.md)–[0018](docs/specs/adr/0018-artifact-schemas.md).

## 🧠 Drive it from your agent

Every command speaks JSON. One document on stdout, prose on stderr, a `status`
array of diagnostics that each carry a `fix`, and exit codes that are part of
the contract — so an agent branches on `code`, never on scraped prose.

```bash
csda agents init                    # slash commands + instruction files for 8 tools
csda agents init --tool claude,cursor --dry-run
```

That generates `/csda:explore`, `/csda:propose`, `/csda:apply`, `/csda:verify`,
`/csda:archive` and `/csda:onboard`, plus the instruction file each tool reads
(`.cursor/rules/`, `.github/copilot-instructions.md`, `CONVENTIONS.md`, …).

The generated files are deliberately thin. They do not restate the delta
grammar — a markdown copy of it is stale the moment the grammar moves. They
call the engine instead:

```bash
csda change instructions specs --json
```

which returns the template, the rules the validator actually enforces, the
project's declared stack, the reserved REQ range, and what writing that
artefact unblocks. `harness run` builds its prompt from the same call, so the
agent, the harness and the MCP server cannot disagree about the format.

→ Full contract, code catalogue and exit-code table:
[`docs/specs/agent-contract.md`](docs/specs/agent-contract.md) — generated from
the source, with CI failing when it drifts.

## 🤖 Automate delivery with the harness

A spec-driven repo is already a complete environment for an AI coding agent —
`plan` is the task queue, the feature file + `AI_RULES.md` are the context,
`validate --strict-tdd` is the reward signal, `done` is the state transition.
`harness run` is the orchestration layer:

```bash
npx create-spec-driven-app harness run \
  --agent "claude -p < {prompt_file}" \
  --test-cmd "mvn -q test"
```

For each pending requirement, in an isolated `git worktree` on a fresh
`harness/REQ-NNN` branch, it builds a prompt, shells out to **your** agent
(vendor-neutral — any command with a `{prompt_file}` placeholder), gates the
result with `validate --strict-tdd` + your tests, commits on green, retries on
red, and emits a pass/fail report. It never merges — you review `harness/*`.
See the [harness spec](docs/specs/harness.md).

### 🪄 Day 1 vs day N — bootstrap once, harness from then on

`harness run` implements **one REQ at a time** inside an isolated worktree.
That is great for _iterating_, but it does not bootstrap your project.
Phase 1 — first build manifest, BDD framework wired, hex skeleton, first
bounded context end-to-end — is the only place where you still hand a
freeform prompt to opencode / Claude / Cursor. The complete prompt, ready
to paste, lives at **[`docs/bootstrap-prompt.md`](docs/bootstrap-prompt.md)**.

After Phase 1 is in, the universal directives from that prompt (Role,
Active Project Boundary, Execution Policy) move into
`harness.config.yaml`, where they ride along on every per-REQ harness
invocation without being retyped:

```yaml
# harness.config.yaml at the project root
harness_version: 1
agent: 'opencode run "$(cat {prompt_file})"'
test_cmd: "mvn -B test"
max_attempts: 3
prompt_prefix_file: ./.harness/prompt-prefix.md
```

The `prompt_prefix_file` (or inline `prompt_prefix`) is prepended verbatim
to **every** per-REQ prompt the harness assembles, then a `---` separator,
then the auto-generated facts / Gherkin / AI_RULES / Definition of Done.

### 👀 See what the agent will receive (`harness prompt`)

```bash
csda harness prompt REQ-001
```

Prints the exact prompt — prefix included — without invoking the agent,
creating a worktree, or touching git. Use it to iterate on `AI_RULES.md`
and `prompt_prefix`, or to copy-paste the prompt into a web AI when no
CLI agent is available. Every prompt actually sent during `harness run`
is also mirrored to `.specops/harness-prompts/REQ-NNN-<timestamp>-attempt-N.md`
for after-the-fact audit. Commit or `.gitignore` that folder per your
team's preference.

For the full picture of how the pack, the implementation project, the
bootstrap step and the harness fit together, see
**[`docs/specs/architecture.md`](docs/specs/architecture.md)**.

## 🧰 Companion tools

- 🧠 **MCP server** ([`mcp-spec-driven`](packages/mcp-spec-driven)) — exposes `read_spec`, `plan`, `mark_requirement_done`, `lint_pack` and more to Claude Desktop, Cursor, Aider.
- 🧩 **VS Code extension** ([`vscode-spec-driven`](packages/vscode-spec-driven)) — pack.yaml schema linting, dangling-reference diagnostics, reference autocomplete, go-to-definition, requirement reference counts, validate-on-save, and a Mermaid **Pack Graph** webview.

## 📚 Learn more

- ⚡ **[Quickstart](docs/quickstart.md)** — one page: the day-to-day loop for someone joining a project that already uses this.
- 🏛️ **[Architecture overview](docs/specs/architecture.md)** — three repos, three lifecycles; how the pack, the implementation project, the bootstrap prompt and the harness fit together (with diagrams).
- 🪄 **[Bootstrap prompt](docs/bootstrap-prompt.md)** — the only freeform-AI step, ready to paste into opencode / Claude / Cursor on day one of a project.
- 🚗 **[End-to-end tutorial](docs/tutorial.md)** — build Smart Parking on the real `parking-management-specops` pack; every command, plus adding new requirements.
- 📖 **[How-to guide](docs/how-to.md)** — step-by-step recipes for every common workflow.
- [Documentation site](https://rsaglobaltech.github.io/spec-driven-development-template/)
- [Case study — Smart Parking adoption](docs/case-studies/case-1.md)
- [Comparison vs. spec-kit / Cursor / Aider](docs/comparisons.md)
- [Architecture Decision Records](docs/specs/adr/README.md)
- [Contributing guide](CONTRIBUTING.md)

## 🤝 Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first contributions: new module templates, validator rules, additional domain packs.

## 📄 License

MIT © RSA Global Tech
