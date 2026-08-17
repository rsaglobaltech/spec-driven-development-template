# Automation

Wiring the loop into the tools a team already runs: editors, agents,
hooks and CI.

---

## Wire the MCP server into Claude / Cursor / Aider

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
| `plan` | Returns the same JSON as `csda plan --format json`. |
| `mark_requirement_done` | Mirrors `csda done <REQ>` (supports `--check`/`--strict`). |

Restart the client; the tools appear in the model's tool list as `spec-driven.*`.

---

---

## Use the VS Code extension

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

---

## Configure the harness

```bash
csda harness init
```

Writes `harness.config.yaml` and `.harness/prompt-prefix.md`, detects the gate
from your build files, and leaves `agent:` unset — which agent runs the loop is
your choice and your credentials.

Name the agent when you run it:

```bash
csda harness run --req REQ-001 --agent "claude -p < {prompt_file}"
```

Or commit the commands your team uses and pick one by name:

```yaml
# harness.config.yaml
agent_profile: local-claude

# .harness/profiles.yaml
profiles_version: 1
profiles:
  local-claude:
    agent: "claude -p < {prompt_file}"
  ci:
    agent: "aider --yes --message-file {prompt_file}"
```

An explicit `agent:` wins over a profile, and an unknown key in
`harness.config.yaml` is an error rather than a shrug — a key nobody reads is
worse than a missing one, because the file looks configured.

## Wire `validate` into a pre-commit hook

**Goal:** block commits that drop a `REQ` without a `.feature` or a `traceability.md` row before they ever leave the developer's machine.

Plain shell (works without husky/lefthook):

```bash
# .git/hooks/pre-commit  (chmod +x)
#!/usr/bin/env bash
set -e
echo "→ csda validate --strict-tdd"
npx --yes create-spec-driven-app@0.1.0 validate . --strict-tdd
echo "→ csda specops diff (must be clean)"
DIFF=$(npx --yes create-spec-driven-app@0.1.0 specops diff --format json 2>/dev/null || true)
if echo "$DIFF" | grep -q '"added":\[\([^]].\)\]\|"modified":\[\([^]].\)\]'; then
  echo "✖ Pack content drifted. Run \`csda specops sync\` and commit again."
  exit 1
fi
```

Or with **husky** (`package.json`):

```bash
npm install --save-dev husky
npx husky init
echo 'npx --yes create-spec-driven-app@latest validate . --strict-tdd' > .husky/pre-commit
```

Mirror the same call in CI (see §4) so the gate survives `--no-verify`.

---

---

## Next

- [The agent contract](specs/agent-contract.md)
- [The harness spec](specs/harness.md)
