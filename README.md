# 🚀 Spec Template MVP

A reusable **Spec-Driven Development (SDD)** starter to bootstrap new projects with clear requirements, traceability, and acceptance criteria from day one.

---

## ✨ Why this template is valuable

Most teams lose time because implementation starts before requirements are operationally clear.

This template fixes that by making specs first-class artifacts:
- 🧭 **Clarity first**: business intent is explicit before coding.
- 🔗 **Built-in traceability**: `Spec -> Scenario -> Technical artifact` from the start.
- 🧪 **Testable requirements**: Gherkin scenarios become executable acceptance criteria.
- ♻️ **Reusable process**: same structure across domains and teams.
- 🤖 **AI-ready workflow**: standardized `AI_RULES.md` to guide implementation assistants.

If your goal is repeatable delivery quality, this gives you a practical baseline.

---

## 🧱 What you get

- `create-spec-driven-app` npm CLI for `npx` usage.
- `scripts/new_spec_project.sh` → generate a new specs project from templates.
- `scripts/validate_specs.sh` → validate structure and spec quality gates.
- `templates/base` → shared project skeleton.
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
│   └── validate_specs.sh
└── templates/
    ├── base/
    │   ├── .gitignore.tpl
    │   ├── README.md.tpl
    │   ├── spec.md.tpl
    │   └── docs/specs/
    │       ├── traceability.md.tpl
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

### Optional keys

- `LANG` → defaults to `en`.
- `MODULES` → comma-separated list of optional modules.

No modules are applied by default. This keeps the template domain-agnostic.

Baseline example (no modules):

```ini
PROJECT_NAME="Acme Energy Hub"
PROJECT_SLUG="acme-energy-hub"
PROJECT_TYPE="backend"
DOMAIN="community energy"
LANG="en"
MODULES=""
```

Optional modules example:

```ini
MODULES="auth,dashboard,billing"
```

---

## 🛠️ CLI

```bash
npx create-spec-driven-app@latest init --config <path> --out <directory> [--force] [--dry-run] [--no-git]
npx create-spec-driven-app@latest validate <project_dir>
```

Options:
- `--config` config file path.
- `--out` parent output directory.
- `--force` overwrite destination if it exists.
- `--dry-run` print actions without writing files.
- `--no-git` skip `git init`.
- `--help` show usage.

Exit codes:
- `0` success.
- `2` usage/config error.
- `3` missing prerequisite.
- `4` destination conflict (without `--force`).
- `1` unhandled runtime error.

For local repository usage, you can run the equivalent shell scripts directly from `scripts/`.

---

## ✅ Validator checks

`./scripts/validate_specs.sh <project_dir>` enforces:
- required directories (`features`, `docs/specs`),
- required files (`spec.md`, `AI_RULES.md`, `traceability.md`, ADR entrypoint),
- at least one `.feature`,
- no unresolved placeholders (`{{...}}`),
- traceability matrix header presence.

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
- Add stronger validator rules (full feature-to-traceability coverage).

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
