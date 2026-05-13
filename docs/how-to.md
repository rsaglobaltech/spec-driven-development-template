# 📖 How-to guide

Step-by-step recipes for the most common workflows with `create-spec-driven-app`.
Each recipe is **self-contained** — copy/paste should work end-to-end.

> Prerequisites: **Node.js ≥ 20**, `git`, a shell. All recipes use `npx create-spec-driven-app@latest`; pin the version (e.g. `@0.1.0-beta.3`) for reproducible CI.

## Table of contents

1. [Generate your first project](#1-generate-your-first-project)
2. [Replace the scaffold with real requirements](#2-replace-the-scaffold-with-real-requirements)
3. [Add a Gherkin scenario and keep traceability green](#3-add-a-gherkin-scenario-and-keep-traceability-green)
4. [Run `validate` locally and in CI](#4-run-validate-locally-and-in-ci)
5. [Enforce TDD with `validate --strict-tdd`](#5-enforce-tdd-with-validate---strict-tdd)
6. [Author a domain pack from scratch](#6-author-a-domain-pack-from-scratch)
7. [Apply a domain pack to an existing project](#7-apply-a-domain-pack-to-an-existing-project)
8. [Build a `contracts` pack for API-first work](#8-build-a-contracts-pack-for-api-first-work)
9. [Compose multiple packs with `specops.config.yaml`](#9-compose-multiple-packs-with-specopsconfigyaml)
10. [Bump a pack version safely (`specops diff` + `sync`)](#10-bump-a-pack-version-safely-specops-diff--sync)
11. [Wire the MCP server into Claude / Cursor / Aider](#11-wire-the-mcp-server-into-claude--cursor--aider)
12. [Use the VS Code extension](#12-use-the-vs-code-extension)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Generate your first project

**Goal:** scaffold a new repo with `spec.md`, `AI_RULES.md`, `docs/specs/`, an empty `features/` directory, and a traceability matrix.

```bash
# 1. Start from the shipped example
cp examples/project.config.example /tmp/acme-energy-hub.config

# 2. Edit /tmp/acme-energy-hub.config — minimum keys:
#   PROJECT_NAME, PROJECT_SLUG, PROJECT_TYPE, DOMAIN, STACK, API_STYLE, TESTING

# 3. Scaffold
npx create-spec-driven-app@latest init \
  --config /tmp/acme-energy-hub.config \
  --out /tmp

# 4. Verify
tree /tmp/acme-energy-hub -L 2
```

Useful flags:

| Flag | Use |
| --- | --- |
| `--dry-run` | Print every file that would be written; don't touch disk. |
| `--force` | Overwrite a pre-existing target directory. |
| `--no-git` | Skip `git init` (defaults to initialising). |

---

## 2. Replace the scaffold with real requirements

**Goal:** turn the template `spec.md` and `traceability.md` into project-specific content.

1. Open `spec.md`. Replace every placeholder paragraph; keep the `REQ-NNN` heading convention because the validator uses it.
2. Update `docs/specs/traceability.md`. Use the rich 10-column header if you want full DDD coverage; the legacy 4-column form is also accepted.
3. Each `REQ-NNN` you add to `spec.md` must appear in `traceability.md` and (eventually) in a `.feature` file. `validate` flags missing rows; `validate --strict-tdd` also flags missing scenarios/tests.

> Tip: keep `AI_RULES.md` open in your editor. It is what every coding agent reads on every prompt — changes there propagate to Claude/Cursor/Aider without re-prompting.

---

## 3. Add a Gherkin scenario and keep traceability green

**Goal:** add a feature file and register it in the matrix so `validate` stays green.

```bash
# 1. Create the feature
mkdir -p features/billing
cat > features/billing/discounts.feature <<'EOF'
Feature: Apply discount on checkout
  Scenario: Premium customer receives 10% discount
    Given a logged-in premium customer
    When they checkout with an order of 100 EUR
    Then the final price is 90 EUR
EOF

# 2. Add a row to docs/specs/traceability.md (rich header shown below)
#    | REQ-007 | SCN-007 | features/billing/discounts.feature | UC-007 | ApplyDiscountCommand | CartAggregate | DiscountApplied | DiscountService.java | DiscountServiceTest | Draft |

# 3. Validate
npx create-spec-driven-app@latest validate .
```

If the new `.feature` is not in `traceability.md`, the validator exits with a non-zero status and tells you the missing file.

---

## 4. Run `validate` locally and in CI

**Goal:** make `validate` part of every PR.

Local:

```bash
npx create-spec-driven-app@latest validate .
```

GitHub Actions:

```yaml
# .github/workflows/specs.yml
name: Spec validation
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npx --yes create-spec-driven-app@latest validate .
```

What `validate` checks:

- required directories (`features/`, `docs/specs/`),
- required files (`spec.md`, `AI_RULES.md`, `traceability.md`, ADR entrypoint),
- at least one `.feature`,
- no unresolved `{{...}}` placeholders,
- traceability matrix header presence,
- every `.feature` appears in `traceability.md`,
- allowed traceability statuses,
- duplicate `Scenario ID` detection,
- expected `use-cases.md` and `events.md` headers when those files exist.

Exit codes: `0` ok · `1` unhandled · `2` usage · `3` missing prerequisite · `4` destination conflict.

---

## 5. Enforce TDD with `validate --strict-tdd`

**Goal:** fail PRs when a `REQ` exists in `spec.md` but has no scenario, no implementing test, or no row in `traceability.md`.

```bash
npx create-spec-driven-app@latest validate . --strict-tdd
```

`--strict-tdd` is in addition to the normal checks. It is intended for "no contract without a test" gates — particularly useful in `contracts` packs (see §8). Wire it into CI exactly like `validate`, just append the flag.

> When a `REQ` is intentionally not yet implemented, set its status in `traceability.md` to `Deferred` — `--strict-tdd` accepts that as an explicit signal and won't fail.

---

## 6. Author a domain pack from scratch

**Goal:** package a reusable bundle of requirements, use cases, aggregates, events, and Gherkin templates.

```bash
# 1. Scaffold a pack
npx create-spec-driven-app@latest pack init \
  --out ./domain-packs \
  --name "Billing Backend" \
  --type backend

# 2. Edit ./domain-packs/billing/backend/pack.yaml
#    Required fields (see schemas/pack.schema.json for the full schema):
#      schema_version, metadata.{name,version,language,project_type}
#      variables.required
#    Optional: requirements, use_cases, commands, aggregates, events,
#              scenarios, outputs.files, rules

# 3. Lint
npx create-spec-driven-app@latest pack lint \
  --pack-root ./domain-packs \
  --pack billing/backend
```

Minimum viable `pack.yaml`:

```yaml
# yaml-language-server: $schema=../../../schemas/pack.schema.json
schema_version: "1.2.0"
metadata:
  name: "Billing Backend"
  version: "0.1.0"
  language: "en"
  project_type: "backend"
variables:
  required: [PROJECT_NAME, PROJECT_SLUG, DOMAIN]
requirements:
  - id: REQ-001
    title: "Charge customer at checkout"
    priority: Must
    status: Draft
outputs:
  files:
    - target: "features/billing/charge.feature"
      template: |
        Feature: Charge customer at checkout
          Scenario: Successful payment for {{PROJECT_NAME}}
            Given a valid card on file
            When the user confirms the order
            Then a CHARGE event is emitted
```

`pack lint` blocks publication on schema violations, missing requirements, unresolved placeholders, and duplicate IDs.

---

## 7. Apply a domain pack to an existing project

**Goal:** layer a pack onto a project generated in §1, supplying its template variables.

```bash
# Local pack root
npx create-spec-driven-app@latest expand \
  --pack-root ./domain-packs \
  --pack billing/backend \
  --project-dir /tmp/acme-energy-hub \
  --var PROJECT_NAME="Acme Energy Hub" \
  --var PROJECT_SLUG=acme-energy-hub \
  --var DOMAIN="community energy"

# Remote pack (git tag)
npx create-spec-driven-app@latest expand \
  --pack-repo https://github.com/acme/billing-specops.git \
  --pack-version v0.1.0 \
  --pack backend \
  --project-dir /tmp/acme-energy-hub \
  --var PROJECT_NAME="Acme Energy Hub"
```

Side effects:

- New `.feature` files under `features/`.
- New rows in `docs/specs/traceability.md`.
- Rich-DDD docs (`use-cases.md`, `aggregates.md`, …) populated/extended.
- A `.specops.lock` file at the project root recording **pack repo, version, and the vars you passed**. Commit this file.

Flags:

| Flag | Use |
| --- | --- |
| `--dry-run` | Print actions without writing. |
| `--no-examples` | Skip files marked `seed: true` (good for production projects). |
| `--cache-dir <path>` | Override the cache directory for remote packs. |

---

## 8. Build a `contracts` pack for API-first work

**Goal:** ship a pack that defines REST/AsyncAPI contracts and consumer-driven Pact tests.

Set `project_type: contracts` in `pack.yaml`. The schema then accepts two extra top-level fields:

- `api_contracts` — list of `{id, title, type, provider, consumers[], schema_ref, requirement}` entries.
- `consumer_driven_tests` — list of `{id, consumer, provider, pact_file, requirement}` entries.

Example excerpt:

```yaml
schema_version: "1.2.0"
metadata:
  name: "API Contracts Pack"
  version: "0.1.0"
  project_type: "contracts"
variables:
  required: [PROJECT_NAME, PROVIDER_SERVICE, CONSUMER_SERVICE]

api_contracts:
  - id: AC-001
    title: "Provider REST API — v1"
    type: REST
    provider: "{{PROVIDER_SERVICE}}"
    consumers: ["{{CONSUMER_SERVICE}}"]
    schema_ref: "contracts/openapi/provider-v1.yaml"
    requirement: REQ-001

consumer_driven_tests:
  - id: CDT-001
    consumer: "{{CONSUMER_SERVICE}}"
    provider: "{{PROVIDER_SERVICE}}"
    pact_file: "contracts/pacts/{{CONSUMER_SERVICE}}-{{PROVIDER_SERVICE}}.json"
    requirement: REQ-002
```

When applied with `expand`, a `contracts` pack generates `docs/specs/test-strategy.md` describing the TDD gates (failing pact = failing build, breaking-change rules, contract versioning policy). Pair it with `validate --strict-tdd` so every `AC-NNN` must trace to a `CDT-NNN` and a `.feature`.

Browse [`packs/sample-contracts/contracts/pack.yaml`](../packs/sample-contracts/contracts/pack.yaml) for a complete working example.

---

## 9. Compose multiple packs with `specops.config.yaml`

**Goal:** declare every pack a project depends on in one place, so a fresh clone can rebuild specs with `specops sync`.

Create `specops.config.yaml` at the project root:

```yaml
specops_version: 1
packs:
  - repo: https://github.com/acme/parking-specops.git
    version: v0.1.0
    pack_id: backend
    vars:
      PROJECT_NAME: Smart Parking
      PROJECT_SLUG: smart-parking
      DOMAIN: parking operations
  - repo: https://github.com/acme/billing-specops.git
    version: v0.2.0
    pack_id: contracts
    vars:
      PROJECT_NAME: Smart Parking
      PROVIDER_SERVICE: billing-svc
      CONSUMER_SERVICE: parking-svc
```

Then on a fresh clone:

```bash
npx create-spec-driven-app@latest specops sync --project-dir .
```

When `.specops.lock` is absent, `sync` reads `specops.config.yaml`, expands every listed pack, and writes the lockfile. When the lockfile exists, the lockfile wins — `specops.config.yaml` is the **intent**, the lockfile is the **resolved state** (think `package.json` vs `package-lock.json`).

---

## 10. Bump a pack version safely (`specops diff` + `sync`)

**Goal:** upgrade `parking-management/backend` from `v0.1.0` to `v0.2.0` without surprises.

```bash
# 1. Preview the change (no writes)
npx create-spec-driven-app@latest specops diff \
  --project-dir ./smart-parking \
  --pack parking-management/backend \
  --pack-version v0.2.0

# Output:
# ── parking-management/backend @ v0.2.0 (current: v0.1.0) ──
#   + features/pricing/dynamic_pricing.feature
#   ~ docs/specs/use-cases.md
#   ~ docs/specs/traceability.md
#   1 added · 2 modified · 9 unchanged

# 2. Apply once you're satisfied
npx create-spec-driven-app@latest specops sync \
  --project-dir ./smart-parking \
  --pack parking-management/backend \
  --pack-version v0.2.0

# 3. Re-validate
npx create-spec-driven-app@latest validate ./smart-parking --strict-tdd

# 4. Commit the updated .specops.lock and the regenerated spec files
git add .specops.lock docs/specs features
git commit -m "chore(specs): bump parking-management/backend to v0.2.0"
```

Plain `sync` (no `--pack` / `--pack-version`) re-expands every pack in the lockfile using the **vars persisted there** — no need to retype `--var` flags.

---

## 11. Wire the MCP server into Claude / Cursor / Aider

**Goal:** let an MCP-aware AI agent read specs, list requirements, and run `validate` directly.

Install:

```bash
npm i -g @spec-driven/mcp-server
```

Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "spec-driven": {
      "command": "npx",
      "args": ["-y", "@spec-driven/mcp-server"]
    }
  }
}
```

Tools exposed by the server:

| Tool | Purpose |
| --- | --- |
| `read_spec` | Returns `spec.md` and lists every `docs/specs/*.md`. |
| `list_requirements` | Returns every `REQ-NNN` with title, file, and line. |
| `update_traceability` | Idempotently appends a row to `traceability.md`. |
| `lint_pack` | Runs `pack lint` and returns structured errors. |
| `validate_project` | Runs `validate` (or `validate --strict-tdd`) and parses the output. |

Restart the client; the tools appear in the model's tool list as `spec-driven.*`.

---

## 12. Use the VS Code extension

**Goal:** get inline diagnostics for `pack.yaml`, code-lens to jump to the traceability row, and validate-on-save.

1. Install [`vscode-spec-driven`](../packages/vscode-spec-driven) from the Marketplace (`ext install rsaglobaltech.vscode-spec-driven`).
2. Open a project root. The extension auto-detects `spec.md` / `docs/specs/traceability.md`.
3. Open any `pack.yaml` — diagnostics from the JSON Schema appear in the Problems panel.
4. Hover any `REQ-NNN` (or `UC-`, `SCN-`, `AGG-`, `EVT-`, `RUL-`, `CMD-`) → CodeLens shows "Reveal in traceability".
5. Enable validate-on-save: open settings, search **Spec-Driven**, tick `validateOnSave`. The CLI runs after every save and posts results to the Problems panel.

Settings:

| Setting | Default | Purpose |
| --- | --- | --- |
| `spec-driven.validateOnSave` | `false` | Run `validate` on every file save. |
| `spec-driven.codeLens` | `true` | Show "Reveal in traceability" code lenses. |
| `spec-driven.cliPath` | `npx create-spec-driven-app` | Override if you ship the CLI vendored. |
| `spec-driven.schemaPath` | bundled | Point at a custom `pack.schema.json`. |

---

## 13. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `validate` says **"missing traceability.md row"** for a `.feature` you just added | The matrix needs every feature file registered. | Add a row pointing to the relative path of the `.feature`. |
| `validate --strict-tdd` fails on a half-baked REQ | A `REQ-NNN` exists in `spec.md` without a `.feature` or executable test. | Either add the test, or mark the row in `traceability.md` as `Deferred`. |
| `expand` leaves `{{VARS}}` in generated files | A required `--var` was not provided. | Re-run with the missing variable. Check `pack.yaml > variables.required`. |
| `specops sync` rewrites your edits to a generated file | Generated files are meant to be regenerable. | Customise the **pack template**, not the generated output. |
| `pack lint` rejects a pack that worked before | A new schema version added required fields. | Run `npx create-spec-driven-app@latest pack lint …` against the latest CLI to see the actual error. |
| `npx create-spec-driven-app …` hangs the first time | npm is resolving the package. | Subsequent runs are cached; pin the version (e.g. `@0.1.0-beta.3`) in CI. |
| `specops sync` complains "no lockfile and no `specops.config.yaml`" | Neither source of truth is present. | Run `expand` once, **or** create `specops.config.yaml` (see §9). |

Still stuck? Open an issue with the output of `npx create-spec-driven-app@latest validate --help` plus the failing command. The [Comparisons doc](comparisons.md) lists migration paths from `spec-kit`, Cursor rules, Aider conventions, and plain READMEs if the answer is "this tool isn't the right fit".
