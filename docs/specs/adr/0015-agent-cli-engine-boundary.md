# ADR-0015 — `csda-agent`: the Claude Agent SDK behind an engine boundary

> **Numbering note.** The `feat/change-lifecycle` branch also introduces an
> ADR-0015. Whichever branch merges second renumbers; the content of both is
> independent.

## Status

Accepted — 2026-08-15

## Context

`harness run` already drives an agent, but it is a batch loop: build a prompt,
shell out, gate the result, commit or retry. There is no interactive surface —
no way to sit with the agent, watch it work, and steer it mid-task. That is the
mode most coding work actually happens in, and it is the mode Claude Code
established the expectations for: streaming text, visible tool calls,
interruption, permission modes.

Building that means answering one question first: what runs the agent loop?

Four options were on the table (`mejoras/agent-cli-plan.md` §2):

| # | Approach | Who supplies the loop | Built-in tools |
|---|---|---|---|
| A | **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) | The SDK — it is Claude Code as a library | Read/Write/Edit/Bash/Glob/Grep/WebFetch, MCP, subagents, hooks, permissions, sessions |
| B | Messages API **Tool Runner** (`client.beta.messages.toolRunner`) | The API SDK loops over tools *you* define | none |
| C | Messages API, hand-written loop | You | none |
| D | Managed Agents | Anthropic, plus a hosted sandbox | Anthropic's sandbox |

## Decision

**Build on the Agent SDK (option A), behind an `AgentEngine` interface.**

```ts
export interface AgentEngine {
  readonly name: string;
  run(input: TurnInput, signal: AbortSignal): AsyncIterable<AgentEvent>;
  usage(): UsageSnapshot;
  permissionMode(): PermissionMode;
  setPermissionMode(mode: PermissionMode): Promise<void> | void;
}
```

Everything the TUI paints is an `AgentEvent`. The TUI never imports the SDK,
never sees an `SDKMessage`, and cannot tell which engine is behind it.

Two engines ship: `SdkAgentEngine` (real) and `ScriptedAgentEngine`
(deterministic replay). The scripted one is reachable as `--engine scripted`,
documented in `--help` — not a mock hidden behind a test-only flag.

## Rationale

- **The Agent SDK is the harness, not a client library.** It brings the agent
  loop, the file and bash tools, context management, hooks, subagents,
  permissions and sessions. Reimplementing that on the Tool Runner is rewriting
  the part that is already solved and battle-tested. Time to a working REPL:
  days, not months.
- **The boundary costs almost nothing and buys the exit.** If the SDK ever
  fails to expose something we need — a custom transport, a permission policy
  that does not fit, our own session model — swapping the engine touches no
  rendering code. Without the boundary that swap is a rewrite.
- **A scripted engine is the only honest way to test a TUI.** It makes the
  abort test assert that `Esc` stops work in flight, and it lets the whole
  surface be developed without a network, an API key, or spent tokens.
- **Normalisation belongs in a pure function.** `normalize.ts` maps
  `SDKMessage → AgentEvent[]` with no I/O, so the mapping is unit-tested
  directly. It is also the only file that knows the SDK's message shapes, which
  is what keeps the blast radius of an SDK upgrade to one file.

### What the SDK's own types settled

The API was read from the installed `sdk.d.ts`, not from memory. One detail
would have been wrong otherwise, and wrong quietly:

> `modelUsage` and `total_cost_usd` are **cumulative across turns** in a
> streaming session — each `result` carries the running total.

They are read and replace the previous snapshot; summing them across results
double-counts every prior turn. A cost display that inflates over a long
session is exactly the kind of bug nobody notices until they are arguing about
a bill. There is a regression test.

## Alternatives considered

1. **Tool Runner (B).** Rejected for a general coding CLI: no built-in tools
   means reimplementing file editing, bash, glob and grep — including their
   safety properties — before writing a line of UI. It stays the right choice
   for a *domain-restricted* agent (one that may only touch `docs/specs/**` and
   run `csda validate`), where the built-in tools are a liability rather than an
   asset. That variant is F6 in the plan and is deliberately not built on spec.
2. **Hand-written loop (C).** Rejected: everything in B, plus owning the loop.
   Reserved for a control-flow need the SDK's surface cannot express.
3. **Managed Agents (D).** Rejected: it hosts the sandbox, and the entire point
   of this tool is to act on the user's checkout on their machine.
4. **No boundary — call the SDK from the components.** Rejected. It reads as
   less code on day one and makes every later change more expensive; it also
   makes the TUI untestable without a live API.

## Consequences

### Positive

- A working REPL with streaming, tool cards and real interruption in one phase.
- The TUI is testable without a network: `applyEvent` and `normalize` are pure.
- An SDK upgrade lands in `normalize.ts` plus `sdk-engine.ts`, nowhere else.

### Negative / trade-offs

- A dependency on a package whose message union grows between releases. Handled
  by normalising defensively: an unrecognised message maps to zero events rather
  than throwing, with a test asserting that.
- The package must be ESM — the SDK and Ink both are — while the rest of the
  repo is CommonJS. It carries its own `tsconfig.json` and is excluded from the
  root build. Two build systems in one repo is real friction, accepted because
  the alternative is no Ink and no SDK.
- `AgentEvent` is lossy by design: it carries what a user can see or act on, and
  drops most of the SDK's ~35 message types. Anything we later want to surface
  needs a new event rather than a passthrough.

## Follow-ups

- F2: settings hierarchy, permission engine and the interactive prompt. The
  `permission_request` event already exists in the vocabulary with no producer;
  `canUseTool` is where it gets wired.
- Run the TUI against a live model on a TTY. The pipeline is proven end to end
  with the scripted engine; the SDK engine compiles and its normaliser is
  covered, but the interactive path has not been exercised interactively.

## References

- `packages/agent-cli/src/engine/types.ts` — the boundary
- `packages/agent-cli/src/engine/normalize.ts` — the only file that knows SDK shapes
- `mejoras/agent-cli-plan.md` §2, §3
