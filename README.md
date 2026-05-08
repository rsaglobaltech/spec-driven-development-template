# 🚀 Spec Template MVP

A reusable **Spec-Driven Development (SDD)** starter to bootstrap new projects with clear requirements, traceability, and acceptance criteria from day one.

[![CI](https://github.com/rsaglobaltech/spec-driven-development-template/actions/workflows/ci.yml/badge.svg)](https://github.com/rsaglobaltech/spec-driven-development-template/actions/workflows/ci.yml)
[![Publish to npm](https://github.com/rsaglobaltech/spec-driven-development-template/actions/workflows/publish-npm.yml/badge.svg)](https://github.com/rsaglobaltech/spec-driven-development-template/actions/workflows/publish-npm.yml)
[![Publish to GitHub Packages](https://github.com/rsaglobaltech/spec-driven-development-template/actions/workflows/publish-github-packages.yml/badge.svg)](https://github.com/rsaglobaltech/spec-driven-development-template/actions/workflows/publish-github-packages.yml)
[![Docs](https://img.shields.io/badge/docs-github_pages-0e8078)](https://rsaglobaltech.github.io/spec-driven-development-template/)
[![npm latest](https://img.shields.io/npm/v/create-spec-driven-app?logo=npm&label=latest)](https://www.npmjs.com/package/create-spec-driven-app)
[![npm beta](https://img.shields.io/npm/v/create-spec-driven-app/beta?logo=npm&label=beta)](https://www.npmjs.com/package/create-spec-driven-app)

📚 Documentation site: **https://rsaglobaltech.github.io/spec-driven-development-template/**

---

## ✨ Why this template is valuable

Most teams lose time because implementation starts before requirements are operationally clear.

This template fixes that by making specs first-class artifacts:
- **Clarity first**: business intent is explicit before coding.
- **Built-in traceability**: `Requirement -> Scenario -> Domain -> Implementation -> Test` from the start.
- **DDD Lite context**: optional domain pack fields for requirements, use cases, commands, aggregates, events, and value objects.
- **Testable requirements**: Gherkin scenarios become executable acceptance criteria.
- **Reusable process**: same structure across domains and teams.
- **AI-ready workflow**: standardized `AI_RULES.md` to guide implementation assistants.

If your goal is repeatable delivery quality, this gives you a practical baseline.

---

## 🧱 What you get

- `create-spec-driven-app` npm CLI for `npx` usage.
- `scripts/new_spec_project.sh` → generate a new specs project from templates.
- `scripts/validate_specs.sh` → validate structure and spec quality gates.
- `scripts/expand_domain_pack.js` → expand a domain pack (YAML + templates) into an existing project.
- `templates/base` → shared project skeleton.
- `docs/specs/*` templates for traceability, domain model, use cases, commands, events, aggregates, status model, and review checklist.
- `templates/backend` and `templates/frontend` → type-specific defaults.
- `templates/modules/*` → optional business feature packs.
- `examples/project.config.example` → ready-to-copy configuration.

---

## 🗂️ Repository structure

```text
.
├── README.md
├── examples/
│   └── project.config.example
├── scripts/
│   ├── new_spec_project.sh
│   ├── validate_specs.sh
│   ├── expand_domain_pack.js
│   └── domain-pack/
│       └── common.js
└── templates/
    ├── base/
    │   ├── .gitignore.tpl
    │   ├── README.md.tpl
    │   ├── spec.md.tpl
    │   └── docs/specs/
    │       ├── aggregates.md.tpl
    │       ├── commands.md.tpl
    │       ├── domain-model.md.tpl
    │       ├── events.md.tpl
    │       ├── review-checklist.md.tpl
    │       ├── status-model.md.tpl
    │       ├── traceability.md.tpl
    │       ├── use-cases.md.tpl
    │       └── adr/README.md.tpl
    ├── backend/
    │   ├── AI_RULES.md.tpl
    │   └── features/core/health.feature.tpl
    ├── frontend/
    │   ├── AI_RULES.md.tpl
    │   └── features/core/health.feature.tpl
    └── modules/
        ├── auth/
        ├── dashboard/
        └── billing/
```

---

## ⚡ Quickstart

Requirements:
- Node.js `>=18`

### Option A (recommended): run with `npx`

1. Copy the example config:

```bash
cp examples/project.config.example /tmp/my-project.config
```

2. Edit it with your project values.

3. Generate the new project skeleton:

```bash
npx create-spec-driven-app@latest init \
  --config /tmp/my-project.config \
  --out /tmp
```

4. Validate the result:

```bash
npx create-spec-driven-app@latest validate /tmp/acme-energy-hub
```

### Option B: local script workflow (fallback)

```bash
./scripts/new_spec_project.sh --config /tmp/my-project.config --out /tmp
./scripts/validate_specs.sh /tmp/acme-energy-hub
```

---

## 📝 Configuration format

Use `key="value"` entries (text parsing, not shell execution).

### Required keys

- `PROJECT_NAME` → human-readable name.
- `PROJECT_SLUG` → target folder name.
- `PROJECT_TYPE` → `backend` or `frontend`.
- `DOMAIN` → business domain context.
- `STACK` → concrete runtime stack written into `AI_RULES.md`.
- `API_STYLE` → API/UI integration contract written into `AI_RULES.md`.
- `TESTING` → test stack written into `AI_RULES.md`.

### Optional keys

- `LANG` → defaults to `en`.
- `MODULES` → comma-separated list of optional modules.
- `ENVIRONMENTS` → defaults to `dev,feature,prod`.
- `DEFAULT_ENV` → defaults to `dev`.
- `DOCKER_SUPPORT` → defaults to `true`.
- `DEVCONTAINER_SUPPORT` → defaults to `true`.
- `DATABASE_ENGINE` → defaults to `postgres`.
- `DATABASE_VERSION` → defaults to `16`.
- `DATABASE_NAME` → base database name; env-specific names are derived.
- `DATABASE_USER` → application database user.
- `DATABASE_PASSWORD` → placeholder password for generated local env files.
- `DATABASE_PORT_DEV`, `DATABASE_PORT_FEATURE`, `DATABASE_PORT_PROD` → host ports per environment.

No modules are applied by default. This keeps the template domain-agnostic while requiring an explicit implementation stack. If stack fields are intentionally set to `TBD`, `AI_RULES.md` tells implementation agents to stop and clarify instead of inferring a framework.

Baseline example (no modules):

```ini
PROJECT_NAME="Acme Energy Hub"
PROJECT_SLUG="acme-energy-hub"
PROJECT_TYPE="backend"
DOMAIN="community energy"
STACK="Quarkus 3.x, Java 21, PostgreSQL, RESTEasy Reactive, SmallRye GraphQL, Maven"
API_STYLE="REST and GraphQL with DTO boundaries"
TESTING="Quarkus Test, Testcontainers, JUnit 5, Cucumber"
LANG="en"
MODULES=""
ENVIRONMENTS="dev,feature,prod"
DEFAULT_ENV="dev"
DOCKER_SUPPORT="true"
DEVCONTAINER_SUPPORT="true"
DATABASE_ENGINE="postgres"
DATABASE_VERSION="16"
DATABASE_NAME="acme_energy_hub"
DATABASE_USER="acme_energy_hub_app"
DATABASE_PASSWORD="change-me"
DATABASE_PORT_DEV="5432"
DATABASE_PORT_FEATURE="5433"
DATABASE_PORT_PROD="5434"
```

Optional modules example:

```ini
MODULES="auth,dashboard,billing"
```

Generated projects include `.env.dev`, `.env.feature`, `.env.prod`, `docker-compose.yml`, `.devcontainer/devcontainer.json`, and `docs/specs/runtime-environments.md`.

---

## 🛠️ CLI

```bash
npx create-spec-driven-app@latest init --config <path> --out <directory> [--force] [--dry-run] [--no-git]
npx create-spec-driven-app@latest validate <project_dir>
npx create-spec-driven-app@latest expand --pack-root <path> --pack <domain/type> --project-dir <path> [--var KEY=VALUE]... [--dry-run] [--no-examples]
```

Options:
- `--config` config file path.
- `--out` parent output directory.
- `--force` overwrite destination if it exists.
- `--dry-run` print actions without writing files.
- `--no-git` skip `git init`.
- `--help` show usage.

`expand` options:
- `--pack-root` root directory that contains domain packs.
- `--pack` pack id path under `pack-root` (for example `parking-management/backend`).
- `--project-dir` target project directory where files will be expanded.
- `--var KEY=VALUE` template variable values (repeatable).
- `--no-examples` skip seeded scenarios (`seed: true`).
- `--dry-run` print actions without writing files.

Exit codes:
- `0` success.
- `2` usage/config error.
- `3` missing prerequisite.
- `4` destination conflict (without `--force`).
- `1` unhandled runtime error.

For local repository usage, you can run the equivalent shell scripts directly from `scripts/`.

### Domain pack expansion example

```bash
npx create-spec-driven-app@latest expand \
  --pack-root ./domain-packs \
  --pack parking-management/backend \
  --project-dir /tmp/acme-energy-hub \
  --var PROJECT_NAME="Acme Energy Hub" \
  --var PROJECT_SLUG=acme-energy-hub \
  --var DOMAIN="community energy"
```

Domain packs can stay minimal, or they can opt into DDD Lite fields:

```yaml
schema_version: "1.1.0"

requirements:
  - id: REQ-001
    title: "Reserve stock before order confirmation"
    priority: Must

use_cases:
  - id: UC-001
    name: Reserve Stock
    requirement: REQ-001
    command: ReserveStockCommand
    aggregate: InventoryReservation
    emits:
      - StockReserved

commands:
  - id: CMD-001
    name: ReserveStockCommand
    fields:
      - sku
      - quantity

aggregates:
  - id: AGG-001
    name: InventoryReservation
    invariants:
      - "Reserved quantity cannot exceed available stock."

events:
  - id: EVT-001
    name: StockReserved
    producer: InventoryReservation
```

When these fields exist, `expand` generates `docs/specs/domain-model.md`, `use-cases.md`, `commands.md`, `events.md`, `aggregates.md`, and a richer traceability matrix.

---

## ✅ Validator checks

`./scripts/validate_specs.sh <project_dir>` enforces:
- required directories (`features`, `docs/specs`),
- required files (`spec.md`, `AI_RULES.md`, `traceability.md`, ADR entrypoint),
- at least one `.feature`,
- no unresolved placeholders (`{{...}}`),
- traceability matrix header presence,
- every `.feature` appears in `traceability.md`,
- allowed traceability statuses,
- duplicate `Scenario ID` detection in the rich matrix,
- expected `use-cases.md` and `events.md` headers when those files exist.

---

## 🔄 Recommended real-world workflow

1. **Generate baseline** with the CLI.
2. **Replace template content** with real project business requirements.
3. **Refine Gherkin features** with product + dev + QA collaboration.
4. **Maintain traceability** from scenarios to technical artifacts.
5. **Implement code** only after specs are decision-ready.
6. **Use scenarios as acceptance gates** in delivery.

This template accelerates project setup, but your real product value comes from customizing `spec.md` and `.feature` files.

---

## 🧠 Design principles

- Keep structure stable, keep domain content flexible.
- Prefer small reusable modules over giant static specs.
- Treat specs as living assets, not one-time docs.
- Keep AI instructions explicit and auditable.

---

## 📈 Roadmap ideas

- Add CI checks to run validator on pull requests.
- Add module packs (`alerts`, `forecasting`, `compliance`, `payments`).
- Add bats/shellspec tests for scripts.
- Add a strict Node.js validator for deeper YAML, Markdown, and Gherkin cross-reference checks.

---

## 🏗️ CI/CD and npm release

This repository includes production-ready GitHub Actions workflows:

- `.github/workflows/ci.yml`
  - Runs on push/PR (`main`, `develop`)
  - Executes Node test suite
  - Verifies package contents with `npm pack --dry-run`
  - Smoke-tests the packed tarball with `npx`

- `.github/workflows/publish-npm.yml`
  - Manual publish via **workflow_dispatch** with:
    - `package_version`: optional version override, for example `0.1.0-beta.3`
    - `dist_tag`: `beta` or `latest`
    - `dry_run`: `true`/`false`
  - Auto-publish on git tags `v*` (publishes with `latest`)
  - Runs tests before publish
  - Fails early if the package version already exists on npm
  - Publishes with provenance enabled

- `.github/workflows/publish-github-packages.yml`
  - Publishes a scoped mirror package to **GitHub Packages** (`npm.pkg.github.com`)
  - Manual publish via **workflow_dispatch** (`package_version`, `beta`/`latest`, `dry_run`)
  - Auto-publish on tags `v*`
  - Fails early if the scoped package version already exists on GitHub Packages
  - Uses `GITHUB_TOKEN` with `packages: write`

- `.github/workflows/pages.yml`
  - Deploys `docs/` to `gh-pages` branch from `main`
  - Public docs URL: `https://rsaglobaltech.github.io/spec-driven-development-template/`

> For this workflow, set **Settings → Pages → Source = Deploy from a branch**, branch **`gh-pages`**, folder **`/(root)`**.

### Required GitHub secret

Set this repository secret before publishing:

- `NPM_TOKEN`: npm automation token with publish permissions for this package

### Where the package appears

- This project publishes to the **npm registry** (`registry.npmjs.org`), so the package is visible on npm:
  - `https://www.npmjs.com/package/create-spec-driven-app`
- This project can also publish to **GitHub Packages** (`npm.pkg.github.com`) via scoped package:
  - `@rsaglobaltech/create-spec-driven-app`
- GitHub repository **Packages** shows packages hosted in GitHub Packages.
- GitHub **Releases** are also separate from npm publishing; they appear when you create Git tags/releases.

### GitHub Pages fallback mode (recommended if `configure-pages` fails)

If your repository/org blocks the API used by `actions/configure-pages`, use this branch-based mode:

1. Keep `.github/workflows/pages.yml` enabled (it publishes `docs/` to `gh-pages`).
2. In GitHub Settings → Pages:
   - Source: **Deploy from a branch**
   - Branch: **`gh-pages`**
   - Folder: **`/(root)`**
3. Trigger the workflow once manually from Actions.
4. If the first run fails due first-time token limitations, run it again after selecting `gh-pages` in Pages settings.

### Install from GitHub Packages

Add to your user/project `.npmrc`:

```ini
@rsaglobaltech:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then install:

```bash
npm i @rsaglobaltech/create-spec-driven-app
```

### Beta release flow

Package registries do not allow publishing the same version twice. For every beta publish, choose a new version such as `0.1.0-beta.2`, `0.1.0-beta.3`, or the next appropriate prerelease.

1. Push changes and verify CI is green.
2. Trigger **Publish to npm** workflow manually:
   - `package_version=0.1.0-beta.3`
   - `dist_tag=beta`
   - `dry_run=true` (sanity check)
3. Trigger again with the same version:
   - `package_version=0.1.0-beta.3`
   - `dist_tag=beta`
   - `dry_run=false`
4. If publishing to GitHub Packages too, repeat the same version in **Publish to GitHub Packages**.

### Stable release flow

1. Merge to `main`.
2. Create and push tag (example: `v0.1.0`).
3. Tag push triggers automatic publish to npm with `latest`.

---

## 🤝 Contributing

Contributions are welcome.

Good first contributions:
- new module templates,
- validator quality rules,
- docs examples for additional domains.

Please keep changes aligned with the spec-first philosophy.

---

## 📄 License

Add your preferred license here (MIT/Apache-2.0 recommended for templates).
