# How-to guides

Task-shaped guides, each self-contained. Copy/paste should work end to end.

<!-- csda:note -->
**Node.js ≥ 22**, `git`, a shell. Every command that operates on a project
accepts `--project-dir <path>` and also walks up from the current directory
looking for `spec.md`, `.specops.lock` or `specops.config.yaml`.
<!-- csda:endnote -->

## By task

| I want to… | Guide |
| --- | --- |
| Start, on a new project or an existing repo | [Getting started](getting-started.md) |
| Write requirements, scenarios and matrix rows | [Writing specs](writing-specs.md) |
| Make the gate run locally and in CI | [Validating](validating.md) |
| Change a spec that already shipped | [Reviewing changes](reviewing-changes.md) |
| Share domain knowledge across repos | [Domain packs](domain-packs.md) |
| Wire it into editors, agents, hooks and CI | [Automation](automation.md) |
| Drive it from Claude, Cursor or Copilot | [Agents](agents.md) |
| Work out why something is not behaving | [Troubleshooting](troubleshooting.md) |
| Look up a command | [Command reference](commands.md) |

## By adoption level

Each level is useful on its own and never requires the ones above it.

| Level | You get | Read |
| --- | --- | --- |
| **L1** | Traceable specs in the repo | [Getting started](getting-started.md), [Writing specs](writing-specs.md) |
| **L2** | A PR gate that enforces spec and test coverage | [Validating](validating.md) |
| **L3** | Versioned, reusable domain requirements | [Domain packs](domain-packs.md) |
| **L4** | Agent-driven delivery, one requirement at a time | [Automation](automation.md), [Agents](agents.md) |

## Longer reads

<!-- csda:cards cols=3 -->
- [Quickstart](quickstart.md) — One page, for joining a project that already uses this.
- [Walkthrough](walkthrough.md) — The shortest complete pass, on a real public pack.
- [Tutorial](tutorial.md) — The long-form version, with the reasoning at each step.
<!-- csda:endcards -->

The tutorial is deliberately one file: it is a narrative, not a set of tasks.
