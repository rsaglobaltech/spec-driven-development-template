# Harness — the spec-driven delivery loop

**Status:** Stable (M5 — `harness run`)
**Owner:** create-spec-driven-app
**Companion ADR:** [ADR-0013](./adr/0013-harness-run-loop.md)

A spec-driven repo is already a complete environment for an AI coding
agent — it just needs an orchestrator:

| Agent need       | Spec-driven repo provides                          |
| ---------------- | -------------------------------------------------- |
| Task queue       | `plan --format json`                               |
| Per-task context | the feature file + `AI_RULES.md`                   |
| Reward signal    | `validate --strict-tdd` + the project test command |
| State transition | `done REQ-NNN`                                     |

`csda harness run` is that orchestrator. It runs **plan → context → agent
→ verify → done** for every pending requirement, with no human
copy-pasting prompts.

## TL;DR

```bash
csda harness run --agent "claude -p < {prompt_file}" --test-cmd "npm test"
```

For each pending requirement, in an isolated `git worktree` on a fresh
`harness/REQ-NNN` branch:

1. Build a self-contained prompt — Gherkin scenario, `AI_RULES.md`, the
   exact artifact paths, and (on a retry) the previous gate failure.
2. Shell out to the configured agent.
3. Gate it: `validate --strict-tdd`, then the project test command.
4. Green → `done REQ-NNN` + commit on the branch. Red → retry up to
   `--max-attempts`, feeding the specific failure back into the prompt.
5. Emit a pass/fail/attempts report.

The harness **never merges a branch.** A human reviews `harness/*` and
merges what they trust.

## Why a worktree per requirement

Each requirement is implemented in its own `git worktree` cut from a
clean base. Consequences:

- The agent for REQ-002 cannot see or break REQ-001's half-finished work.
- A failed requirement leaves a `harness/REQ-NNN` branch you can inspect,
  not a corrupted main checkout.
- The main working tree is never touched — the harness refuses to start
  if it is dirty.

## Vendor neutrality

The agent is **any shell command** containing the `{prompt_file}`
placeholder. The harness writes the prompt to a temp file and substitutes
the path:

```bash
--agent "claude -p < {prompt_file}"
--agent "aider --yes --message-file {prompt_file}"
--agent "cursor-agent --prompt-file {prompt_file}"
--agent "my-wrapper.sh {prompt_file}"
```

There is no built-in agent runtime and no SDK dependency — the harness
shells out and reads the exit code plus the gate result.

## Flags

| Flag                    | Meaning                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `--agent <cmd>`         | Agent command; must contain `{prompt_file}`. Required (unless `--dry-run`). |
| `--test-cmd <cmd>`      | Project test command run as part of the gate. Optional.                     |
| `--max-attempts <n>`    | Retries per requirement, feeding back the failure (default 3).              |
| `--req <REQ-NNN>`       | Limit to specific requirement(s). Repeatable.                               |
| `--project-dir <path>`  | Project root (auto-detected from cwd if omitted).                           |
| `--base-branch <ref>`   | Branch/ref each worktree is cut from (default: current HEAD).               |
| `--timeout <seconds>`   | Per-agent-invocation timeout (default 600).                                 |
| `--keep-worktrees`      | Do not remove worktrees after each requirement.                             |
| `--force`               | Recreate `harness/REQ-NNN` branches that already exist.                     |
| `--format <text\|json>` | Report format (default text).                                               |
| `--dry-run`             | Build and print prompts; never invoke the agent or touch git.               |

`--agent`, `--test-cmd` and `--max-attempts` may also be set in
`harness.config.yaml` so they need not be retyped:

```yaml
harness_version: 1
agent: "claude -p < {prompt_file}"
test_cmd: "npm test"
max_attempts: 3
```

CLI flags always override the file.

## The gate

The reward signal is `validate --strict-tdd` followed by the optional
`--test-cmd`. Both must exit zero for a requirement to count as passed.

**The gate is only as strong as the pack's scenarios.** A pack with weak
or vague Gherkin lets the harness wave through weak code. Hardening
`pack lint` to flag vague scenarios therefore matters _more_ than authoring
ergonomics — it is what makes the harness an amplifier of good specs
rather than an amplifier of bad ones.

## Retries

On a red gate, the harness captures the failing stage and its output,
appends it to the next prompt under "Previous attempt failed", and
re-invokes the agent in the same worktree. After `--max-attempts` the
requirement is **parked**: marked `fail` in the report, branch left for a
human to pick up.

## Report

```text
── harness report ──
  ✅ REQ-001  pass (1 attempt)   → harness/REQ-001
  ✅ REQ-002  pass (2 attempts)  → harness/REQ-002
  ❌ REQ-003  fail (3 attempts)  → harness/REQ-003
       Gate failed at: test command

  2 passed · 1 failed · 0 skipped
  Review and merge the harness/* branches you trust.
```

`--format json` emits the same data as a machine-readable structure for
CI dashboards. The command exits non-zero when any requirement did not
pass.

## Limitations

- `git` must be on `PATH`; the project must be a git repository.
- The harness does not merge branches — integration is a human decision.
- A requirement whose `harness/REQ-NNN` branch already exists is skipped
  unless `--force` is passed (which deletes and recreates the branch).
