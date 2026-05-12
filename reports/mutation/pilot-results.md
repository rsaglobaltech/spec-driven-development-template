# Stryker Mutation Pilot — Results

**Date:** 2026-05-12
**Target:** `scripts/domain-pack/common.js` (~870 LOC, the most logic-dense file)
**Test set:** `tests/unit/common.test.js` + `tests/unit/property-based.test.js`
**Tool:** [Stryker](https://stryker-mutator.io/) 9.6.1
**Runtime:** 4 minutes, 4 seconds on a single workstation, concurrency=2

## Score

| Metric | Count | Notes |
|---|---:|---|
| Killed | 392 | Mutant produced different test output → tests caught it |
| Survived | 395 | Mutant produced same test output → blind spot |
| Timeout | 6 | Mutant caused tests to hang → effectively killed |
| No coverage | 0 | Every mutated line was reached by some test |
| **Total mutants** | **793** | |
| **Mutation score** | **50.19%** | (killed + timeout) / total |

The pilot's acceptance threshold (per the roadmap P3-07) was **≥ 60%**.
We're at **50.19%** — below target, but the pilot's purpose is to surface
the gap, not to gate the build. The Stryker config keeps the break
threshold at 0 to avoid blocking PRs while the suite catches up.

## Interpretation

A 50% score on a file this large says: **our tests cover the happy path
well, but mutate operators (`&&` → `||`, boolean returns, array literals)
slip through.** Concretely, the surviving mutants fall into three buckets:

1. **String-literal mutations** (~30%) — Stryker replaces our log/error
   message strings with `""`. Our tests rarely assert on the exact
   wording, so these survive. These are the cheapest to fix: add
   `assert.match(err.message, /expected fragment/)` to relevant tests.

2. **Conditional / boolean mutations** (~45%) — `||` → `&&`, `===` → `!==`,
   `> 0` → `>= 0`. These reveal genuine test gaps: code paths that are
   exercised but whose outcome isn't asserted. The biggest cluster is in
   `parseTraceabilityRows` and `buildTraceabilityMarkdown` — both have
   many branches, few of which have dedicated negative-path tests.

3. **Array / block declaration mutations** (~25%) — replacing array
   literals with `[]` and statement blocks with no-ops. These survive
   wherever a function builds a result that the caller doesn't inspect
   beyond `Array.isArray(...)`.

## Remediation backlog

Captured here so future PRs can attack the score incrementally:

- [ ] Add error-message assertions to `loadPack`, `validatePackModel`,
      and `safeResolve` test cases. Estimated: 15-20 mutants killed.
- [ ] Add tests for `parseTraceabilityRows` covering: empty input,
      legacy header only, rich header only, malformed row, mode flag.
      Estimated: 50-70 mutants killed.
- [ ] Add tests for `buildTraceabilityMarkdown` covering both modes,
      empty rows, status preservation, ordering invariants.
      Estimated: 40-60 mutants killed.
- [ ] Add tests for `hasStructuredDomainModel` covering each section
      individually. Estimated: 15-25 mutants killed.
- [ ] Tighten property-based generators in `property-based.test.js` to
      assert specific output formats (not just non-emptiness).
      Estimated: 20-40 mutants killed.

Crossing 60% likely needs ~150 additional kills — achievable in 2-3 PD.

## Reproducing

```bash
npm run mutation:pilot
open reports/mutation/mutation.html
```

The HTML report (`mutation.html`) is git-ignored. Open it locally to
explore each surviving mutant in context.

## Configuration

See [`stryker.config.mjs`](../../stryker.config.mjs). The pilot deliberately
keeps the break threshold at 0; the high/low thresholds (60/40) are
informational only, used to colour the HTML report.
