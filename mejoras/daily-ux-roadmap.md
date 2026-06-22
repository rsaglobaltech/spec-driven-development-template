# Daily-UX Roadmap — make `csda` intuitive day-to-day

> **Goal.** The CLI is feature-complete but optimised for the expert author.
> This plan reduces day-to-day friction for the *consumer* — the developer who
> scaffolds a project, then runs `validate` / `plan` / `done` every day.
>
> **Scope.** CLI UX only (`bin/`, `scripts/`, docs). No new domain capability.
>
> **Source.** Analysis snapshot 2026-06-22, `main` @ `15d277e`.
> Complements [`IMPROVEMENTS.md`](../IMPROVEMENTS.md) (internal SDD/DDD dogfood)
> and [`implementation-roadmap.md`](./implementation-roadmap.md) (done).

---

## Progress — 2026-06-22

> **Phases 0–3 complete + Phase 4 mostly shipped (16/17; 4.2 scaffolded).** Shipped on branch
> `feature/daily-ux-roadmap` (not yet merged to `main`):
>
> - `d791e20` feat(req) — `csda req`
> - `561d956` refactor(ts) — import/export migration
> - `950c88f` build(ts) — strict mode
> - `f25fbab` feat(ux) — Phase 0 (0.2–0.5)
> - `6656448` feat(ux) — Phase 1 (1.1–1.3)
> - `08651c1` feat(ux) — Phase 2 (2.1–2.4)
> - `d9715b6` feat(ux) — Phase 3 (3.1–3.2)
> - `0dff23d` feat(ux) — Phase 4 (4.1 LSP, 4.3 studio, 4.2 scaffold)
>
> **Shipped commands/flags:** `csda req` (add/link/done/list + TUI), `csda fix`,
> `validate --fix`, actionable `validate` errors, `csda status` (+`--json`),
> interactive `csda init` (+`--minimal`, `--out` defaults to cwd), next-step
> hints, [`docs/quickstart.md`](../docs/quickstart.md), `csda config init`,
> `csda doctor`, `csda completion bash|zsh`, `csda` promoted across the docs,
> `expand`→`specops add` steer, `--json` on plan/status/validate/doctor,
> `csda studio`, and the [`lsp-spec-driven`](../packages/lsp-spec-driven) server.
>
> **Remaining:** 4.2 IntelliJ plugin needs a JDK/Gradle build pipeline (scaffold
> in [`packages/intellij-spec-driven`](../packages/intellij-spec-driven)) — the
> only open item; everything else is shipped and verified green.
>
> Legend below: ✅ done · 🚧 partial/scaffold · ⬜ not started.

---

## Diagnosis — where the friction is

| Area              | Today                                                                              | Pain                                          |
| ----------------- | --------------------------------------------------------------------------------- | --------------------------------------------- |
| First run         | `init` requires a hand-written `--config` YAML + `--out`                           | 3 steps (copy → edit → run) before anything   |
| Project context   | `resolveProjectDir` already auto-detects from cwd ✅                                | OK — keep                                     |
| "What now?"       | `plan` lists pending REQs, but no single entry command or next-step hint           | User must remember the workflow               |
| Invocation        | Docs push `npx create-spec-driven-app@latest …`; `csda` alias exists but hidden    | Verbose, high typing cost                     |
| Discoverability   | 14 commands, no shell completion, no `doctor`                                      | Hard to learn / verify environment            |
| Two paths         | `expand` vs `specops add` do overlapping things; README marks `expand` "low-level" | Mental ambiguity about the right command      |
| Machine output    | `--json` only on `plan`                                                            | Inconsistent for scripting / AI agents        |
| **Hand-editing**  | `traceability.md` is a 10-column pipe-delimited markdown table edited by hand       | **#1 "engorroso" complaint** — one typo breaks linking |
| **Error UX**      | `validate` prints bare `❌ [ERROR] …` / `[TDD-1] …` with no fix or `file:line`      | Devs see a scolding, not a solution           |
| Onboarding        | 917-line tutorial, 624-line how-to; nothing for a dev *joining* an existing repo    | Wall of docs before first useful action       |
| Heavy scaffold    | Generated project ships 7 `.env.*` files + docker + devcontainer                    | Overwhelming on day 1                         |

---

## Phase 0 — Adoption blockers (P0, do first)

> The real source of the "cumbersome / hard to use" complaint. Company devs
> mostly *join* an already-scaffolded repo; their daily friction is hand-editing
> markdown tables and decoding cryptic `validate` failures. Fix this before the
> nicety work in Phases 1–3.

### 0.1 `csda req` — mutate traceability by command, never by hand
- **Now:** devs hand-edit the 10-column table in
  `templates/base/docs/specs/traceability.md.tpl` (and its instance). One
  misaligned pipe or wrong ID breaks the linker silently.
- **Do:** add subcommands that own the table:
  - `csda req add "<title>"` → append a well-formed row, auto-assign `REQ-NNN`.
  - `csda req link REQ-007 --test <path> --feature <path> --uc UC-003 …` → fill a
    column without touching markdown.
  - `csda req done REQ-007` → status transition (wraps existing `done`).
  - `csda req list` → readable view (not raw pipes).
- **Interactive by default** (the key to "intuitive"): `csda req` with no args
  opens a TUI picker — list REQs, arrow-select, choose action. When a flag is
  missing, prompt instead of erroring. Pick `--test`/`--feature` from existing
  files (fuzzy over the repo), don't paste paths. Auto-assign `REQ-NNN` /
  `SCN-NNN`, infer test path by convention (`features/**`, `*.test.*`); dev
  confirms. Non-TTY / `--yes` stays fully flag-driven for CI.
- **Files:** new `scripts/req.ts` (parse/serialise the matrix), reuse
  `plan.ts` row parser + `lib/project-root.ts`; wire in `bin/`.
- **Done when:** a dev never opens `traceability.md` in an editor for normal work,
  and `csda req` alone is enough to drive the daily loop.

### 0.2 Actionable error messages
- **Now:** `validate_specs.ts` emits bare `❌ [ERROR] <what>` and
  `[TDD-1] Test artifact is TBD but status is 'Implemented'` — no cause, no fix,
  inconsistent `file:line`.
- **Do:** every failure prints `cause → fix → file:line → suggested command`.
  e.g. `[TDD-1] REQ-007 has status 'Implemented' but Test artifact is TBD`
  `docs/specs/traceability.md:9 → run: csda req link REQ-007 --test <path>`.
- **Files:** `scripts/validate_specs.ts` (shared `reportFailure()` helper).
- **Done when:** each failure tells the dev the exact next command.

### 0.3 `csda fix` / `validate --fix`
- **Do:** auto-repair the mechanical violations — append missing matrix rows for
  REQs found in `spec.md`, register orphan `.feature` files, normalise obvious
  status/ID mismatches. Print a diff, gate behind confirmation or `--yes`.
- **Files:** `scripts/validate_specs.ts` + reuse `req.ts` mutators.
- **Done when:** `csda fix` clears the common `validate` failures unattended.

### 0.4 One-page QUICKSTART for joiners
- **Do:** a short "you just cloned a spec-driven repo" page — `csda status` →
  `csda plan` → pick a REQ → work → `csda req done`. Linked first from README,
  above the 917-line tutorial.
- **Files:** new `docs/quickstart.md`, README link.

### 0.5 `csda init --minimal`
- **Do:** scaffold without the 7 `.env.*` files / docker / devcontainer. Heavy
  runtime contract becomes opt-in (`--with-runtime`).
- **Files:** `scripts/init_project.ts`, gate the runtime templates.
- **Done when:** a minimal project is just specs + features + traceability.

**Exit gate P0:** a dev can join a repo, see state, fix a `validate` failure, and
mark a REQ done — without editing markdown by hand or reading the full tutorial.

> ✅ **Phase 0 complete** — `csda req`, actionable `validate` errors, `csda fix` /
> `validate --fix`, [`docs/quickstart.md`](../docs/quickstart.md), and
> `csda init --minimal` are all shipped.

---

## Phase 1 — Day-1 friction (P0)

> Highest return/effort. Target: scaffold + understand state with zero hand-edited files.

### 1.1 Interactive `init` wizard
- **Now:** `init` exits `2` without `--config` (`scripts/init_project.ts:379`).
- **Do:** when no `--config` and `stdout.isTTY`, prompt for `PROJECT_NAME`,
  `PROJECT_SLUG` (derived default), `PROJECT_TYPE`, `STACK`, `DOMAIN`. Write the
  config + scaffold in one pass. `--config` still works for CI / non-TTY.
- **Files:** `scripts/init_project.ts`, `bin/create-spec-driven-app.ts`.
- **Done when:** `csda init` in a TTY produces a valid project with no flags.

### 1.2 `csda status` command
- **Do:** one dashboard — REQ totals (implemented / pending / orphan), pack
  versions from `.specops.lock`, and a **suggested next command**
  (e.g. "3 REQ missing a test → run `csda plan`").
- **Files:** new `scripts/status.ts`, wire in `bin/`, reuse `plan.ts` classify
  logic + `lib/project-root.ts`.
- **Done when:** `csda status` from any project subdir prints state + next step.

### 1.3 Contextual "next step" hints
- **Do:** every command ends with a one-line next hint.
  - `init` ok → `next: cd <slug> && csda validate`
  - `validate` fail → `next: csda plan` to see gaps
  - `done` ok → `next: csda status`
- **Files:** `bin/create-spec-driven-app.ts` (shared `nextHint()` helper) or per
  script. Respect `NO_COLOR` / non-TTY (suppress hints when piped).

**Exit gate P1:** new user scaffolds, validates, and sees what to do next without
reading the README.

> ✅ **Phase 1 complete** — interactive `csda init` (TTY wizard, `--out` defaults
> to cwd), `csda status` (dashboard + single next command, `--format json`), and
> next-step hints on `init` / `validate` / `done` (TTY-gated).

---

## Phase 2 — Discoverability (P1)

### 2.1 Promote `csda` in docs
- Replace `npx create-spec-driven-app@latest …` with `csda …` across README /
  tutorial / how-to after the first install line. Keep one canonical `npx`
  example up top.
- **Files:** `README.md`, `docs/tutorial.md`, `docs/how-to.md`.

### 2.2 `csda config init`
- Generate a commented `project.yaml` starter in cwd. Feeds 1.1 as the
  non-interactive seed.
- **Files:** new `scripts/config_init.ts`, `bin/`.

### 2.3 `csda doctor`
- Check Node ≥ 20, `git` present, and project health (lock present, traceability
  parses, no orphan features). One-shot diagnostic with pass/fail lines.
- **Files:** new `scripts/doctor.ts`, `bin/`.

### 2.4 Shell completion
- `csda completion zsh|bash` emits a completion script: commands, sub-commands,
  REQ-ids (from `traceability.md`), pack ids (from `.specops.lock`).
- **Files:** new `scripts/completion.ts`, `bin/`, docs install note.

**Exit gate P2:** `csda <tab>` completes; `csda doctor` green on a healthy repo.

> ✅ **Phase 2 complete** — `csda` promoted across README/how-to (install-once tip;
> Quickstart keeps the canonical `npx`), `csda config init`, `csda doctor`
> (env + project health, CI-friendly exit code), and `csda completion bash|zsh`.

---

## Phase 3 — Coherence (P2)

### 3.1 Unify `expand` / `specops add`
- Make `expand` an internal/alias path or print a deprecation hint pointing to
  `specops add`. One mental model for "apply a pack".
- **Files:** `bin/create-spec-driven-app.ts`, `scripts/expand_domain_pack.ts`, docs.

### 3.2 Global `--json`
- Standardise machine output beyond `plan`: `status`, `validate`, `doctor`.
- **Files:** affected scripts; document the schema once.

**Exit gate P3:** one documented way to apply a pack; uniform `--json` across
read commands.

> ✅ **Phase 3 complete** — `csda expand` now prints a steer to `csda specops add`
> (behaviour unchanged; specops add/sync call the script directly so they're
> unaffected), and `--json` is available on `plan`, `status`, `validate`, and
> `doctor` with a stable `schema_version`.

---

## Phase 4 — Surfaces: editor & GUI (P1/P2)

> Where to put a visual layer — **after** the CLI ergonomics (Phase 0–1) land.
> Guiding rule from the existing pack-authoring evaluation
> ([`visual-pack-authoring-todo.md`](./visual-pack-authoring-todo.md)) still
> holds: **CLI is the source of truth; any visual surface is a thin layer over
> it, never a reimplementation.** Audience is a Java / IntelliJ shop, so editor
> integration beats a standalone app.

### Platform verdicts

| Option            | Verdict                          | Why                                                                                                                              |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| IntelliJ plugin   | **Viable, high value — via LSP** | Devs live in IntelliJ. Don't reimplement in Kotlin (cost + drift vs VS Code ext). Build an LSP once → feeds both IDEs cheaply.   |
| Desktop app       | **No**                           | Separate product: auth, auto-update, sync, permanent maintenance tax. Dev already has an IDE open; won't open an app to tick a REQ. |
| Web app           | **Local-first read/visualize only** | Editing traceability needs File System Access API (Chromium-only) or a local server. Fragile as primary editor. `CsdaStudioApp` already covers pack-viewing. |

### 4.1 Language Server (LSP) for spec artefacts
- **Do:** one LSP over `traceability.md` + `pack.yaml` — diagnostics (dangling
  IDs, status/test mismatches), reference autocomplete, peek / go-to-definition,
  CodeLens reference counts. Reuses the CLI's parser/validator logic.
- **Payoff:** single investment that powers every editor (VS Code, IntelliJ, vim,
  Neovim) instead of N reimplementations.
- **Files:** new `packages/lsp-spec-driven`; share core with
  `scripts/validate_specs.ts` + `req.ts`.

### 4.2 IntelliJ plugin (thin LSP client)
- **Do:** thin JetBrains plugin that speaks to 4.1 — no business logic of its own.
  High value for the Java shop, low cost once the LSP exists.
- **Depends on:** 4.1.
- **Files:** new `packages/intellij-spec-driven` (Kotlin, LSP4IJ-based).

### 4.3 `csda studio` — local-first read/visualize (optional)
- **Do:** `csda studio` serves a local SPA (reuse `CsdaStudioApp`) to view the
  REQ→UC→AGG→EVT graph + project status. Read/visualize, not the primary editor.
- **Do not:** build it as the editing surface or a hosted product.
- **Files:** wire `bin/` to serve the existing `csda-studio-app` build.

**Exit gate P4:** IntelliJ + VS Code share one LSP; no logic is reimplemented per
surface; no standalone desktop/web product owns the source of truth.

> 🚧 **Phase 4 — mostly shipped (4.1 ✅, 4.3 ✅, 4.2 scaffolded).**
> - **4.1** [`packages/lsp-spec-driven`](../packages/lsp-spec-driven) — pure
>   diagnostics core (same rules as `validate --strict-tdd`) + a dependency-free
>   stdio LSP server. Unit-tested (`test:lsp-unit`).
> - **4.3** `csda studio` — local read-only server (status + Mermaid REQ graph,
>   `/status.json`, `--json`), thin over the CLI. Unit-tested.
> - **4.2** [`packages/intellij-spec-driven`](../packages/intellij-spec-driven) —
>   thin LSP4IJ client + `plugin.xml` + Gradle build. **Scaffold only**: needs a
>   JDK/Gradle pipeline (separate from this repo's Node CI), so it is not compiled
>   here. The Kotlin glue carries no spec logic — it just launches 4.1.
>
> Legend: ✅ done · 🚧 partial/scaffold · ⬜ not started.

---

## Suggested order

> Phase 0 first — it removes the actual "cumbersome" complaint.
> Steps 1–6 (✅) are shipped; remaining work starts at step 7 (Phase 2).

1. ✅ **0.1 `csda req`** — kills hand-editing the matrix. Highest impact on complaints.
2. ✅ **0.2 actionable errors** — turns scoldings into next steps.
3. ✅ **0.3 `csda fix`** — autofix the mechanical failures.
4. ✅ **1.2 `csda status`** — daily entry command (pairs with 0.4 QUICKSTART).
5. ✅ **1.1 interactive `init`** — biggest day-1 win for scaffolders.
6. ✅ **0.4 / 0.5 / 1.3** — onboarding + minimal scaffold + next-step hints.
7. ✅ Phase 2 (discoverability) — `csda` in docs, `config init`, `doctor`, completion.
8. ✅ Phase 3 (coherence) — `expand`→`specops add` steer, `--json` on plan/status/validate/doctor.
9. 🚧 **Phase 4** — LSP (✅) + `csda studio` (✅) shipped; IntelliJ plugin scaffolded (needs JDK/Gradle build).

## Tracking

| ID  | Item                            | Phase | Priority | Status |
| --- | ------------------------------- | :---: | :------: | :----: |
| 0.1 | `csda req` (add/link/done/list) |   0   |    P0    |   ✅    |
| 0.2 | Actionable error messages       |   0   |    P0    |   ✅    |
| 0.3 | `csda fix` / `validate --fix`   |   0   |    P0    |   ✅    |
| 0.4 | One-page QUICKSTART             |   0   |    P0    |   ✅    |
| 0.5 | `csda init --minimal`           |   0   |    P0    |   ✅    |
| 1.1 | Interactive `init`              |   1   |    P0    |   ✅    |
| 1.2 | `csda status`                   |   1   |    P0    |   ✅    |
| 1.3 | Next-step hints                 |   1   |    P0    |   ✅    |
| 2.1 | Promote `csda` in docs          |   2   |    P1    |   ✅    |
| 2.2 | `csda config init`              |   2   |    P1    |   ✅    |
| 2.3 | `csda doctor`                   |   2   |    P1    |   ✅    |
| 2.4 | Shell completion                |   2   |    P1    |   ✅    |
| 3.1 | Unify `expand`/`add`            |   3   |    P2    |   ✅    |
| 3.2 | Global `--json`                 |   3   |    P2    |   ✅    |
| 4.1 | Language Server (LSP)           |   4   |    P1    |   ✅    |
| 4.2 | IntelliJ plugin (LSP client)    |   4   |    P1    |   🚧    |
| 4.3 | `csda studio` (local viz)       |   4   |    P2    |   ✅    |
