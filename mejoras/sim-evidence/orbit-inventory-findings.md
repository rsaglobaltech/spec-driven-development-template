# Findings — Specgate evaluation (v0.8.1) on Express 4.19.2

Repo under test: `./work/` = **expressjs/express @ 04bc6278 (v4.19.2)**. No `node_modules`
installed at start. Docs read: https://rsaglobaltech.github.io/specgate/

Tool version reported: `🧭 specgate  v0.8.1`.

---

## Stage 1 — What the tool thinks the codebase is (~3 min)

```
$ npx --yes @rsaglobaltech/specgate@latest onboard
  🧭 onboarding  .../work

  1. What this is
     stack:  Node.js
     tests:  npm test
     detected from package.json

  2. Specs
     · not adopted yet — `specgate adopt` writes the skeleton without touching code

  3. Capabilities this codebase already implies
     · Router               lib/router  (3 files)
     · Middleware           lib/middleware  (2 files)

     A proposal, not a verdict. Merge, split or rename them.
```

Correct on stack/test command. The capability detection is **directory-name pattern
matching, nothing more**: it found the two subdirectories of `lib/` and stopped. Express's
actual surface — `lib/application.js`, `lib/request.js`, `lib/response.js`, `lib/view.js`,
the body parsers re-exported from `lib/express.js` — is invisible to it because those are
files, not folders. 2 capabilities out of a framework with ~30 test files of public API.
It is honest that this is "a proposal, not a verdict", but as a starting inventory it is
close to worthless on a flat-ish `lib/`.

## Stage 2 — Adopt (~2 min)

```
$ npx --yes @rsaglobaltech/specgate@latest adopt
ℹ️ [INFO] 🔍 Stack detection: package.json
ℹ️ [INFO] - Project: express
ℹ️ [INFO] - Stack: Node.js
ℹ️ [INFO] - Test command: npm test
ℹ️ [INFO] write spec.md
ℹ️ [INFO] write AI_RULES.md
ℹ️ [INFO] write features/adoption/baseline.feature
ℹ️ [INFO] write docs/specs/traceability.md
ℹ️ [INFO] write docs/specs/adr/README.md
ℹ️ [INFO] - Requirements seeded: 2 proposal(s) from the layout — router, middleware
ℹ️ [INFO] ✅ Adoption completed. Next steps: ...
```

`git status --short` after: only `?? AI_RULES.md ?? docs/ ?? features/ ?? spec.md`.
**Claim held: it did not touch source code.** This part works exactly as advertised.

`validate .` right after adoption:

```
ℹ️ [INFO] ✅ Validation passed
⚠️ [WARN] Adoption never retro-filled — the only scenario is the adoption baseline.
💡 [FIX] This passes, but it certifies the skeleton, not the code.
```

Credit where due: it tells you the green check is meaningless. That warning is the most
useful line the tool printed all day.

## Stage 3 — Writing real requirements (the wheels come off)

Added four requirements describing behaviour Express already has:

```
$ specgate req add "res.redirect sets Location and status 302 by default"
✔  Added REQ-003 (SCN-002, status Draft)
$ specgate req add "express.json parses application/json bodies into req.body"
✔  Added REQ-004 (SCN-003, status Draft)
$ specgate req add "res.sendStatus sends the status code as the body text"
✔  Added REQ-005 (SCN-004, status Draft)
$ specgate req add "Router matches route params and exposes them on req.params"
✔  Added REQ-006 (SCN-005, status Draft)
```

### BUG 1 — `req add` allocates an ID that already exists

`adopt` had already seeded REQ-001, REQ-002, REQ-003. `req add` handed out **REQ-003 a
second time**. Resulting matrix:

```
| REQ-002 | - | - | UC-002 Router | ... | `lib/router` | TBD | Draft |
| REQ-003 | - | - | UC-003 Middleware | ... | `lib/middleware` | TBD | Draft |
| REQ-003 | SCN-002 | - | res.redirect sets Location and status 302 by default | ... | Draft |
| REQ-004 | SCN-003 | - | express.json parses ... | ... | Draft |
```

Two different requirements, same ID. The command that exists specifically so you don't
have to hand-edit the matrix corrupted the matrix on its fourth invocation.

### BUG 2 — `validate` passes on the corrupted matrix

```
$ specgate validate .
ℹ️ [INFO] ✅ Validation passed
```

A duplicate primary key in the traceability matrix is not caught. The documented purpose
of this tool is "every broken link in the matrix triggers a build failure"; a matrix with
two REQ-003 rows is not even a broken link, it is a broken table, and the gate is green.

### BUG 3 — `req add` writes a matrix row but no `spec.md` section

```
$ grep -n "^## REQ" spec.md
20:## REQ-001 — Existing behaviour is preserved
26:## REQ-002 — Router
33:## REQ-003 — Middleware
```

REQ-003(new)…REQ-006 exist only as matrix rows. The `spec.md` preamble does warn about
this ("it does not write a section here"), so it is documented — but `validate` also does
not flag matrix rows that have no requirement text anywhere. So the tool's own headline
invariant (spec ↔ matrix ↔ test) is unenforced in the spec→matrix direction.

### Contradiction 1 — `plan` groups a requirement under a heading it does not belong to

```
  Needs Feature + Test + Code
    REQ-001   SCN-001
      ✓ feature: `features/adoption/baseline.feature`
      · test:    `npm test`
      · code:    existing codebase
```

The heading says it needs a feature; the line under it says the feature is present (✓).
`test:` and `code:` are marked missing (·) even though the matrix cells are populated with
`npm test` and `existing codebase` — the values adopt itself wrote. So `adopt` produces a
row that `plan` considers incomplete, out of the box.

---

## Stage 3b — Four real requirements, linked (~15 min)

Had to hand-repair the duplicate ID first (renumbered the four added rows to REQ-004…007
with a script — the CLI offers no `req renumber`/`req rm`; **guess #1: there is no
supported way to undo a `req add`**).

Wrote four requirements about behaviour Express already has, verified each against the
real test file before writing it:

| REQ | Behaviour | Code | Test |
|---|---|---|---|
| 004 | `res.redirect(url)` defaults to 302 + Location | `lib/response.js` | `test/res.redirect.js` |
| 005 | `express.json()` populates `req.body` | `lib/express.js` | `test/express.json.js` |
| 006 | `res.sendStatus(201)` sends body `Created` | `lib/response.js` | `test/res.sendStatus.js` |
| 007 | `/user/:id` → `req.params.id` | `lib/router/index.js` | `test/app.param.js` |

**REQ-005 is the "cannot be linked" case the brief asks about.** `lib/express.js` line 78 is
`exports.json = bodyParser.json`. The code that implements the behaviour lives in the
`body-parser` package, not in this repository. The matrix has no way to say "implemented
by a dependency" — I pointed it at the re-export line, which is a link that *resolves* and
*lies*. The tool cannot tell the difference (see below).

`specgate req link` worked cleanly for all four. One cosmetic inconsistency: `adopt`
fills the *Use Case* column with `UC-002 Router`, while `req link` fills it with the raw
requirement title. Same column, two formats, same tool.

## Stage 4 — The gate (~10 min). This is where I stopped believing it.

Everything green, including every strict flag the docs list:

```
$ specgate validate . --strict-tdd --strict-scenarios --strict-requirements --strict-links
ℹ️ [INFO] ✅ Validation passed
ℹ️ [INFO] - Features detected: 5
ℹ️ [INFO] - Strict TDD gate: passed
exit=0
```

### BUG 4 — `--strict-tdd` does not do what the docs say it does

The docs (validating.html) say `--strict-tdd` fails on *"REQ exists without scenario,
test, or traceability row (unless marked `Deferred`)"*. REQ-002 and REQ-003 — seeded by
`adopt` itself — have **no scenario, no feature file, and test artifact `TBD`**. Status is
`Draft`, not `Deferred`. The strict TDD gate reports "passed". Meanwhile `status` in the
same repo says `2 feature missing · 1 no test/code`. The tool knows the requirements are
incomplete and the gate that exists to fail on incomplete requirements passes anyway.

### BUG 5 — the traceability check is `fs.existsSync`, nothing more

I re-pointed REQ-004 ("redirect defaults to 302") at a completely unrelated test and file:

```
$ specgate req link REQ-004 --test test/res.vary.js --code lib/utils.js
$ specgate validate . --strict-tdd --strict-scenarios --strict-requirements --strict-links
ℹ️ [INFO] ✅ Validation passed
```

A requirement about redirects, "proven" by the Vary-header test. Fully green under every
gate. So the matrix verifies that *a path exists*, not that the test has anything to do
with the requirement, and certainly not that it passes. `--strict-links` does catch a path
that does not exist at all (below), which is genuinely useful — but that is the whole of it.

```
$ specgate req link REQ-004 --test test/does_not_exist.js --code lib/nope.js
$ specgate validate . --strict-links ...
❌ [ERROR] Declared artifacts that no longer exist: 2
  ✖  docs/specs/traceability.md REQ-004's technical artifact `lib/nope.js` does not exist. [declared_artifact_missing]
  ✖  docs/specs/traceability.md REQ-004's test artifact `test/does_not_exist.js` does not exist. [declared_artifact_missing]
exit=1
```

### Contradiction 2 — the CI gate the tool generates does not run the check that matters

`specgate ci init --provider github` writes `.github/workflows/spec-gate.yml`, whose own
header comment reads:

```
# Spec-Driven Development gate: no PR merges if a requirement loses its
# feature file, its test artifact, or its traceability row.
```

and whose only gating step is:

```
      - name: Validate specs (strict TDD)
        run: npx @rsaglobaltech/specgate@0.8.1 validate . --strict-tdd
```

`--strict-links` is not there. So I deleted a test artifact from the matrix's point of
view and ran exactly what CI runs:

```
$ specgate req link REQ-004 --test test/deleted_by_someone.js
$ specgate validate . --strict-tdd
ℹ️ [INFO] ✅ Validation passed
ℹ️ [INFO] - Strict TDD gate: passed
exit=0
```

**The generated CI gate passes on the exact failure its own comment promises to block.**
That is the tool contradicting itself in a file it wrote, and it is the single most
damaging finding here: a team that runs `ci init` and walks away has a green badge that
guarantees nothing. The fix is one flag (`--strict-links`, and arguably `--strict-scenarios
--strict-requirements`), but nothing in the docs or the CLI tells you the default is hollow —
the docs' own CI snippet on validating.html is weaker still: plain `validate .`, no flags at all.

Also worth noting: the generated workflow never runs `npm test`. Nothing in the "spec gate"
executes a single line of the project's code. **Guess #2: how the spec gate is supposed to
relate to the existing test job (`ci.yml`) is undocumented — I assumed they stay separate.**

Good part: `ci init` pins the version (`@0.8.1`), not `@latest`. That is the right call and
contradicts the docs, which tell you to run `@latest` in CI.

## Stage 5 — Harness (~5 min, dry run only)

```
$ specgate harness prompt REQ-002
REQ-002 (NEEDS_FEATURE) → branch harness/REQ-002
...
- Test artifact (write this first — TDD): TBD
- Production artifact: `lib/router`
## Gherkin scenario
The feature file `-` does not exist yet. Create it from the requirement before writing code.
```

The prompt is well-built (branch per REQ, AI_RULES.md inlined, definition of done). But
notice what it is handing an agent: the requirement is REQ-002, whose entire body in
`spec.md` is *"**Proposed, not specified.** Read off `lib/router` (3 source files), which
says this codebase has a Router area — not what it must do."* — and the test path it tells
the agent to write first is the literal string `TBD`. `adopt` seeds these placeholder
requirements, `plan` queues them, and `harness` will hand them to an agent as work. I did
not run `harness run` (it wants an agent + worktrees and there were no `node_modules`);
I am not willing to point an autonomous agent at a requirement that says "not specified".

## Time

- onboard + adopt + first validate: ~5 min
- writing/linking 4 real requirements (incl. repairing the duplicate ID): ~15 min
- probing the gate: ~10 min
- CI + harness: ~8 min

Roughly 40 minutes to get from nothing to a green gate — which is fast, and the speed is
real. The problem is what green means.

---

## Verdict — do not adopt in this state

The pitch is "a specification nobody checks is a wish". After 40 minutes I had a matrix of
seven requirements, a CI workflow, and four `✅ Validation passed` lines, while:

- one requirement was linked to a test that tests something else (green),
- one was linked to a re-export of a dependency that contains none of the behaviour (green),
- two were placeholders with no scenario and a test artifact of `TBD` (green under
  `--strict-tdd`, which the docs say fails exactly this),
- the generated CI job passed after a linked test artifact went missing, which is the one
  thing its own header comment promises to block,
- and at no point did anything run `npm test`.

Every one of those is a wish. The tool has replaced "a specification nobody checks" with
"a specification a filesystem `stat` checks", and the gap between those two is where all
the value was supposed to be.

What is genuinely good, and worth saying: `adopt` is non-invasive exactly as promised
(`git status` shows four untracked paths and zero source changes); the post-adoption
warning "This passes, but it certifies the skeleton, not the code" is unusually honest;
`--strict-links` catches rotted paths with a clear message and a real exit 1; `ci init`
pins the CLI version; and the harness prompt construction is thoughtful. The scaffolding
layer is competent.

**What would change my mind:** (1) `req add` must not reissue an existing ID, and
`validate` must fail on duplicate REQ rows — it already detects duplicate *Scenario* IDs,
so the check exists and simply is not applied to the primary key; (2) `--strict-tdd` must
actually fail on `TBD`/`-` artifacts, or the docs must stop saying it does; (3) `ci init`
must emit the strict flags, and the gate must run the project's test command and require it
to pass, or the phrase "specs CI enforces" is not accurate.

Until at least (1) and (3) land, adopting this buys a folder of markdown, a badge, and a
false sense of coverage. I would revisit at a later version; I would not put it in front of
the team now.
