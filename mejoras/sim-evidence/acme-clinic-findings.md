# Findings — Specgate evaluation on Spring PetClinic

Repo under test: `./work/` = spring-projects/spring-petclinic @ `818c413`, Java 17 / Spring Boot / Maven.
Tool: `npx @rsaglobaltech/specgate@latest` → resolved **v0.8.1**.
Docs: https://rsaglobaltech.github.io/specgate/

## What I ran

### 1. `--help` (~3s, cold npx)
Reads cleanly. Three "start here" verbs: `init`, `adopt`, `onboard`. Note `--help` shows only 8 of 24
commands by default ("16 more commands cover packs, automation, agents and reporting").

### 2. `specgate onboard` (~2s)
```
  1. What this is
     stack:  Java 17, Spring Boot, Maven
     tests:  ./mvnw -B test
     detected from pom.xml

  3. Capabilities this codebase already implies
     · Owner                src/main/java/org/springframework/samples/petclinic/owner  (12 files)
     · Vet                  src/main/java/org/springframework/samples/petclinic/vet  (6 files)
     · System               src/main/java/org/springframework/samples/petclinic/system  (5 files)
     · Model                src/main/java/org/springframework/samples/petclinic/model  (4 files)
```
**Correct.** Stack detection and the test command are right, and the four capabilities are exactly the
four packages a human would name. This is the strongest moment in the whole evaluation — zero config,
zero guessing, and it read the repo the way I would have.

### 3. `specgate adopt` (~2s) — clean
```
ℹ️ [INFO] write spec.md
ℹ️ [INFO] write AI_RULES.md
ℹ️ [INFO] write features/adoption/baseline.feature
ℹ️ [INFO] write docs/specs/traceability.md
ℹ️ [INFO] write docs/specs/adr/README.md
ℹ️ [INFO] - Requirements seeded: 4 proposal(s) from the layout — owner, vet, system, model
ℹ️ [INFO]   4. Add `validate --strict-tdd` to CI to lock the gate in
```
`git status --short` confirms **no source file was touched** — only `spec.md`, `AI_RULES.md`,
`docs/`, `features/`. The claim "touches no code" holds.

Seeded `spec.md` **REQ-001..REQ-005** and five matching matrix rows.

One fabricated context line in `spec.md`:
```
- API style: REST with DTO boundaries
```
PetClinic has `0` `@RestController` and `6` `@Controller` (Thymeleaf server-side MVC). Nothing in this
repo is REST-with-DTOs. (`Testing: JUnit 5, Testcontainers` *is* correct — 5 testcontainers hits in
pom.xml.) Cosmetic, but it is the tool asserting something about my codebase that is false.

### 4. `specgate validate .` → **exit 0**, with an honest warning
```
ℹ️ [INFO] ✅ Validation passed
⚠️ [WARN] Adoption never retro-filled — the only scenario is the adoption baseline.
💡 [FIX] This passes, but it certifies the skeleton, not the code.
```
Good behaviour: it passes but tells you the pass is worthless. `status` agreed: `5 total · 5 pending`.

---

## Where I got stuck — `req add` allocates IDs that already exist

Per the tool's own next-step instructions I added four real behaviours read off the code:

```
$ npx @rsaglobaltech/specgate@latest req add "Pet name is required and capped at 30 characters"
✔  Added REQ-003 (SCN-002, status Draft)
$ ... "Owner search matches last-name prefix and ignores surrounding whitespace"
✔  Added REQ-004 (SCN-003, status Draft)
$ ... "Vet list is served as both HTML and JSON"
✔  Added REQ-005 (SCN-004, status Draft)
$ ... "Unhandled controller errors render the error page"
✔  Added REQ-006 (SCN-005, status Draft)
```

`adopt` had already seeded REQ-001..**REQ-005**. `req add` restarted allocation at **REQ-003**.
The scenario IDs (SCN-002..005) are allocated correctly; only the REQ counter is wrong. Resulting
matrix — note REQ-003/004/005 each appear twice:

```
| REQ-001 | SCN-001 | `features/adoption/baseline.feature` | UC-001 Preserve existing behaviour | ... |
| REQ-002 | - | - | UC-002 Owner | ... | `.../petclinic/owner` | TBD | Draft |
| REQ-003 | - | - | UC-003 Vet | ... | `.../petclinic/vet` | TBD | Draft |
| REQ-004 | - | - | UC-004 System | ... | `.../petclinic/system` | TBD | Draft |
| REQ-005 | - | - | UC-005 Model | ... | `.../petclinic/model` | TBD | Draft |
| REQ-003 | SCN-002 | - | Pet name is required and capped at 30 characters | - | - | - | - | - | Draft |
| REQ-004 | SCN-003 | - | Owner search matches last-name prefix and ignores surrounding whitespace | ... |
| REQ-005 | SCN-004 | - | Vet list is served as both HTML and JSON | ... |
| REQ-006 | SCN-005 | - | Unhandled controller errors render the error page | ... |
```

Two secondary inconsistencies visible in those rows: `adopt` writes the Use Case column as
`UC-003 Vet`; `req add` writes the raw requirement title into the same column with no `UC-NNN`.
And `req add` never adds a `## REQ-NNN` section to `spec.md` — `grep "^## REQ" spec.md` still
returns only the five seeded ones, so four of my nine requirements exist in the matrix and nowhere else.
(The `spec.md` preamble does say `req add` "does not write a section here", so that part is
documented-by-disclaimer rather than a bug — but it means the workflow the tool prints as
"Next:" leaves the spec permanently out of sync with the matrix unless you hand-edit.)

### The tool's own list command renders the corruption without noticing
```
$ npx @rsaglobaltech/specgate@latest req
  📝 Requirements (9)
    REQ-003   -  Draft
      code:    `src/main/java/org/springframework/samples/petclinic/vet`
    REQ-003   SCN-002  Draft
```
Nine requirements, three IDs used twice, no warning.

`specgate plan` is worse — it fans out on the duplicated key and prints REQ-003, REQ-004 and REQ-005
**three times each**:
```
    REQ-003   SCN-002
    REQ-004   SCN-003
    REQ-005   SCN-004
    REQ-003   SCN-002      <- repeat
    REQ-004   SCN-003      <- repeat
    REQ-005   SCN-004      <- repeat
    REQ-006   SCN-005
    REQ-003   -
      ✓ code:    `src/main/java/org/springframework/samples/petclinic/vet`
```

### The gate passes anyway — including the one `adopt` told me to put in CI
```
$ npx @rsaglobaltech/specgate@latest validate .
ℹ️ [INFO] ✅ Validation passed
EXIT=0

$ npx @rsaglobaltech/specgate@latest validate . --strict-tdd
ℹ️ [INFO] ✅ Validation passed
ℹ️ [INFO] - Strict TDD gate: passed
EXIT=0
```
Duplicate primary keys in the traceability matrix are not a structural error to this validator.
`adopt`'s printed advice was `4. Add "validate --strict-tdd" to CI to lock the gate in` — that is
exactly the command that returns 0 here.

### Then `req link` corrupted the matrix silently
Following the `Next:` line the tool printed after `req add`:
```
$ npx @rsaglobaltech/specgate@latest req link REQ-003 \
    --code src/main/java/org/springframework/samples/petclinic/owner/PetValidator.java \
    --test src/test/java/org/springframework/samples/petclinic/owner/PetValidatorTests.java
✔  REQ-003 updated: technicalArtifact=...PetValidator.java, testArtifact=...PetValidatorTests.java

$ grep -n "REQ-003" docs/specs/traceability.md
12:| REQ-003 | - | - | UC-003 Vet | - | - | - | src/main/java/.../owner/PetValidator.java | src/test/java/.../owner/PetValidatorTests.java | Draft |
15:| REQ-003 | SCN-002 | - | Pet name is required and capped at 30 characters | - | - | - | src/main/java/.../owner/PetValidator.java | src/test/java/.../owner/PetValidatorTests.java | Draft |
```
**It wrote to both rows.** The seeded requirement `UC-003 Vet` now formally asserts that it is
implemented by `PetValidator.java` and proven by `PetValidatorTests.java`. Neither statement is true;
`PetValidator` has nothing to do with vets.

This is the failure I stopped at. The product's whole claim is "traceability CI can enforce". Following
only commands the tool printed for me, with no hand-editing, in under ten minutes of use, it produced a
traceability matrix containing a false code-to-requirement link — and its own gate returned exit 0 on it.
A matrix that silently lies is worse than no matrix, because CI now certifies the lie.

---

## Correction to my own method (recorded because it changes nothing, but it could have)

For the first several runs I read exit codes as `npx ... | tail -20; echo "EXIT=$?"`. That reports
`tail`'s status, not specgate's. Every `EXIT=` above that line is meaningless. I re-measured all the
load-bearing cases with `npx ... > /tmp/f 2>&1; echo $?`. Specgate's exit codes turn out to be
**correct** — 1 on error, 0 on pass. The re-measured result on the duplicated matrix:

```
$ grep -c "^| REQ-003" docs/specs/traceability.md
2
$ npx @rsaglobaltech/specgate@latest validate . --strict-tdd ; echo $?
✅ Validation passed
- Strict TDD gate: passed
0
```
The central finding survives: **exit 0 on a matrix with duplicate requirement IDs.**

## Is it recoverable? Yes — but only if you already know

I re-adopted into a clean copy, deleted the four seeded `## REQ-002..005` sections and their matrix
rows by hand, leaving only REQ-001, and then:
```
$ npx @rsaglobaltech/specgate@latest req add "Pet name is required and capped at 30 characters"
✔  Added REQ-002 (SCN-002, status Draft)
```
Correct allocation. So the workaround is: **prune `adopt`'s own seeded proposals before you ever run
`req add`.** Nothing in the CLI output, `spec.md`'s preamble, or getting-started.html says this.
I asked the docs directly; the answer was *"The page does not provide explicit guidance about whether
to delete or replace the proposed requirements that `adopt` seeds before running `specgate req add`"*
and *"contains no discussion of duplicate requirement IDs or how `req add` allocates the next ID."*
I had to guess, and the guess only worked because I had already seen the corruption.

## What the happy path looks like when you know the trick — and it is good

On the pruned copy I wrote four requirements describing behaviour PetClinic already has, wrote a
`.feature` for each, and linked each to its real implementation and its real test:

| REQ | Behaviour | Code | Test |
|---|---|---|---|
| REQ-002 | Pet name required, max 30 chars | `owner/PetValidator.java` | `owner/PetValidatorTests.java` |
| REQ-003 | Owner search trims surrounding whitespace | `owner/OwnerController.java` | `owner/OwnerControllerTests.java` |
| REQ-004 | Vet list served as HTML and JSON | `vet/VetController.java` | `vet/VetControllerTests.java` |
| REQ-005 | Unhandled errors render the error page | `system/CrashController.java` | `system/CrashControllerTests.java` |

All four are real: `PetValidator` rejects blank names, rejects `name.length() > 30`, and requires a
birth date; `OwnerControllerTests` has `processFindFormIgnoresSurroundingWhitespace`;
`VetControllerTests` has `showVetListHtml` and `showResourcesVetList`. Nothing had to be invented and
no source file was edited.
```
$ npx @rsaglobaltech/specgate@latest validate . --strict-tdd ; echo $?
✅ Validation passed
- Features detected: 5
- Strict TDD gate: passed
0
```
Under half an hour from `npx` to a green, meaningful gate. That part delivers.

## How much does the gate actually check?

I probed it deliberately.

**It catches an orphaned feature file.** Pointing REQ-004 away from `vet-list.feature` left that file
on disk with no matrix row:
```
❌ [ERROR] Feature file missing from traceability.md: features/vet/vet-list.feature
exit 1
```

**`--strict-tdd` does NOT catch a matrix row pointing at files that do not exist.** `--strict-links`
does, and does it well:
```
$ npx @rsaglobaltech/specgate@latest validate . --strict-links ; echo $?
❌ [ERROR] Declared artifacts that no longer exist: 2
  ✖  REQ-004's technical artifact `.../vet/TotallyMadeUp.java` does not exist. [declared_artifact_missing]
  ✖  REQ-004's test artifact `src/test/java/com/example/NoSuchTest.java` does not exist. [declared_artifact_missing]
1
```

**Nothing catches a link that is merely false.** I repointed the vet requirement's proof at a real but
unrelated test:
```
$ ... req link REQ-004 --test src/test/java/.../owner/PetTypeFormatterTests.java
$ npx @rsaglobaltech/specgate@latest validate . --strict-tdd ; echo $?
✅ Validation passed
0
```
A requirement about the vet directory, certified green by a test for a pet-type formatter. That is
inherent to path-string traceability, not a bug — but it bounds the claim. The gate enforces that a
link *exists* and *resolves*; it cannot enforce that it is *true*.

**No flag catches the duplicate IDs.** All four, individually and together, on the corrupted matrix:
```
validate . --strict-links        => exit 0  ✅ Validation passed
validate . --strict-requirements => exit 0  ✅ Validation passed
validate . --strict-scenarios    => exit 0  ✅ Validation passed
validate . --strict-tdd --strict-links --strict-requirements --strict-scenarios => exit 0
```

## Where two parts of the tool disagree

1. **`--strict-links` is the flag that matters, and nothing tells you to use it.** `adopt` prints
   `Add "validate --strict-tdd" to CI`. `ci init` generates `run: npx @rsaglobaltech/specgate@0.8.1
   validate . --strict-tdd`. automation.html shows `specgate validate . --strict-tdd`. Top-level
   `--help` doesn't list the strict flags at all — only `--help --all` mentions
   `--strict-links / --strict-requirements / --strict-scenarios / --against-lock`. Three separate
   places tell you what to put in CI and all three omit the one gate that catches rotted links.
2. **Test command: `./mvnw -B test` vs `mvn -B test`.** `onboard` and `adopt` both detect
   `./mvnw -B test`. `harness init` writes `test_cmd: "mvn -B test"` into `harness.config.yaml`. The
   repo ships a Maven wrapper precisely so you don't depend on a system `mvn`; the harness runs in a
   fresh worktree, and `ci init`'s workflow installs only Node. Same tool, same pom.xml, two answers.
3. **`req add` vs the docs.** getting-started.html: *"Each `REQ-NNN` you add to `spec.md` must appear
   in `traceability.md`."* But `req add` writes only the matrix row and never a `spec.md` section —
   after four `req add`s, `grep "^## REQ" spec.md` still returned only the seeded five. The generated
   `spec.md` preamble does disclose this ("it does not write a section here"), so the CLI contradicts
   the website rather than itself, and the documented invariant is one the primary command breaks.
4. **Column format.** `adopt` writes the Use Case column as `UC-003 Vet`; `req add` writes the bare
   requirement title with no `UC-NNN`. Same column, two conventions, same tool.
5. **Docker tag `0.8.0` in automation.html vs CLI `0.8.1`.** Trivial, but the docs pin an older image
   than `npx @latest` resolves to.

## Where I had to guess

- **How a scenario binds to `SCN-NNN`.** writing-specs.html shows a plain feature file with no tag or
  ID, and gives no annotation convention. `adopt`'s own `baseline.feature` contains no SCN marker
  either, yet the matrix calls it SCN-001. I concluded the binding is the file *path* in the matrix
  column and nothing inside the file, and validate's behaviour is consistent with that — but I
  inferred it, I was never told.
- **Whether to prune `adopt`'s seeded proposals.** See above.
- **Which of two identically-named rows `req link REQ-003` targets.** Answer, discovered empirically:
  both.

## Not evaluated

`harness run` against a live agent. `harness init` and `harness prompt REQ-002` both work and the
generated prompt is unusually well written — an explicit "do not edit `features/**`" boundary, and
"Editing a scenario so your code passes is the one failure mode that makes this whole exercise
worthless." `harness.config.yaml` ships commented-out agent lines with the reasoning "a default
committed here is a default somebody pays for by accident." I ran out of budget before spending an
agent run plus a full Maven suite in a fresh worktree. One oddity: `harness prompt` labelled REQ-002
`(NEEDS_STATUS_UPDATE)`, a status string that appears nowhere in `req`, `plan`, `status` or the docs.

## Verdict

**Adopt it — but pin the workflow, and do not use `req add` on a freshly adopted repo until 0.8.1 is
past this bug.**

I went in expecting to reject this. The reason I don't: `onboard` read a repo nobody documented and
named the right four capabilities with zero configuration; `adopt` genuinely touched no source;
`validate` warned me that my own passing gate "certifies the skeleton, not the code" rather than
banking the green; `--strict-links` catches real drift; `ci init` produces a version-pinned workflow
that works. The tool is honest with the user in places most tools flatter them, and the happy path
took under half an hour on an unfamiliar Java codebase.

What stops me short of an unqualified yes is one defect and one packaging problem.

The defect: **`req add` collides with the IDs `adopt` just created, `req link` then writes to every
row sharing that ID, and no gate at any strictness catches it.** Running only commands the tool
printed for me, I produced a matrix in which `UC-003 Vet` claims `PetValidator.java` as its
implementation and `PetValidatorTests.java` as its proof — and CI says green. For a product whose
pitch is "traceability CI can enforce", a silently false link that survives every gate is the worst
possible bug to have. It is not a design flaw, it is an off-by-something in one counter plus a missing
uniqueness check, and both fixes are small. But until they land, the two commands the tool tells a
brownfield user to run next are the two that break it.

The packaging problem: the gate that would have caught half of what I broke, `--strict-links`, is off
by default and missing from all three places that recommend a CI invocation. Anyone following the
documentation ends up with a weaker gate than the tool can give them.

**If we adopt:** run `adopt`, immediately delete the seeded REQ-002..N proposals, then `req add`; put
`validate . --strict-tdd --strict-links` in CI, not the generated `--strict-tdd` alone; and add a
`grep`-level uniqueness check on the matrix's first column until upstream has one. That is three
lines of workaround for something worth having. I would not hand it to a team without those three
lines, and I would want the ID bug fixed before we trusted its output in an audit.
