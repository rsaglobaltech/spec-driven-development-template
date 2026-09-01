# Findings — Specgate evaluation on `./work` (Flask 3.0.3, commit c12a5d87)

Environment: macOS, node v24.14.0, npm 11.9.0, python 3.12.7.
Tool: `npx @rsaglobaltech/specgate@latest` → **v0.8.1**.
Docs: https://rsaglobaltech.github.io/specgate/ (fetched).
The repo in `./work` is the **Flask** source tree (Python, pyproject.toml, tox.ini, pytest suite).

---

## Stage 1 — What does the tool think this codebase is? (~5 min)

```
$ npx -y @rsaglobaltech/specgate@latest --help
  🧭 specgate  v0.8.1
  ... START HERE: init / adopt / onboard ...
```

```
$ npx -y @rsaglobaltech/specgate@latest onboard
  🧭 onboarding  .../work

  1. What this is
     stack:  unknown — edit AI_RULES.md with your stack
     tests:  echo 'configure your test command'
     detected from none

  2. Specs
     · not adopted yet — `specgate adopt` writes the skeleton without touching code

  3. Capabilities this codebase already implies
     · Json                 src/flask/json  (3 files)
     · Sansio               src/flask/sansio  (3 files)

     A proposal, not a verdict. Merge, split or rename them.

  Next
     specgate adopt
```

**Problem 1 — detection is blind to Python.** This repo has `pyproject.toml`,
`tox.ini`, `.pre-commit-config.yaml`, `requirements/*.txt`, and a 20-file
`tests/test_*.py` pytest suite. The tool reports `stack: unknown`,
`detected from none`, and a placeholder test command
(`echo 'configure your test command'`). Detection appears to be
JS/TS-only in practice, which the marketing page does not say.

**Problem 2 — capability proposal is directory-shaped, not behaviour-shaped.**
`src/flask` contains `app.py`, `blueprints.py`, `cli.py`, `config.py`, `ctx.py`,
`helpers.py`, `sessions.py`, `templating.py`, `views.py`, `wrappers.py` …
The tool proposed exactly the two entries that happen to be *subdirectories*
(`json/`, `sansio/`) and ignored every top-level module. So on the single
question the brief asked first — "what does the tool think this codebase is?" —
the answer is: it does not know, and its guess is an artefact of the folder
layout rather than of the code.

---

## Stage 2 — Adoption (~5 min). This part works.

`specgate adopt --help` reveals what the website does not:

```
- detects the stack from pom.xml / build.gradle / package.json / go.mod
```

No Python. Confirms Problem 1. I had to guess the override syntax from the
same help text (the web quickstart never mentions `--var`; it opens with
`npm install`, which is nonsense in this repo):

```
$ npx -y @rsaglobaltech/specgate@latest adopt --var STACK=Python \
      --var TEST_CMD="python -m pytest" --var TESTING=pytest
ℹ️ [INFO] 🔍 Stack detection: no build manifest found
ℹ️ [INFO] - Stack: Python
⚠️ [WARN] Could not detect the stack — review AI_RULES.md and traceability.md after adoption.
ℹ️ [INFO] write spec.md / AI_RULES.md / features/adoption/baseline.feature
ℹ️ [INFO]   docs/specs/traceability.md / docs/specs/adr/README.md
ℹ️ [INFO] - Files written: 5   - Requirements seeded: 2 proposal(s) — json, sansio
```

`git status` confirms the claim: 5 new files, **zero** source files touched.
Credit where due — adoption is non-invasive, fast, and the generated
`traceability.md` / `baseline.feature` are readable. And `validate` is honest
about what it just certified:

```
$ specgate validate .
ℹ️ [INFO] ✅ Validation passed
⚠️ [WARN] Adoption never retro-filled — the only scenario is the adoption baseline.
💡 [FIX] This passes, but it certifies the skeleton, not the code.
```

That warning is the best thing in the tool. It is also, as it turns out, the
only thing standing between you and a green gate that means nothing.

---

## Stage 3 — Writing four real requirements (~10 min). This is where it fell over.

I added four requirements describing behaviour Flask demonstrably already has:

```
$ specgate req add "A registered route dispatches GET requests to its view function"
✔  Added REQ-003 (SCN-002, status Draft)
$ specgate req add "OPTIONS and HEAD are answered automatically for routes that only declare GET"
✔  Added REQ-004 (SCN-003, status Draft)
$ specgate req add "Loading config from an object imports only UPPERCASE attributes"
✔  Added REQ-005 (SCN-004, status Draft)
$ specgate req add "A blueprint registered with a url_prefix serves its routes under that prefix"
✔  Added REQ-006 (SCN-005, status Draft)
```

### Bug 1 — `req add` allocated an ID that already existed

`adopt` had already seeded REQ-001, REQ-002 and REQ-003. `req add` handed me
**REQ-003 again**. The matrix now literally contains two rows with the same
primary key:

```
| REQ-003 | - | - | UC-003 Sansio | - | - | - | `src/flask/sansio` | TBD | Draft |
| REQ-003 | SCN-002 | - | A registered route dispatches GET requests to its view function | - | - | - | - | - | Draft |
```

The quickstart page says `req add` "automatically assigns the next `REQ-NNN`
identifier". It does not — it cannot see the rows `adopt`, its own sibling
command, wrote 90 seconds earlier. The two commands disagree about what
requirements exist.

`specgate req` then lists the collision without a murmur:

```
  📝 Requirements (7)
    REQ-003   -  Draft
      code:    `src/flask/sansio`
    REQ-003   SCN-002  Draft
```

Seven requirements, six distinct IDs, no error.

### Bug 2 — `req add` writes the matrix row but not the spec

`spec.md` after four `req add` calls still ends at REQ-003:

```
$ grep -n "^## REQ" spec.md
20:## REQ-001 — Existing behaviour is preserved
26:## REQ-002 — Json
33:## REQ-003 — Sansio
```

REQ-004, REQ-005 and REQ-006 exist in the traceability matrix and in
`req list`, and have no text anywhere describing what they require. The title
I passed was filed into the **Use Case** column of the matrix, not into the
spec. So the requirement is a row, not a requirement.

### Bug 3 — and this is the one that matters — the gate passes anyway

```
$ specgate validate . --strict-tdd
ℹ️ [INFO] ✅ Validation passed
ℹ️ [INFO] - Base SDD structure: complete
ℹ️ [INFO] - Traceability mode: rich
ℹ️ [INFO] - Strict TDD gate: passed
rc=0
```

Duplicate requirement ID: passed. Three requirements with no specification
text: passed. Three requirements with no feature file, no scenario, no code
and no test (`- | - | - | -` across the row): **passed, under `--strict-tdd`**.

The product's headline claim is *"Breaking any link causes `specgate validate`
to fail."* I broke several links — using nothing but the tool's own
commands, in the order its own output told me to run them — and the gate was
green every time.

---

## Stage 3b — Linking to real code and tests (~10 min)

I wrote real Gherkin (`features/http/routing.feature`, `features/config/config.feature`)
and linked each requirement to the Flask module and pytest file that prove it:

```
✔  REQ-007 updated: featureFile=features/http/routing.feature, technicalArtifact=src/flask/app.py, testArtifact=tests/test_basic.py
✔  REQ-004 updated: ... src/flask/sansio/app.py ... tests/test_basic.py
✔  REQ-005 updated: ... src/flask/config.py ... tests/test_config.py
✔  REQ-006 updated: ... src/flask/blueprints.py ... tests/test_blueprints.py
$ specgate validate . --strict-tdd
ℹ️ [INFO] ✅ Validation passed   - Features detected: 3
```

All four requirements describe behaviour Flask already has and all four linked
cleanly. **Nothing failed to link** — which turned out to be the problem, not
the reassurance: see Probe A.

### Probe A — does the gate check that the paths exist?

I pointed a requirement at files that do not exist:

```
$ specgate req link REQ-005 --code src/flask/does_not_exist.py --test tests/test_nope.py \
                            --feature features/ghost/none.feature
✔  REQ-005 updated: technicalArtifact=src/flask/does_not_exist.py, testArtifact=tests/test_nope.py, featureFile=features/ghost/none.feature
```

`req link` accepted all three without a word. `validate --strict-tdd` then
complained about exactly one thing — the now-**orphaned real** feature file:

```
❌ [ERROR] Feature file missing from traceability.md: features/config/config.feature
💡 [FIX] Add a row for it to docs/specs/traceability.md, e.g.: ...
```

It never mentioned `src/flask/does_not_exist.py`, `tests/test_nope.py`, or the
ghost feature file. **The gate checks feature-file → matrix. It does not check
matrix → filesystem.** A requirement may name a test that has never existed and
the build stays green. Since "requirement is linked to a test" is the entire
value proposition, this is the load-bearing check and it is absent.

### Probe B — does `done --check` run the test?

```
$ specgate done REQ-002 --check
✔  REQ-002 → Implemented (1 row updated)
```

No test runner output, instantaneous. `--check` runs `validate`, not the suite.
The site claims the gate catches "Scenarios must actually execute (not just
parse)". Nothing executed anything here.

---

## Stage 4 — THE ONE I CANNOT EXPLAIN: the matrix became a different project (~5 min)

After the four successful `req link` calls and a green `validate`, I dumped
`docs/specs/traceability.md` in the next shell command. This is what was in it,
verbatim, in a Flask repository:

```
| REQ-001 | SCN-001 | `features/adoption/baseline.feature` | UC-001 Preserve existing behaviour | - | - | - | existing codebase | `npm test` | Draft |
| REQ-002 | - | - | UC-002 Router | - | - | - | `lib/router` | TBD | Draft |
| REQ-003 | - | - | UC-003 Middleware | - | - | - | `lib/middleware` | TBD | Draft |
| REQ-004 | SCN-002 | features/response/redirect.feature | res.redirect sets Location and status 302 by default | - | - | - | lib/response.js | test/res.redirect.js | Draft |
| REQ-005 | SCN-003 | features/body/json.feature | express.json parses application/json bodies into req.body | - | - | - | lib/express.js | test/express.json.js | Draft |
| REQ-006 | SCN-004 | features/response/send-status.feature | res.sendStatus sends the status code as the body text | - | - | - | lib/response.js | test/res.sendStatus.js | Draft |
| REQ-007 | SCN-005 | features/router/params.feature | Router matches route params and exposes them on req.params | - | - | - | lib/router/index.js | test/app.param.js | Draft |
```

This is **Express.js**. `lib/router`, `lib/middleware`, `res.redirect`,
`express.json`, `test/app.param.js`, `npm test`. None of these paths exist in
this repository. None of this text was ever typed by me. My four Flask
requirements — the ones the tool had just echoed back to me by name — were gone.

Corroborating detail: `REQ-001`'s test artifact reads `` `npm test` ``, but
`adopt` wrote `` `python -m pytest` `` into that cell and I watched it do so.

What was *not* affected: `spec.md` and `AI_RULES.md` still said Stack: Python
and still had mtime 22:41:54 (adoption time). `features/` still held my three
real files. Only `docs/specs/traceability.md` was rewritten, mtime 22:44:48.
`git status` showed no other change.

**I could not reproduce it.** I rebuilt from scratch in a clean scratch repo
(adopt → req add → req link → validate → done, md5 after each step): no
corruption. I then wiped the spec layer in the Flask repo and re-ran the exact
original sequence, hashing the matrix after every command and again after a
3-second wait:

```
  [adopt]     md5=1a3ec72a840279e4b1739cf4c56fddb8 rows=3 express=0
  [req-add]   md5=d9596509b705a896f0fa0df20ff6a61a rows=4 express=0
  [req-link]  md5=2a3f4e58bda92442f023db4f7eadc991 rows=4 express=0
  validate rc=0
  [validate]  md5=2a3f4e58bda92442f023db4f7eadc991 rows=4 express=0
  [after-3s]  md5=2a3f4e58bda92442f023db4f7eadc991 rows=4 express=0
```

Clean. So I am reporting an **unexplained, non-deterministic total replacement
of the traceability matrix with another project's content**, with no error, no
warning, and no backup. I am not going to guess at the mechanism. I will only
note that the file it destroys is the one file the tool tells you is the source
of truth, that it is destroyed silently, and that `validate` was perfectly happy
with the replacement.

### The reproduction run did surface a clean, deterministic bug

```
| REQ-002 | - | - | UC-002 Json | - | - | - | `src/flask/json` | TBD | Draft |
| REQ-003 | - | features/http/routing.feature | UC-003 Sansio | - | - | - | src/flask/app.py | tests/test_basic.py | Draft |
| REQ-003 | SCN-002 | features/http/routing.feature | A registered route dispatches GET to its view | - | - | - | src/flask/app.py | tests/test_basic.py | Draft |
```

`specgate req link REQ-003 …` updated **both** rows that share the ID. Linking
one requirement silently rewrote a different requirement's code and test
artifacts. `validate --strict-tdd` → rc=0.

And the damage propagates into `plan`, which is what feeds the harness and the
CI artifact — the same requirement listed three times:

```
  Needs Status Update (code & test exist)
    REQ-003   SCN-002 ...
    REQ-003   SCN-002 ...
    REQ-003   -       ...
```

---

## Stage 5 — CI (~5 min). Genuinely good.

```
$ specgate ci init
❌ [ERROR] --provider is required.
💡 [FIX] Pick one: ci init --provider github | gitlab | azure | jenkins

$ specgate ci init --provider circleci     # the website lists CircleCI
rc=2
❌ [ERROR] Unknown provider: circleci
💡 [FIX] Supported providers: github, gitlab, azure, jenkins

$ specgate ci init --provider github
ℹ️ [INFO] write .github/workflows/spec-gate.yml
```

The generated workflow is the best artefact the tool produced: it **pins the
version** (`npx @rsaglobaltech/specgate@0.8.1`, not `@latest`), separates the
strict-TDD gate from the lock check, guards the lock step with a file test, and
uploads `plan --format json` with `if: always()`. Exit codes are correct
(rc=2 on bad input, rc=1 on validation failure, rc=0 on pass) — it will work in
CI. I would ship this workflow.

Its own header comment, however, is false:

```
# Spec-Driven Development gate: no PR merges if a requirement loses its
# feature file, its test artifact, or its traceability row.
```

Per Bug 3 and Probe A, a requirement can have no feature file, no test artifact
and a test path that does not exist, and this gate passes.

---

## Stage 6 — Agent harness (~3 min)

```
$ specgate harness --help
rc=2
✖  Unknown harness sub-command: --help. Expected: run, prompt, init, report
```

`harness prompt REQ-004` (dry run) does work, and the scaffolding around it is
sensible — worktree per requirement, branch `harness/REQ-004`, AI_RULES.md
injected as non-negotiable boundaries, "never merges". But look at the prompt it
hands the agent:

```
REQ-004 (NEEDS_FEATURE) → branch harness/REQ-004
# Implement REQ-004
- Requirement: REQ-004
- Scenario ID: SCN-003
- Feature file: -
- Test artifact (write this first — TDD): -
- Production artifact: -
- Current status: Draft

## Gherkin scenario
The feature file `-` does not exist yet. Create it from the requirement before writing code.
```

**Nowhere in the prompt is there any statement of what REQ-004 requires.** The
title I typed — "Static files are served from the static folder" — went into the
matrix's *Use Case* column and is not in the prompt. The prompt tells the agent
to "create it from the requirement" while including no requirement. This is the
direct downstream consequence of Bug 2: `req add` files a row, not a
requirement, so the harness has nothing to hand over. The end-to-end loop the
product is built around does not close on a brownfield adopt.

(Also: `AI_RULES.md` in that prompt says `Testing: unknown — edit AI_RULES.md
with your test toolchain` while stating `Test command: python -m pytest` two
lines later.)

---

## Where the tool disagreed with itself

1. **`--help` is a lie, three times.** Top-level help says *"Run '<command>
   --help' for per-command details"* and `specgate req --help` says *"Run
   specgate req <subcommand> --help for a subcommand's own flags."* But
   `req add --help` → `✖ A title is required`; `req link --help` → `✖ Expected a
   REQ-id`; `harness --help` → `✖ Unknown harness sub-command: --help`.
   The tool cannot document its own flags.
2. **Website vs CLI on stack detection.** The site sells brownfield adoption
   generally; `adopt --help` reveals detection is `pom.xml / build.gradle /
   package.json / go.mod` only. Python is invisible. The quickstart page opens
   with `npm install`, and never mentions the `--var` overrides I needed.
3. **Website vs CLI on CI providers.** Site: "GitHub Actions, GitLab, Azure
   Pipelines, CircleCI, or Jenkins". CLI: `Unknown provider: circleci`.
4. **`adopt` vs `req add` on which requirements exist.** `adopt` seeds
   REQ-001..003; `req add` then issues REQ-003 again.
5. **Generated CI comment vs actual gate.** The workflow claims no merge if a
   requirement loses its feature file or test artifact. It merges.
6. **Site vs gate.** "Breaking any link causes `specgate validate` to fail" —
   broken links, duplicate IDs, phantom paths and spec-less requirements all
   pass.
7. **Site vs gate, again.** "Scenarios must actually execute (not just parse)" —
   nothing in `validate` or `done --check` executed a test.
8. **`AI_RULES.md` internally.** `Testing: unknown` above `Test command:
   python -m pytest`.

## Where I had to guess

- That `--var STACK=… --var TEST_CMD=…` was the way to adopt a Python repo.
  Only `adopt --help` hints at it; no doc page I fetched mentions it.
- What to put in the Use Case / Command / Aggregate / Event columns. The matrix
  has ten columns; `req link` exposes six flags; four columns can seemingly only
  be hand-edited, in the file the tool tells you not to hand-edit.
- How a scenario in a `.feature` file is bound to a `SCN-NNN` ID. I guessed
  "put SCN-002 in the scenario name". Nothing validated the guess either way —
  which is itself the finding.
- Whether the Flask capability proposals (`Json`, `Sansio`) were meant to be
  deleted or rewritten. `--no-capabilities` exists; the ID collision is a strong
  argument for always using it.

---

## Verdict: do not adopt. Not in this version.

**What is good, honestly.** Adoption is genuinely non-invasive — 5 files, zero
source changes, and `git status` proves it. `adopt`'s output and the
`spec.md`/`AI_RULES.md` it writes are unusually well-written prose. The
post-adoption warning (*"This passes, but it certifies the skeleton, not the
code"*) is the most intellectually honest thing I have seen a tool say about
itself. `ci init --provider github` produces a workflow I would ship as-is,
version-pinned, with correct exit codes. The harness design — worktree per
requirement, validate before commit, never merge — is the right shape.

**Why that is not enough.** The product is a gate. The only question that
matters is whether a green `validate` means anything. On this repository it does
not:

- a requirement with no feature file, no test and no code passes `--strict-tdd`;
- a requirement whose test path has never existed passes;
- two requirements sharing an ID pass, and linking one corrupts the other;
- three requirements with no specification text anywhere pass;
- nothing ever runs a test.

Everything I broke, I broke by running the tool's own commands in the order its
own output recommended. I did not have to fight it. A gate that is green in that
state is worse than no gate: it converts "we have not written our specs" into a
passing CI badge, and the badge is what people will look at.

**The moment I would have stopped, if I had not been asked to keep notes:** when
`docs/specs/traceability.md` in a Flask repository silently turned into an
Express.js traceability matrix — different requirements, different language,
different test runner — with no error, no warning, no backup, and a green
`validate` afterwards. I cannot reproduce it and therefore cannot tell you it
will not happen to you. The file it ate is, by the tool's own definition, the
source of truth. Nothing about a green gate is worth running a tool that can do
that to the artifact the gate reads.

**What would change my mind**, in rough priority: (1) an explanation and a
regression test for the matrix replacement; (2) `validate` failing on
duplicate REQ ids, on matrix rows whose `--code`/`--test`/`--feature` paths do
not exist on disk, and on matrix rows with no `## REQ-NNN` section in `spec.md`;
(3) `req add` writing the requirement text somewhere the harness prompt can read
it; (4) `req add` allocating IDs that account for `adopt`'s own seeds;
(5) working `--help` on subcommands.

Revisit at 1.0 if those land. Today it costs a day and buys a false green.
