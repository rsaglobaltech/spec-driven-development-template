# Validating

The gate. `validate` is what makes a spec a contract rather than a
document — run it locally, then make it a required check.

---

## Run `validate` locally and in CI

**Goal:** make `validate` part of every PR.

Local:

```bash
npx create-spec-driven-app@latest validate .
```

GitHub Actions:

```yaml
# .github/workflows/specs.yml
name: Spec validation
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npx --yes create-spec-driven-app@latest validate .
```

What `validate` checks:

- required directories (`features/`, `docs/specs/`),
- required files (`spec.md`, `AI_RULES.md`, `traceability.md`, ADR entrypoint),
- at least one `.feature`,
- no unresolved `{{...}}` placeholders,
- traceability matrix header presence,
- every `.feature` appears in `traceability.md`,
- allowed traceability statuses,
- duplicate `Scenario ID` detection,
- expected `use-cases.md` and `events.md` headers when those files exist.

Exit codes: `0` ok · `1` unhandled · `2` usage · `3` missing prerequisite · `4` destination conflict.

---

---

## Enforce TDD with `validate --strict-tdd`

**Goal:** fail PRs when a `REQ` exists in `spec.md` but has no scenario, no implementing test, or no row in `traceability.md`.

```bash
npx create-spec-driven-app@latest validate . --strict-tdd
```

`--strict-tdd` is in addition to the normal checks. It is intended for "no contract without a test" gates — particularly useful in `contracts` packs (see §8). Wire it into CI exactly like `validate`, just append the flag.

> When a `REQ` is intentionally not yet implemented, set its status in `traceability.md` to `Deferred` — `--strict-tdd` accepts that as an explicit signal and won't fail.

---

---

## Next

- [Automate the loop](automation.md)
- [Troubleshooting](troubleshooting.md)
