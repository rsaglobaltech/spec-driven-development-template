# Visual pack authoring — evaluation & TODO

**Status:** Proposal / not started
**Author:** evaluation requested 2026-05-14
**Scope:** how (and whether) to make `pack.yaml` + feature authoring more
visual — eraser.io MCP, alternatives, and the "build our own StudioApp"
question.

---

## 1. The actual problem

The friction in `pack.yaml` is **not** verbosity — a pack is written once
by an expert (tech lead / domain expert) and consumed many times. The real
friction is **manual cross-referencing by ID**:

```
REQ-001 → UC-001 → AGG-001 → EVT-001 → CMD-001
```

All linked by hand. The author is the "compiler" that keeps IDs
consistent; one typo and the linker breaks. JSON Schema autocompletes
keys but cannot answer "which AGG-IDs exist in this file".

So the goal of any visual tooling must be:

1. **See the graph** REQ→UC→AGG→EVT→CMD and have broken links shouted at you.
2. **Author without hand-maintaining IDs** — pick references from what exists.
3. **Invert the flow** — write the `.feature` first, derive the model
   (kills the waterfall smell).

A visualization that does not attack one of those three is decoration.

---

## 2. eraser.io evaluation

**What it is:** diagram-as-code + AI diagramming tool (architecture,
sequence, ERD, flowchart). Has an MCP server that lets an agent
create/update/render diagrams.

**Verdict: not a fit as a core dependency. Marginal, optional value for read-only viz.**

| Criterion | Assessment |
|---|---|
| Solves cross-referencing? | No. Eraser renders diagrams *from* text; it does not author or validate cross-referenced YAML. |
| Solves "what IDs exist"? | No. It has no model of `pack.yaml` semantics. |
| Inverts the flow (`.feature` → model)? | No. |
| Direction of data flow | Wrong way. We already *have* the structured data; we would only be feeding it to Eraser to draw. We can draw it ourselves. |
| Vendor lock-in | Yes — cloud, paid tiers, account required. Pack authoring would depend on a third-party SaaS being up. |
| Offline / CI | No. Diagrams render server-side. |
| Fits "vendor-neutral" thesis | No. The harness work just went out of its way to shell-out to *any* agent precisely to avoid lock-in. Adopting Eraser as the authoring surface contradicts that. |

**Where Eraser *could* marginally help:** a one-off, opt-in "export pack
graph to Eraser" command for someone who already pays for it and wants a
prettier canvas. That is a nice-to-have plugin, not a foundation. Do not
build the authoring story on it.

---

## 3. Alternatives evaluated

### 3.1 Emit the graph ourselves (Mermaid / D2 / Graphviz)

`pack lint --graph` emits the REQ→UC→AGG→EVT→CMD graph as **Mermaid** (or
D2/DOT) text.

- Free, text-based, no account, no network.
- Mermaid renders natively in GitHub, VS Code, most Markdown viewers.
- We **already have the parsed pack** in `lint_pack.ts` — emitting a graph
  is a serialization, not a new subsystem.
- Broken links (`UC-002 → AGG-099` where `AGG-099` does not exist) are
  drawn in red / listed — exactly the "shout at me" requirement.
- Composable: pipe into any renderer, including Eraser if someone wants.

**This is the highest leverage / lowest risk option.** It is the
recommended first step.

### 3.2 Extend the existing VS Code extension

`packages/vscode-spec-driven` already does pack.yaml schema squigglies +
validate-on-save + traceability navigation. It is the natural home for
*interactive* authoring:

- Hover an `AGG-001` ref → go-to-definition / peek.
- Autocomplete reference fields from IDs that exist in the file.
- CodeLens "3 use cases reference this requirement".
- A read-only graph webview (render the Mermaid from 3.1).

This reuses an installed surface instead of building a new app. Medium
effort, high payoff, no new product to maintain.

### 3.3 Build our own StudioApp

A standalone web app to author packs visually (drag REQ→UC→AGG nodes,
forms, live preview).

**Verdict: defer. Probably never as a separate product.**

- It is a **different product** with its own lifecycle, hosting, auth,
  state sync, and a permanent maintenance tax — while the core thesis
  ("spec-driven delivery harness for AI agents") is still being built.
- A GUI in front of an **unstable format** ossifies that format. The pack
  format still has open ergonomic questions (DDD opt-in, `pack infer`).
  Stabilize the format first; a GUI built now would fight every change.
- The CLI must stay the source of truth. Anything visual should be a
  *thin layer over the CLI*, not a replacement — otherwise the two drift.
- If a richer visual editor is ever justified, the VS Code extension
  (3.2) is the cheaper delivery vehicle than a from-scratch app.

If we ever do build it: only after the format is stable, only as a thin
CLI front-end, and scope it as a milestone of its own with explicit buy-in.

### 3.4 `pack infer` — invert the flow

Not a "visual" tool, but the highest-leverage ergonomic move and it
belongs in this evaluation. Author writes the `.feature` first; the tool
proposes `use_cases` / `commands` / `events`. Turns authoring from
model→scenario into scenario→model. Kills the waterfall smell that a
visual model-first editor would actually *reinforce*.

---

## 4. Recommendation

1. **Do not adopt eraser.io as core.** Optionally, much later, a tiny
   opt-in `--export eraser` plug-in. Not now.
2. **Build `pack lint --graph`** (Mermaid output) — owns the
   "see the graph + shout broken links" requirement, zero dependency.
3. **Invest in the VS Code extension** for interactive authoring
   (reference autocomplete, peek, graph webview).
4. **Defer the StudioApp.** Revisit only after the pack format is stable;
   if ever, deliver it through the VS Code extension, not a new app.
5. **Prioritize `pack infer`** over any visual editor — it removes the
   need rather than decorating it.

Guiding principle: **stabilize the format and the ergonomics first; put a
visual surface on top second.** A visual tool over an unstable,
hand-cross-referenced format is lipstick — and a vendor-locked one is
lipstick we rent.

---

## 5. TODO

### Phase 1 — `pack lint --graph` (low risk, high leverage) — ✅ DONE

- [x] Add `--graph` flag to `pack lint` (`scripts/lint_pack.ts`).
- [x] Add `--graph-format <mermaid|dot>` (default `mermaid`).
- [x] Build the node/edge model from the already-parsed pack:
      REQ → UC → (CMD|QUERY) → AGG → EVT (`buildPackGraph`).
- [x] Render Mermaid `graph LR` text to stdout (`renderMermaid`); DOT too
      (`renderDot`).
- [x] Mark broken edges (reference to a non-existent ID) as red `missing`
      nodes + print them as a summary list; exit non-zero on any break.
- [x] Unit tests: graph model, broken-link detection, Mermaid/DOT
      serialization (`tests/unit/pack-lint-graph.test.ts`); CLI
      integration tests in `tests/cli.test.ts`.
- [x] Docs: section 5b in `docs/specs/domain-pack-format.md`.
- [ ] (Optional, deferred) `--graph-out <file.md>` to write instead of
      stdout — shell redirection covers this for now.

### Phase 2 — VS Code extension authoring upticks

- [ ] Reference-field autocomplete: when editing a `requirement:`,
      `aggregate:`, `command:`, `emits:` field, suggest IDs/names that
      exist in the current `pack.yaml`.
- [ ] Go-to-definition / peek on an ID reference.
- [ ] CodeLens on `requirements[]`: "N use cases · M scenarios reference this".
- [ ] Diagnostic for dangling references (mirror `pack lint`'s cross-ref
      errors live in the editor).
- [ ] Graph webview: render the Phase 1 Mermaid output in a side panel,
      refresh on save.
- [ ] Extension tests for the above.

### Phase 3 — `pack infer` (separate track, highest ergonomic leverage)

- [ ] Spec the inference: `.feature` file → proposed `use_cases`,
      `commands`, `events` skeleton.
- [ ] `pack infer --from <feature-file>` emits a YAML fragment to merge.
- [ ] Decide: heuristic parse vs. LLM-assisted (shell-out, vendor-neutral —
      same pattern as `harness run`).
- [ ] Tests + docs + ADR.

### Phase 4 — StudioApp (DEFERRED — do not start)

- [ ] Re-evaluate only after: pack format stable, DDD opt-in shipped,
      `pack infer` shipped, and explicit stakeholder buy-in.
- [ ] If approved: scope as a thin CLI front-end delivered via the VS Code
      extension webview, not a standalone hosted app.
- [ ] Explicitly out of scope until the above gate is cleared.

### Optional — eraser.io escape hatch (only if a user asks)

- [ ] `pack lint --graph --graph-format eraser` (or a separate
      `--export eraser`) emitting Eraser's diagram syntax. Opt-in, no
      account handling in the CLI, no runtime dependency.

---

## 6. Open questions

- Mermaid vs D2 vs DOT as the default `--graph` format? Mermaid wins on
  "renders in GitHub/VS Code with zero setup"; D2 looks better. Lean
  Mermaid for ubiquity.
- Should `pack lint --graph` also cover `bounded_contexts` and
  `value_objects`, or keep the core REQ→…→EVT spine for legibility?
- `pack infer`: heuristic-only (deterministic, testable, no LLM) vs.
  LLM-assisted (richer, but needs the vendor-neutral shell-out pattern)?
- Does the VS Code extension work warrant its own ADR, or fold under the
  existing extension's changelog?
