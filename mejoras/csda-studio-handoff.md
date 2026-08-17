<!-- csda:allow-placeholders — this file documents the {{VAR}} template syntax. -->
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
| 5   | **Phase 1 bootstrap** — Vite/React/TS scaffold + Vitest + Cucumber wired, hex skeleton, **REQ-015 (health)** green end-to-end | `csda-studio-app` repo        | ✅      |
| 6   | Commit Phase 1 result — `bef5de4`, pushed to `main`                                                                                                                                                                 | `csda-studio-app` repo        | ✅      |
| 7   | Add `harness.config.yaml` with `prompt_prefix_file: ./.harness/prompt-prefix.md` (Role / Active Project Boundary / Execution Policy)                                                                                | `csda-studio-app` repo        | ⏳ NEXT |
| 8   | `csda harness run --req REQ-001` … `REQ-014` (REQ-015 already done in Phase 1)                                                                                                                                      | `csda-studio-app` repo        | ⏳      |
| 9   | Review + merge each `harness/REQ-NNN` branch                                                                                                                                                                        | `csda-studio-app` repo        | ⏳      |
| 10  | Tag the app `v0.1.0`, deploy as static site                                                                                                                                                                         | `csda-studio-app` repo        | ⏳      |

---

## Immediate next action

**Phase 7 — wire the harness inside `csda-studio-app`.** Phases 5 and 6 are
done: the scaffold is committed at `bef5de4` and REQ-015 is green end to end.

From a clone of `csda-studio-app` at `main`:

1. Add `harness.config.yaml` with `prompt_prefix_file: ./.harness/prompt-prefix.md`.
2. Write `.harness/prompt-prefix.md` with Role, Active Project Boundary and
   Execution Policy. The boundary matters here: the agent must not touch
   `features/**` or `docs/specs/**` — those come from the pack, and editing
   them turns a spec-driven run into an ordinary one.
3. Check the prompt before paying for tokens: `csda harness prompt REQ-001`.
4. Then Phase 8: `csda harness run --req REQ-001` … `REQ-014`.

What the agent inherits, and should not re-derive:

- The layering rules are in `AI_RULES.md` and are already enforced by the
  scaffold — `src/domain` and `src/application` have no React import, and
  `vitest.config.ts` has no React plugin, so a violation shows up as a build
  failure rather than as a review comment.
- `src/main.tsx` is the composition root and the only file that names a
  concrete adapter. New adapters get injected there.
- The pattern to copy for each requirement is REQ-015: domain type + pure
  function, port interface, use case, adapter, component, unit tests on the
  pure parts, and a Cucumber scenario that exercises the real artefact.
- `npm run verify` must stay green. `npm run test:e2e` goes from 14 undefined
  scenarios to 13, then 12, and so on — that countdown is the progress bar.

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
| 2026-08-17 | **Phases 5 and 6 complete.** Hexagonal scaffold committed as `bef5de4`: Vite + React 18 + TS 5, Vitest on the pure layers, Cucumber on the scenarios. **REQ-015 green end to end** — the scenario builds the app, serves the real `dist/` over a deliberately plain static file server and requests `/health.json`. `csda validate` passes; `csda status` reports 1 done of 16. | https://github.com/rsaglobaltech/csda-studio-app `bef5de4` |
| 2026-08-17 | **Playwright and Tailwind deliberately not installed yet.** The brief freezes them into the stack, but REQ-015 is an HTTP request against a static asset — no browser, no styling. They arrive with the first requirement that needs them rather than sitting unused in `package.json`. | app `README.md` |
| 2026-08-17 | **Vitest gets its own config file.** Vitest bundles its own copy of Vite, so a shared `vite.config.ts` makes `tsc` compare two different `Plugin` types and fail. Welcome side effect: the unit config has no React plugin, so the unit suite cannot quietly reach into `src/ui`. | `vitest.config.ts` |
| 2026-08-17 | **`npm run test:e2e` is red by design and stays red.** It runs all 16 scenarios; 14 have no step definitions because REQ-001..REQ-014 are unbuilt, and undefined steps are failures. That is the gate working. `npm run verify` (typecheck + unit + build) is the green signal until the harness fills them in. | app `README.md` |
| 2026-08-17 | **Dogfood finding: `init` + a pack produce two health requirements.** `csda init` seeds REQ-000 with `features/core/health.feature`; the pack then adds REQ-015 for the same purpose. Left in place — deleting a requirement is a spec decision, not a cleanup — but worth fixing in the CLI or in the pack. | `docs/specs/traceability.md` |
