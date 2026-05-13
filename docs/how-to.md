# 📖 How-to guide

Step-by-step recipes for the most common workflows with `create-spec-driven-app`.
Each recipe is **self-contained** — copy/paste should work end-to-end.

> Prerequisites: **Node.js ≥ 20**, `git`, a shell. All recipes use `csda` (a short alias the package installs for `create-spec-driven-app`) and pin to a published version for reproducible CI.

> **Auto-detect project root**: every command that operates on a project (`plan`, `done`, `validate`, `specops *`) accepts `--project-dir <path>` but **also walks up from your current directory** looking for `spec.md`, `.specops.lock`, or `specops.config.yaml`. Run any of them from inside your project tree without flags.

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
11. [Close the loop: `plan` → implement → `done`](#11-close-the-loop-plan--implement--done)
12. [Wire the MCP server into Claude / Cursor / Aider](#12-wire-the-mcp-server-into-claude--cursor--aider)
13. [Use the VS Code extension](#13-use-the-vs-code-extension)
14. [Wire `validate` into a pre-commit hook](#14-wire-validate-into-a-pre-commit-hook)
15. [End-to-end walkthrough with `parking-management-specops`](#15-end-to-end-walkthrough-with-parking-management-specops)
16. [Troubleshooting](#16-troubleshooting)

For a full step-by-step walkthrough using `https://github.com/rsaglobaltech/parking-management-specops`, jump to §15.

---

## 7. Apply a domain pack to an existing project

The recommended ergonomic path is `specops add` (npm-install-style):

```bash
csda specops add \
  --pack-repo https://github.com/acme/billing-specops.git \
  --pack-version v0.1.0 \
  --pack backend \
  --var PROJECT_NAME="Acme Energy Hub" \
  --var PROJECT_SLUG=acme-energy-hub \
  --var DOMAIN="community energy"
```

`add` writes/updates `.specops.lock` so subsequent `specops sync` / `specops diff` calls remember the source, version, and vars.

To take a pack OFF the project:

```bash
csda specops remove parking-management/backend
```

> `remove` drops the entry from `.specops.lock` but does **not** delete generated files — you might have hand-edited tests pointing at them.

---

## 14. Wire `validate` into a pre-commit hook

```bash
# .git/hooks/pre-commit  (chmod +x)
#!/usr/bin/env bash
set -e
npx --yes create-spec-driven-app@latest validate . --strict-tdd
```

Or with **husky**:

```bash
npm install --save-dev husky
npx husky init
echo 'npx --yes create-spec-driven-app@latest validate . --strict-tdd' > .husky/pre-commit
```

Mirror the same call in CI (see §4).

---

## 15. End-to-end walkthrough with `parking-management-specops`

```bash
# 0. Pick a working directory
mkdir -p ~/sandbox && cd ~/sandbox

# 1. Generate the consumer project
cat > smart-parking.config <<'EOF'
PROJECT_NAME="Smart Parking"
PROJECT_SLUG="smart-parking"
PROJECT_TYPE="backend"
DOMAIN="parking operations"
STACK="Quarkus 3.x, Java 21, PostgreSQL"
API_STYLE="REST with DTO boundaries"
TESTING="JUnit 5, Testcontainers, Cucumber"
LANG="en"
MODULES=""
EOF

csda init --config ./smart-parking.config --out . --no-git
cd smart-parking

# 2. Apply the parking-management pack (pinned to v0.1.0)
csda specops add \
  --pack-repo https://github.com/rsaglobaltech/parking-management-specops.git \
  --pack-version v0.1.0 \
  --pack backend \
  --var PROJECT_NAME="Smart Parking" \
  --var PROJECT_SLUG=smart-parking \
  --var DOMAIN="parking operations"

# 3. See what work the pack created
csda plan

# 4. Machine-readable for an AI agent
csda plan --format json | tail -40

# 5. Implement one REQ, then close the loop
csda done REQ-001 --check

# 6. When pack v0.2.0 lands upstream, preview the diff before applying
csda specops diff --pack-version v0.2.0

# 7. Apply the bump
csda specops sync --pack-version v0.2.0
csda plan

# 8. Drop the pack entirely if needed
csda specops remove parking-management/backend
```

Every command above also works **without** flags from inside the project tree (project root auto-detected).

Full recipes for each section (1-13 and 16) live in this file; this push only highlights the new sections introduced in this PR.
