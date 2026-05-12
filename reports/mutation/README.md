# Mutation Testing Pilot

This directory hosts the output of the [Stryker](https://stryker-mutator.io/)
mutation-testing pilot for `create-spec-driven-app`.

## Running the pilot

```bash
npm run mutation:pilot
```

Stryker mutates `scripts/domain-pack/common.js` (the most logic-dense file in
the codebase) and re-runs the unit tests against each mutant. The mutation
score is the percentage of mutants killed by the test suite — higher is better.

## Configuration

See [`stryker.config.mjs`](../../stryker.config.mjs) at the repo root.

Pilot scope:
- **Mutant target:** `scripts/domain-pack/common.js`
- **Test runner:** `command` (delegates to `node --test`)
- **Test set:** `tests/unit/common.test.js` + `tests/unit/property-based.test.js`
- **Reporters:** `html` + `clear-text` + `progress`
- **Concurrency:** 2 workers

## Interpreting the results

After running the pilot, the HTML report will be generated at
`reports/mutation/mutation.html`. Open it in a browser to see:

- **Mutation score** — overall percentage
- **Survived mutants** — these reveal weak spots in the test suite
- **Killed mutants** — these confirm tests catch the change
- **No coverage** — code paths the tests never exercise

## Acceptance target

Per the implementation roadmap (P3-07), the pilot succeeds when:

- Mutation score ≥ 60% on the JS core after the pilot
- A remediation backlog is opened for survived mutants worth addressing

## What is committed

The HTML and JSON reports are git-ignored — they're large and machine-generated.
Only this README and the mutation pilot configuration are tracked. Commit a
summary of the score in PRs that change `common.js` or its tests.
