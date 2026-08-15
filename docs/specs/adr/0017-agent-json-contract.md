# ADR-0017 — The agent JSON contract

## Status

Accepted — 2026-08-15

## Context

The CLI is already driven by machines: `harness run` shells out to an agent,
the MCP server wraps several commands, CI parses output. But only `plan
--format json` had a machine-readable mode, and nothing documented what the
other commands emit on failure. An agent driving the tool had to screen-scrape
prose and guess at exit codes.

The benchmark against OpenSpec found this to be the most under-rated part of
their design: a 140-line audited contract that fixes one JSON document per
invocation, a single diagnostic envelope, a catalogue of stable codes, and an
exit-code table. That is what turns a CLI into an API.

Their own contract also documents a set of known inconsistencies — snake_case
in one command family and camelCase in another, four parallel envelope
declarations in the source. We have the advantage of starting clean.

## Decision

Every agent-facing command follows the same rules.

**1. One JSON document per invocation.** In `--json` mode stdout carries
exactly one JSON document. Prose, spinners and progress go to stderr. A caller
can always `cmd --json 2>/dev/null | jq .`.

**2. One diagnostic envelope**, everywhere:

```json
{
  "severity": "error" | "warning" | "info",
  "code": "snake_case_stable_string",
  "message": "human sentence",
  "target": "the thing at fault (optional)",
  "fix": "one actionable sentence or command (optional)",
  "file": "relative/path.md (optional)",
  "line": 42
}
```

`code` is the stable surface — callers branch on it, never on `message`. A
check that cannot say what to do about its own finding is not finished: `fix`
is written at the same time as the check.

**3. Failure carries the command's null-shape.** In `--json` mode a failure
prints `{ ...nullShape, "status": [diagnostic] }` on stdout and exits 1. So
`change show --json` on a missing change prints `{"change": null, "status":
[…]}` — never bare stderr, never a partial document.

**4. camelCase everywhere in JSON.** Decided once, here.

**5. Exit codes.**

| Situation | Exit |
| --- | --- |
| Success, including advisory warnings | 0 |
| Command failure in `--json` mode (one JSON document with `status`) | 1 |
| `validate` with failing items | 1 |
| Usage error (unknown flag, missing argument) | 2 |
| Required script missing | 3 |

## Rationale

- **`fix` is the highest-value field.** An agent that receives "delta_unknown_section"
  plus "Use one of: ## ADDED Requirements, …" self-corrects. One that receives
  only an error message retries the same mistake.
- **A single envelope beats per-command shapes.** One renderer, one parser, one
  thing to learn.
- **camelCase decided up front** costs nothing now and avoids the rename we
  would otherwise owe once external callers depend on the keys.
- **The null-shape rule** means a consumer never has to distinguish "the
  command failed" from "the command printed nothing"; the document shape is the
  same either way.

## Alternatives considered

1. **Keep `--format json` as the flag name** (as `plan` uses today). Rejected
   for new commands — `--json` is shorter, is what agents try first, and does
   not imply other formats exist. `plan --format json` keeps working.
2. **Machine output on stderr, prose on stdout.** Rejected — backwards from
   every convention and breaks piping.
3. **A JSON Schema published per command.** Deferred, not rejected. The
   contract document plus snapshot tests come first; a schema is only worth
   maintaining once the shapes have stopped moving.
4. **Errors as non-zero exit only, no JSON body.** Rejected — the caller then
   has to parse stderr prose to learn *why*, which is exactly the screen-scraping
   this ADR removes.

## Consequences

### Positive

- Agents, CI and the VS Code extension consume one contract instead of one
  parser per command.
- Diagnostics get a `fix` by construction, which improves human output too.
- The contract is testable: a snapshot test per command shape fails when a
  field changes, so the published document cannot silently drift.

### Negative / trade-offs

- Every new command owes a null-shape and a set of codes. That is deliberate
  friction — it is the work of designing the surface, moved earlier.
- Existing commands (`validate`, `expand`, `specops`) do not yet comply. They
  are migrated in F2; until then the contract is documented as covering
  `change *` only, rather than claimed for everything.

## Follow-ups

- F2: `--json` across the remaining agent-facing commands, plus
  `docs/specs/agent-contract.md` generated from and verified by tests.
- A `codes` catalogue in that document, grouped by area, as the public list.

## References

- `scripts/lib/diagnostics.ts`
- `scripts/change/cli.ts` — first consumer
- `mejoras/openspec-benchmark-plan.md` §F2
