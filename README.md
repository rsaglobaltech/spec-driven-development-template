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

## ⚡ Quickstart

```bash
# 1. Create a config from the example
cp examples/project.config.example /tmp/my-project.config

# 2. Generate the project
npx create-spec-driven-app@latest init \
  --config /tmp/my-project.config \
  --out /tmp

# 3. Validate
npx create-spec-driven-app@latest validate /tmp/my-project
```

Requires **Node.js ≥ 20**.

## 🛠️ CLI

| Command | What it does |
| --- | --- |
| `init` | Scaffold a new spec-driven project from a config file. |
| `validate` | Check structure, traceability, and Gherkin coverage. Add `--strict-tdd` to enforce TDD gates. |
| `expand` | Apply a domain pack (local path or remote git repo) onto an existing project. |
| `pack init` / `pack lint` | Scaffold or lint a custom domain pack. |
| `specops sync` / `specops diff` | Sync a project to a locked pack version, or diff against it. |

Full reference: `npx create-spec-driven-app --help` · [Documentation site](https://rsaglobaltech.github.io/spec-driven-development-template/)

## ⚙️ Configuration

Minimum config (key=value, not shell):

```ini
PROJECT_NAME="Acme Energy Hub"
PROJECT_SLUG="acme-energy-hub"
PROJECT_TYPE="backend"          # backend | frontend
DOMAIN="community energy"
STACK="Quarkus 3.x, Java 21, PostgreSQL"
API_STYLE="REST with DTO boundaries"
TESTING="JUnit 5, Testcontainers, Cucumber"
```

Optional: `LANG`, `MODULES="auth,dashboard,billing"`. See [`examples/project.config.example`](examples/project.config.example).

## 🧪 Domain packs

A pack is a reusable YAML bundle of requirements, use cases, aggregates, events, and Gherkin templates:

```bash
npx create-spec-driven-app@latest expand \
  --pack-root ./domain-packs \
  --pack parking-management/backend \
  --project-dir /tmp/acme-energy-hub \
  --var DOMAIN="community energy"
```

Browse the [curated pack registry](https://rsaglobaltech.github.io/spec-driven-development-template/) or build your own with `pack init`.

## 🧰 Companion tools

- 🧠 **MCP server** ([`@spec-driven/mcp-server`](packages/mcp-spec-driven)) — exposes `read_spec`, `list_requirements`, `validate_project` to Claude Desktop, Cursor, Aider.
- 🧩 **VS Code extension** ([`vscode-spec-driven`](packages/vscode-spec-driven)) — pack.yaml linting, traceability navigation, validate-on-save.

## 📚 Learn more

- [Documentation site](https://rsaglobaltech.github.io/spec-driven-development-template/)
- [Case study — Smart Parking adoption](docs/case-studies/case-1.md)
- [Comparison vs. spec-kit / Cursor / Aider](docs/comparisons.md)
- [Architecture Decision Records](docs/specs/adr/README.md)
- [Contributing guide](CONTRIBUTING.md)

## 🤝 Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first contributions: new module templates, validator rules, additional domain packs.

## 📄 License

MIT © RSA Global Tech
