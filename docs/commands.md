# Command reference

Every command, grouped by when you reach for it. `csda --help` shows the eight
of the daily loop; `csda --help --all` shows this whole surface, and
`csda config set profile full` makes that the default.

Each command takes `--json`. See [the agent contract](specs/agent-contract.md).

---

## Starting

| Command | What it does |
| --- | --- |
| `csda init` | Scaffold a new project. Interactive wizard when no `--config`. |
| `csda init --from-pack <repo>@<tag> --pack <id>` | Scaffold **and** install a pinned domain pack in one step. An unpinned reference is refused. |
| `csda adopt` | Install SDD on an existing repository. Never overwrites a file, never touches source. |
| `csda onboard` | Read an existing repository and propose the capabilities its layout implies, with the evidence for each. Writes nothing. |

## Every day

| Command | What it does |
| --- | --- |
| `csda status` | Where the project stands: totals by state, orphan features, locked pack versions, and the one command to run next. |
| `csda plan` | Requirements that still need a test, code or a status change. |
| `csda req add \| link \| done \| list` | Manage matrix rows without hand-editing the ten-column table. |
| `csda done <REQ>` | Mark a requirement Implemented. `--check` validates first. |
| `csda fix` | Apply the repairs `validate` suggests. `--dry-run` previews. |
| `csda validate [--strict-tdd] [--against-lock]` | The gate. Structure, traceability, Gherkin, TDD, and drift from the locked pack. |

## Changing a spec that already shipped

| Command | What it does |
| --- | --- |
| `csda change new <id> [--lite\|--full] [--schema <name>]` | Open a change. Reserves a `REQ` range so two changes in flight never collide. |
| `csda change status` | Which artefact to write next, in dependency order. |
| `csda change instructions <artifact>` | The template, the rules the validator enforces, the project's stack, and what writing it unblocks. |
| `csda change author <id>` | Have an agent write one artefact, confined to the change directory and gated by `change validate`. |
| `csda change validate` | Check the deltas. Runs inside `csda validate` too. |
| `csda change archive <id>` | Merge the delta into the specs, write the matrix rows, materialise the feature files. `--dry-run` first. |

→ [Reviewing changes](reviewing-changes.md)

## Domain packs

| Command | What it does |
| --- | --- |
| `csda pack init \| lint \| infer \| bundle` | Scaffold (`--type backend\|frontend\|mobile\|contracts`), lint (`--strict`, `--graph`, `--json`), infer from a `.feature`, or export as a git bundle for air-gapped use. Lint runs the installer's own validation, so passing means installable. |
| `csda specops add \| remove` | Install or drop a pack. Writes `.specops.lock`. |
| `csda specops sync` | Re-render locked packs, three-way merging your edits. |
| `csda specops diff [--as-change]` | Preview a version bump — as files, or as a reviewable change proposal. |
| `csda specops contribute --change <id>` | Send a local change back upstream to the pack. Never pushes. |
| `csda expand` | Low-level pack render. `specops add` is the ergonomic path. |

→ [Domain packs](domain-packs.md)

## Automation and CI

| Command | What it does |
| --- | --- |
| `csda harness init` | Scaffold `harness.config.yaml` and `.harness/prompt-prefix.md`. Detects the gate from your build files; leaves the agent unset on purpose. |
| `csda harness run` | The plan → agent → verify → done loop, one git worktree per requirement. Never merges. |
| `csda harness prompt <REQ>` | Print the prompt the harness would hand an agent, before paying for tokens. |
| `csda ci init` | Generate the spec gate for GitHub, GitLab, Azure or Jenkins. |
| `csda alm sync` | Sync requirements with Jira or Azure Boards — create, close, report drift. |
| `csda alm status` | The requirement ↔ issue mapping, without touching the network. |
| `csda alm link <REQ> <issue>` | Adopt an issue that already exists into the mapping. |
| `csda report` | Spec-coverage dashboard as a self-contained HTML file. |
| `csda doctor` | Diagnose the project and the environment. Every finding ships a fix. |

→ [Automation](automation.md) · [The harness](harness.md) · [Jira and Azure Boards](alm.md)

## Agents

| Command | What it does |
| --- | --- |
| `csda agents init [--tool <names>]` | Slash commands and instruction files for Claude Code, Cursor, Copilot, Windsurf, Aider, Gemini, Cline, Codex and Antigravity. |
| `csda update` | Refresh those generated files after a CLI upgrade, three-way merging your edits. Conflicts are reported, never resolved silently. |

→ [Agents](agents.md)

## Customising

| Command | What it does |
| --- | --- |
| `csda config set profile core\|full` | How much of this surface `--help` shows. |
| `csda config set language es\|pt` | Language for generated prose. `SHALL` and `GIVEN`/`WHEN`/`THEN` never translate. |
| `csda config init` | Write a starter `project.yaml`. |
| `csda schema which \| init \| fork \| validate` | Inspect or fork the artefact graph a change follows. Ships `spec-driven` and `bdd-first`. |
| `csda completion bash\|zsh\|fish [--install]` | Shell completion. |
| `csda studio [--port <n>] [--json]` | Serve a local, read-only HTML view of the spec tree. |

---

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success, including advisory warnings |
| `1` | Failure, or a gate that found something |
| `2` | Usage error — unknown flag, missing argument |
| `3` | A required script is missing (a broken installation) |

→ [The agent contract](specs/agent-contract.md) for the JSON envelope and the
full diagnostic code catalogue.
