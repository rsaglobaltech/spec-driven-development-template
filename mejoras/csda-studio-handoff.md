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
| 4   | `csda init` + `csda specops add` against the tagged pack                                                                                                                                                            | `csda-studio-app` repo        | ✅      |
| 5   | **Phase 1 bootstrap** — paste `docs/bootstrap-prompt.md` (from this repo) into opencode; produce Vite/React/TS scaffold + Vitest + Playwright + Cucumber wired, hex skeleton, **REQ-015 (health)** green end-to-end | `csda-studio-app` repo        | ⏳ NEXT |
| 6   | Commit Phase 1 result                                                                                                                                                                                               | `csda-studio-app` repo        | ⏳      |
| 7   | Add `harness.config.yaml` with `prompt_prefix_file: ./.harness/prompt-prefix.md` (Role / Active Project Boundary / Execution Policy)                                                                                | `csda-studio-app` repo        | ⏳      |
| 8   | `csda harness run --req REQ-001` … `REQ-014` (REQ-015 already done in Phase 1)                                                                                                                                      | `csda-studio-app` repo        | ⏳      |
| 9   | Review + merge each `harness/REQ-NNN` branch                                                                                                                                                                        | `csda-studio-app` repo        | ⏳      |
| 10  | Tag the app `v0.1.0`, deploy as static site                                                                                                                                                                         | `csda-studio-app` repo        | ⏳      |

---

## Immediate next action

**Phase 5 — Phase 1 bootstrap inside `csda-studio-app`.** The agent
doing this should, from inside a fresh clone of `csda-studio-app` at
the commit just pushed in Phase 4:

1. Read `docs/bootstrap-prompt.md` from this repo
   (`create-spec-driven-app`) and adapt it: the stack section reads
   "Vite + React 18 + TypeScript 5 + Tailwind + Vitest + Playwright +
   Cucumber-JS", the project name reads "Csda Studio", the slug reads
   "csda-studio-app". Confirm `AI_RULES.md` already carries the same
   stack via the pack render — it should.
2. Paste the adapted bootstrap prompt into **opencode** (or Claude /
   Aider — whichever the harness will use). The goal is a minimal
   working scaffold:
   - `package.json` + `vite.config.ts` + `tsconfig.json` +
     `tailwind.config.js` + `postcss.config.js`.
   - `src/domain/`, `src/application/`, `src/adapters/`, `src/ui/`
     directories created with a placeholder file each (so the
     hex-lite layout is visible from day one).
   - Vitest configured (`vitest.config.ts`) with one passing dummy
     unit test.
   - Playwright + Cucumber-JS wired (`playwright.config.ts`,
     `tests/e2e/` with one step-definition file).
   - `npm run dev`, `npm run test`, `npm run test:e2e` and
     `npm run build` all succeed.
   - **REQ-015 (health) green end-to-end**: `dist/health.json`
     present with `{"status":"UP"}`; the e2e scenario in
     `features/studio-shell/health_endpoint.feature` passes against
     the built output served by any static server.
3. Bump REQ-015 to `Implemented` in `docs/specs/traceability.md`.
4. Commit (`feat: phase 1 bootstrap — scaffold + REQ-015 green`).
5. Update this file: flip Phase 5 + Phase 6 to ✅, promote Phase 7
   (harness.config.yaml with prompt_prefix_file) to NEXT.

### Reference — how Phase 4 was done

`csda init` scaffold lives at the root of `csda-studio-app`
(`spec.md`, `AI_RULES.md`, `traceability.md`, env files, devcontainer,
GitHub workflows). `csda specops add` against tag `v0.1.0` of
`csda-studio-specops` rendered:

- 15 feature files under
  `features/{pack-browsing,pack-insights,studio-shell}/`,
- 15 new traceability rows (REQ-001..REQ-015, all `Draft`),
- `.specops.lock` pinning commit `bafd153` of the pack repo,
- `.specops/baseline/csdastudioapp/frontend/` with the verbatim
  rendered ancestor snapshot (do not delete — `specops sync` needs it
  for 3-way merges).

If you want to reproduce Phase 4 yourself, see the recipe in the
`csda-studio-specops` README under "How you could have authored this
pack yourself", then run the same `csda init` + `csda specops add`
pair on any fresh empty repo.

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
| 2026-05-15 | Phase 4 complete. `csda init` + `csda specops add --pack-repo csda-studio-specops --pack-version v0.1.0 --pack csdastudioapp/frontend` ran against the cloned repo. 15 feature files rendered, traceability matrix populated with REQ-001..REQ-015 rows, `.specops.lock` pins commit bafd153, `.specops/baseline/` snapshot in place. Pushed to main. | https://github.com/rsaglobaltech/csda-studio-app `main` |
