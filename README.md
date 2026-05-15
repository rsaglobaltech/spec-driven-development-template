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

## ⚡ Quickstart

```bash
# 1. Copy the example config and edit it (PROJECT_NAME, PROJECT_SLUG, …)
cp examples/project.yaml.example /tmp/acme-energy-hub.yaml

# 2. Generate the project
npx create-spec-driven-app@latest init \
  --config /tmp/acme-energy-hub.yaml \
  --out /tmp

# 3. Validate
npx create-spec-driven-app@latest validate /tmp/acme-energy-hub
```

> The generated directory takes its name from `PROJECT_SLUG` inside the config.

Requires **Node.js ≥ 20**.

> 📘 **New here?** The **[end-to-end tutorial](docs/tutorial.md)** builds a real
> project (Smart Parking, on the public `parking-management-specops` pack) and
> walks **every** command — including how to add new requirements both as a
> project consumer and as a pack author.

## 🛠️ CLI

| Command                          | What it does                                                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`                           | Scaffold a new spec-driven project from a config file.                                                                                                                           |
| `validate`                       | Check structure, traceability and Gherkin coverage. `--strict-tdd` also fails the build when a `REQ` lacks its `.feature`, its executable test, or its row in `traceability.md`. |
| `expand`                         | Apply a domain pack (local path or remote git repo) onto a project (low-level; `specops add` is the ergonomic path).                                                             |
| `plan`                           | List requirements still needing a test, code, or status update. `--format json` for AI agents and CI.                                                                            |
| `done`                           | Mark a requirement `Implemented` in `traceability.md`. `--check` / `--strict` validate first.                                                                                    |
| `pack init` / `pack lint`        | Scaffold a pack, or lint it: schema, cross-refs, and scenario quality (`--strict`).                                                                                              |
| `pack lint --graph`              | Render the pack's `REQ→UC→CMD/AGG→EVT` graph (Mermaid/DOT); doubles as a CI link-check.                                                                                          |
| `pack infer`                     | Propose a `pack.yaml` skeleton from a `.feature` file — write the scenario first.                                                                                                |
| `specops add` / `specops remove` | Add a pack (npm-install-style, writes `.specops.lock`) or drop one.                                                                                                              |
| `specops sync` / `specops diff`  | Three-way-merge a project to a locked pack version, or preview the change.                                                                                                       |
| `harness run`                    | Run the plan → agent → verify → done loop for every pending requirement, in isolated git worktrees.                                                                              |

Full reference: `npx create-spec-driven-app --help` · **[End-to-end tutorial](docs/tutorial.md)** · [Documentation site](https://rsaglobaltech.github.io/spec-driven-development-template/)

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

## 🧰 Companion tools

- 🧠 **MCP server** ([`mcp-spec-driven`](packages/mcp-spec-driven)) — exposes `read_spec`, `plan`, `mark_requirement_done`, `lint_pack` and more to Claude Desktop, Cursor, Aider.
- 🧩 **VS Code extension** ([`vscode-spec-driven`](packages/vscode-spec-driven)) — pack.yaml schema linting, dangling-reference diagnostics, reference autocomplete, go-to-definition, requirement reference counts, validate-on-save, and a Mermaid **Pack Graph** webview.

## 📚 Learn more

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
