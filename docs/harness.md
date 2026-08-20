<!-- csda:allow-placeholders -->
# The harness

```bash
csda harness init
```

Writes `harness.config.yaml` and `.harness/prompt-prefix.md`, detects the gate
from your build files, and leaves `agent:` unset — which agent runs the loop is
your choice and your credentials.

Name the agent when you run it:

```bash
csda harness run --req REQ-001 \
  --agent "claude -p --allowedTools Read Write Edit Glob Grep 'Bash(npm:*)' < {prompt_file}"
```

**The tool allowances matter.** An agent in non-interactive mode has no way to
ask permission, so without them it reads the prompt, cannot write a file, and
the attempt is wasted. Scope them rather than reaching for
`--dangerously-skip-permissions`: the agent needs `Bash` to run the project's
build, and `Bash(npm:*)` is enough for a Node project. It works in a throwaway
git worktree, which is the whole reason the harness uses one.

Other agents take the prompt differently — `aider --yes --message-file
{prompt_file}`, `opencode run "$(cat {prompt_file})"`. The harness only requires
that the command contain `{prompt_file}`.

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

## Run more than one requirement at a time

```bash
csda harness run --concurrency 4
```

**Only requirements that do not depend on each other ever run together.** The
harness reads the dependency graph — the `depends=` keys in each requirement's
`csda:trace` comment — and processes the queue in levels: everything in a level
is independent, so it can go out to the pool at once; the next level waits.

**A failure blocks what waits on it; it does not fail it.** Before dependencies
were expressible, one broken predecessor produced a failure for every
requirement behind it — N failures for one cause, and N agent invocations paid
for work that could not have succeeded. Now the report says so:

```
  ❌ REQ-001  fail (1 attempt)     → harness/REQ-001
  ⛔ REQ-002  blocked (0 attempts) → harness/REQ-002
       Not attempted: REQ-001 did not pass.

  0 passed · 1 failed · 0 skipped · 1 blocked
```

A requirement caught in a dependency cycle is reported the same way and never
attempted; `csda validate` is what explains the cycle and how to break it.

**The base is derived, not passed.** A requirement is cut from the branch of
the dependency it builds on, because that is the only place its code exists
during a run. Nobody has to know the order and pass `--base-branch` by hand —
which used to cost a whole agent run when the base turned out to be missing a
fix that had landed on `main`. The harness now says so when it happens:

```
⚠️  REQ-002: base harness/REQ-001 is 3 commit(s) behind main.
    A fix that landed on main is not in this worktree —
    a gate failure may not be about REQ-002.
```

**A requirement with several dependencies gets them merged.** Their branches
know nothing of each other, so cutting from one would silently omit the rest.
The harness assembles a throwaway `harness/base/REQ-NNN` first. Two things
worth knowing about it:

- It resolves conflicts in `docs/specs/traceability.md` by keeping the base's
  version. Sibling branches *always* conflict there — each run ends with `csda
  done`, editing the same table — and the integration base exists only so the
  agent can see code. Each real `harness/REQ-NNN` branch keeps its own row.
- A conflict in an actual source file blocks the requirement and names the
  file. That is a genuine finding: two dependencies changed the same code in
  incompatible ways, and no automatic answer would be right.

This is not the merge the harness refuses to do. That one is into a branch a
human reviews; this one assembles the context a requirement was declared to
need, and it is thrown away afterwards.

**The default is 1, deliberately.** Two reasons, and neither is timidity:

- Every step of a requirement — the gate, the agent, `csda done`, git — is a
  blocking call, so above 1 each requirement runs in a worker process. That
  path is newer than the serial one, which has years of real agent runs behind
  it.
- Parallelism moves the bottleneck rather than removing it. Four green branches
  are four reviews, and the harness still never merges.

`concurrency: 4` in `harness.config.yaml` sets it for the project.

## When a run fails

The report prints the tail of the gate output and names the command that
failed — a gate that runs the whole suite because a filter did not apply looks
identical to a real failure otherwise.

The attempt is **committed on the branch** with a `wip(REQ-NNN): FAILED the
gate` subject, so the agent's work is there to read instead of discarded. The
requirement stays `Draft`, because `csda done` never ran.

```bash
csda harness run --req REQ-002 --format json      # the whole gate output
csda harness run --req REQ-002 --keep-worktrees   # reproduce it in place
```

**A requirement that builds on another needs its branch as the base:**

```bash
csda harness run --req REQ-002 --base-branch harness/REQ-001
```

That branch also supplies the project configuration for the run, so a fix
committed to `main` does not apply to a stacked run until the base has it. A
false failure from that is indistinguishable from a real one — check the gate
command the report prints.

---

## Next

- [Automation](automation.md)
- [The harness spec](specs/harness.md)
- [Command reference](commands.md)
