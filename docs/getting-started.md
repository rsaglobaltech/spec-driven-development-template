# Getting started

Two ways in, depending on whether the code already exists. Both take
under an hour and neither requires reading anything else first.

---

## Adopt SDD on an existing repository

**Goal:** the brownfield path (L1) — install specs, rules and the traceability
matrix on a codebase that already exists, without touching a line of code.

```bash
cd your-existing-repo

# Read the repository first. Writes nothing.
npx create-spec-driven-app@latest onboard

# Detects the stack from pom.xml / build.gradle / package.json / go.mod
npx specgate@latest adopt

# Passes immediately — the generated baseline REQ-001 anchors the matrix
npx specgate@latest validate .
```

Start with `onboard`. It proposes the capabilities your layout already implies
and names the evidence for each — the modules your build declares, or the level
at which your code divides:

```
3. Capabilities this codebase already implies
   · Booking       domain/src/main/java/com/acme/booking   (28 files)
   · Business      domain/src/main/java/com/acme/business   (20 files)
   · Wallet        domain/src/main/java/com/acme/wallet       (6 files)
```

`adopt` then seeds one **proposed** requirement per capability, so `spec.md`
starts as a handful of statements to argue with instead of a blank page. Each
one says it is a guess and names where it came from; each gets a `Draft` row
with a `TBD` test, so nothing claims to be specified or verified.

What `adopt` writes (and only if the file does not already exist):

| File | Purpose |
| --- | --- |
| `spec.md` | REQ-001 "existing behaviour is preserved", plus one proposed requirement per capability. |
| `AI_RULES.md` | Agent/human rulebook with your detected stack and test command. |
| `features/adoption/baseline.feature` | Baseline Gherkin scenario pinning the adoption invariant. |
| `docs/specs/traceability.md` | Rich matrix with the baseline row and a row per proposal. |
| `docs/specs/adr/README.md` | ADR index for future decisions. |

Override anything the detection got wrong with `--var`, and skip the proposals
entirely with `--no-capabilities`:

```bash
npx specgate@latest adopt \
  --var DOMAIN="health information exchange" \
  --var TEST_CMD="./mvnw -B verify"
```

### A repository with more than one module

If your build declares modules — Maven or Gradle sub-projects, npm or pnpm
workspaces, Cargo members, Go modules, gems, `.csproj` files — adopt each one
and let `validate` aggregate:

```bash
npx create-spec-driven-app@latest adopt --monorepo
npx create-spec-driven-app@latest validate .   # one line per module
```

That writes `specops.config.yaml` listing every module it adopted. The
repository root stays out of it: in monorepo mode `validate` checks the
children.

Then retro-fill real requirements one at a time (recipe 2) and lock the gate
in CI (recipes 4–5). Until you do, `validate` passes but says so — an adoption
whose only scenario is the baseline certifies the skeleton, not the code.

---

---

## Generate your first project

**Goal:** scaffold a new repo with `spec.md`, `AI_RULES.md`, `docs/specs/`, an empty `features/` directory, and a traceability matrix.

```bash
# 1. Start from the shipped example
cp examples/project.config.example /tmp/acme-energy-hub.config

# 2. Edit /tmp/acme-energy-hub.config — minimum keys:
#   PROJECT_NAME, PROJECT_SLUG, PROJECT_TYPE, DOMAIN, STACK, API_STYLE, TESTING

# 3. Scaffold
npx specgate@latest init \
  --config /tmp/acme-energy-hub.config \
  --out /tmp

# 4. Verify
tree /tmp/acme-energy-hub -L 2
```

Useful flags:

| Flag | Use |
| --- | --- |
| `--dry-run` | Print every file that would be written; don't touch disk. |
| `--force` | Overwrite a pre-existing target directory. |
| `--no-git` | Skip `git init` (defaults to initialising). |

---

---

## Replace the scaffold with real requirements

**Goal:** turn the template `spec.md` and `traceability.md` into project-specific content.

1. Open `spec.md`. Replace every placeholder paragraph; keep the `REQ-NNN` heading convention because the validator uses it.
2. Update `docs/specs/traceability.md`. Use the rich 10-column header if you want full DDD coverage; the legacy 4-column form is also accepted.
3. Each `REQ-NNN` you add to `spec.md` must appear in `traceability.md` and (eventually) in a `.feature` file. `validate` flags missing rows; `validate --strict-tdd` also flags missing scenarios/tests.

> Tip: keep `AI_RULES.md` open in your editor. It is what every coding agent reads on every prompt — changes there propagate to Claude/Cursor/Aider without re-prompting.

---

---

## Then: the daily loop

Scaffolding is day one. From day two the loop is four commands, and none of them
asks you to edit the ten-column matrix by hand.

```bash
specgate status                      # where things stand, and what to run next
specgate plan                        # the queue: what still needs a test or code
specgate req add "Operators can export a monthly report"
specgate req link REQ-007 --feature features/reporting/export.feature \
                      --test src/ReportTest.java
specgate done REQ-007 --check        # validates first, then flips the status
```

`specgate status` is the one to start the day with — it names the single next
command, so you never have to remember which of the others applies.

If `validate` complains about something mechanical — an orphan `.feature`, a
requirement in `spec.md` with no row — `specgate fix --dry-run` shows what it would
repair, and `specgate fix` applies it.

---

## Next

- [Every command, grouped by when you need it](commands.md)
- [Write your first scenario](writing-specs.md)
- [Put the gate in CI](validating.md)
- [The whole loop, end to end](tutorial.md)
