# 🛰️ CsdaStudioApp dogfood — agent handoff

> **If you are an AI agent picking this up cold, read this file first,
> then `mejoras/csda-studio-brief.md`, then `docs/specs/architecture.md`,
> then `docs/bootstrap-prompt.md`.** Update this file at every milestone so
> the next agent (human or AI) can resume without re-deriving context.

---

## What this experiment is

Use **`create-spec-driven-app`** (this repo) to build its own companion
studio. If our tool cannot deliver its own companion app via its own
flow, the flow is not real.

Two new repos host the experiment:

| Repo                  | Role                                           | URL                                                      | Status                                               |
| --------------------- | ---------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `csda-studio-specops` | the domain **pack** (versioned spec)           | https://github.com/rsaglobaltech/csda-studio-specops.git | empty — pack author starts here                      |
| `csda-studio-app`     | the **implementation** (Vite + React + TS SPA) | https://github.com/rsaglobaltech/csda-studio-app.git     | empty — consumer starts here once the pack is tagged |

The seed brief sits at **`mejoras/csda-studio-brief.md`** in this repo.
Treat it as the source of truth for behaviour during the experiment.

Confirmed stack (frozen): **Vite + React 18 + TypeScript 5 + Tailwind +
Vitest + Playwright + Cucumber-JS**, hexagonal-lite layout, static SPA.

Confirmed scope (frozen for v0.1.0): REQ-001 … REQ-015 from the brief.
Stretch list explicitly NOT in v0.1.0.

---

## Phases

| #   | Phase                                                                                                                                                                                                               | Where it happens              | Done?   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------- |
| 0   | Seed brief (this repo, `mejoras/csda-studio-brief.md`)                                                                                                                                                              | `create-spec-driven-app` repo | ✅      |
| 1   | Author the pack — `pack.yaml` + `templates/AI_RULES.md.tpl` + `templates/spec.md.tpl` + `templates/features/**/*.feature.tpl`                                                                                       | `csda-studio-specops` repo    | ✅      |
| 2   | `csda pack lint --pack-root . --pack csdastudioapp/frontend --strict` + `--graph` clean                                                                                                                             | `csda-studio-specops` repo    | ✅      |
| 3   | Tag the pack `v0.1.0` and push                                                                                                                                                                                      | `csda-studio-specops` repo    | ✅      |
| 4   | `csda init` + `csda specops add` against the tagged pack                                                                                                                                                            | `csda-studio-app` repo        | ⏳ NEXT |
| 5   | **Phase 1 bootstrap** — paste `docs/bootstrap-prompt.md` (from this repo) into opencode; produce Vite/React/TS scaffold + Vitest + Playwright + Cucumber wired, hex skeleton, **REQ-015 (health)** green end-to-end | `csda-studio-app` repo        | ⏳      |
| 6   | Commit Phase 1 result                                                                                                                                                                                               | `csda-studio-app` repo        | ⏳      |
| 7   | Add `harness.config.yaml` with `prompt_prefix_file: ./.harness/prompt-prefix.md` (Role / Active Project Boundary / Execution Policy)                                                                                | `csda-studio-app` repo        | ⏳      |
| 8   | `csda harness run --req REQ-001` … `REQ-014` (REQ-015 already done in Phase 1)                                                                                                                                      | `csda-studio-app` repo        | ⏳      |
| 9   | Review + merge each `harness/REQ-NNN` branch                                                                                                                                                                        | `csda-studio-app` repo        | ⏳      |
| 10  | Tag the app `v0.1.0`, deploy as static site                                                                                                                                                                         | `csda-studio-app` repo        | ⏳      |

---

## Immediate next action

**Phase 4 — bootstrap the implementation repo.** The agent doing this
should, from inside an empty clone of `csda-studio-app`:

1. `csda init --out .` and answer (or pass on the CLI) the project
   variables: `PROJECT_NAME="Csda Studio"`, `PROJECT_SLUG=csda-studio`,
   `DOMAIN="spec-driven authoring"`,
   `STACK="Vite + React 18 + TypeScript 5 + Tailwind"`,
   `API_STYLE="browser-only, no network"`,
   `TESTING="Vitest + Playwright + Cucumber-JS"`.
2. Add the tagged pack:
   ```bash
   csda specops add \
     --pack-repo https://github.com/rsaglobaltech/csda-studio-specops.git \
     --pack-version v0.1.0 \
     --pack csdastudioapp/frontend
   ```
3. Verify `AI_RULES.md`, `spec.md` and `features/**` were rendered with
   the variables substituted.
4. Commit the rendered output as the first commit of `csda-studio-app`
   (no implementation yet — that's Phase 5).
5. Update this file: flip Phase 4 to ✅ and promote Phase 5 to NEXT.

### Reference — how Phase 1 was done

The pack is now live at
[`csda-studio-specops`](https://github.com/rsaglobaltech/csda-studio-specops)
tagged `v0.1.0`. The repo's `README.md` walks through the authoring
recipe end-to-end (`csda pack init` → translate brief → templates →
lint → tag) for anyone who wants to reproduce the work or write a new
pack from scratch.

Phase 1 used to read:

1. Clone `csda-studio-specops`.
2. Copy `mejoras/csda-studio-brief.md` from this repo into that one (as
   `BRIEF.md` for posterity).
3. Run `csda pack init --out . --name "CsdaStudioApp" --type frontend`.
4. Open the generated `pack.yaml` and translate each REQ-NNN from the
   brief into:
   - one `requirements[]` entry,
   - one `use_cases[]` entry per REQ,
   - the `commands[]`/`queries[]`, `aggregates[]` (here read more as
     "frontend modules") and `events[]` (UI events / state changes) the
     scenario implies,
   - one `scenarios[]` entry pointing at the rendered feature template.
5. Render each Gherkin block from the brief into
   `templates/features/<area>/REQ-NNN.feature.tpl`. **Keep the steps
   stack-neutral** — no Playwright / React / Tailwind vocabulary; the
   stack lives in `AI_RULES.md.tpl`.
6. Author `templates/AI_RULES.md.tpl` and `templates/spec.md.tpl` using
   the constraints from §2 of the brief; stack via `{{STACK}}` only.
7. Run `csda pack lint --pack-root . --pack frontend --strict` until
   green, and `csda pack lint --pack-root . --pack frontend --graph` to
   eyeball the spine.
8. Commit, `git tag v0.1.0`, push.

**Then update this file** — flip Phase 1, 2 and 3 to ✅, set Phase 4 as
NEXT, record the commit SHA and tag in the "Recent decisions" section
below.

---

## Files and links the next agent needs

- Seed brief: `mejoras/csda-studio-brief.md`
- Bootstrap prompt for the app's Phase 1: `docs/bootstrap-prompt.md`
- Full architecture: `docs/specs/architecture.md`
- Pack format reference: `docs/specs/domain-pack-format.md`
- Tutorial (concrete commands and ordering):
  `docs/tutorial.md`
- Reference pack to mimic structure: `tests/fixtures/domain-packs/parking-management/backend/pack.yaml`

CLI version published: **0.1.4**. Install with
`npm i -g create-spec-driven-app@0.1.4` or use `npx create-spec-driven-app@0.1.4 …`.

---

## Update rule (please follow)

After **every** completed milestone:

1. Flip its row in the Phases table to ✅.
2. Promote the next phase to "⏳ NEXT".
3. Append a one-line note to "Recent decisions" below with date, what
   was decided/done, and the commit/tag if any.
4. Commit this file with a message like
   `docs(studio-handoff): phase N complete — <summary>`.

That way the next agent can resume at the right phase without reading
the whole conversation history.

---

## Recent decisions

| Date       | Decision / event                                                                                                                                                      | Refs                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 2026-05-15 | Seed brief authored and approved (stack + scope confirmed: Vite + React 18 + TS 5 + Tailwind + Vitest + Playwright + Cucumber-JS; REQ-001…REQ-015 frozen for v0.1.0). | `mejoras/csda-studio-brief.md` |
| 2026-05-15 | Both empty repos created on GitHub: `csda-studio-specops`, `csda-studio-app`. Phase 1 not yet started.                                                                | —                              |
| 2026-05-15 | Handoff doc created. Next concrete action: author the pack in `csda-studio-specops` per the brief.                                                                    | this file                      |
| 2026-05-15 | Phases 1-3 complete. Pack authored, lint --strict + --graph clean, tagged `v0.1.0` and pushed. Pack contains 15 REQs / 15 UCs / 10 CMDs / 5 QRYs / 4 AGGs / 15 EVTs / 15 SCNs. README at `csda-studio-specops` documents the authoring recipe.    | https://github.com/rsaglobaltech/csda-studio-specops tag v0.1.0 |
