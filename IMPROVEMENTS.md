# Improvements Backlog — `create-spec-driven-app`

## 1. Context

This document proposes a prioritised set of improvements for the
`create-spec-driven-app` CLI (currently `v0.1.0-beta.3`), analysed at the
snapshot of the remote branch
[`codex/runtime-env-docker-devcontainer`](https://github.com/rsaglobaltech/spec-driven-development-template/tree/codex/runtime-env-docker-devcontainer).
That branch introduces a runtime contract for generated projects (Docker
Compose, devcontainer, multi‑environment `.env.*` files, and a generated
`docs/specs/runtime-environments.md`).

**Audience.** Maintainers and contributors of the CLI itself — and any AI
coding agent that operates on the repository.

**Scope.** The CLI source (`bin/`, `scripts/`, `templates/`, `tests/`,
`docs/`, `examples/`, `.github/`). The projects scaffolded by the CLI are
explicitly out of scope; they are governed by their own generated specs.

**Guiding principle.** The CLI generates spec‑first artefacts for users but
does not yet dogfood them. Most improvements below close that gap by applying
the same SDD / DDD / BDD / TDD discipline that the tool advocates.

**Priorities.** `P0` = needed for trust in the next minor release; `P1` =
foundational for sustainable contribution; `P2` = maturity / nice‑to‑have.

---

## 2. Spec-Driven Development (SDD)

Make the CLI's own intent, contracts, and decisions auditable as living
specifications.

| #   | Title                                              | Problem                                                                                                 | Proposed action                                                                                                                                                       | Files                                                              | Priority |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------- |
| 2.1 | Top-level `spec.md` for the CLI itself             | The tool generates `spec.md` for users but has none of its own — vision, personas, success criteria are tribal knowledge. | Author `/spec.md` reusing the same template the CLI ships (`templates/base/spec.md.tpl`).                                                                             | `spec.md`                                                          | P0       |
| 2.2 | CLI traceability matrix                            | No mapping from CLI requirements to tests to source — regressions are hard to scope.                    | Add `docs/specs/traceability.md` covering `init`, `validate`, `expand`, with one row per requirement linked to `tests/cli.test.js` cases and the script implementing it. | `docs/specs/traceability.md`                                       | P0       |
| 2.3 | ADRs for foundational decisions                    | Several non‑obvious choices (Bash for `init`, JS for `expand`, `node:test`, YAML pack format, multi‑env `.env.*`) are undocumented. | Publish at least five ADRs in `docs/specs/adr/`.                                                                                                                       | `docs/specs/adr/0001-*.md` … `0005-*.md`                           | P1       |
| 2.4 | Normative runtime-environments spec                | `docs/runtime-environments-design.md` is a design note, not a contract.                                | Promote it to `docs/specs/runtime-environments.md` with invariants per environment, healthcheck SLAs, and acceptance criteria.                                        | `docs/specs/runtime-environments.md`                               | P1       |
| 2.5 | Versioned changelog for generated artefacts        | Template schemas evolve silently; consumers cannot pin a version of the layout they generated against. | Add `docs/specs/artifact-versions.md` and stamp every generated file with the schema version.                                                                          | `docs/specs/artifact-versions.md`, all `templates/**`              | P2       |
| 2.6 | `pack.yaml` contract specification                 | The domain‑pack format is implicit in `scripts/expand_domain_pack.js` and the parking fixture.          | Author `docs/specs/domain-pack-format.md` describing every key, cardinality, allowed values, and examples.                                                            | `docs/specs/domain-pack-format.md`                                 | P0       |

---

## 3. Domain-Driven Design (DDD)

Treat the CLI as a domain in its own right. Today, logic is spread across Bash
and JS with no explicit context map.

| #   | Title                                          | Problem                                                                                       | Proposed action                                                                                                                                                                              | Files                                                                                  | Priority |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- |
| 3.1 | Map the CLI's bounded contexts                 | No explicit context map. Responsibilities leak between scripts.                              | Identify `Scaffolding`, `Validation`, `DomainPackExpansion`, `RuntimeConfig`, `Templating`. Document boundaries in `docs/specs/bounded-contexts.md`.                                          | `docs/specs/bounded-contexts.md`                                                       | P0       |
| 3.2 | Model first-class CLI domain concepts          | `Project`, `DomainPack`, `Template`, `Environment`, `ValidationRule`, `TraceabilityMatrix` only exist as filesystem layout. | Document them in `docs/specs/domain-model.md` and extract them as modules under `scripts/domain/` over time.                                                                                  | `docs/specs/domain-model.md`, `scripts/domain/**` (new)                                | P0       |
| 3.3 | Promote `Environment` to a domain object       | In generated artefacts, environments are config strings, not domain concepts.                | Add `Environment` value object and `Deployment` aggregate to the templated `docs/specs/`.                                                                                                     | `templates/base/docs/specs/domain-model.md.tpl`                                        | P1       |
| 3.4 | Value objects for configuration                | `DatabaseConfig`, `SecretRef`, `PortBinding`, `ServiceName` are inlined as ad‑hoc strings.   | Refactor `scripts/domain-pack/common.js` to expose constructors with invariants; reuse them in `expand_domain_pack.js`.                                                                       | `scripts/domain-pack/common.js`, `scripts/domain/value-objects/**` (new)               | P1       |
| 3.5 | Ubiquitous-language glossary                   | Terms like *pack*, *module*, *bounded context*, *traceability* are used inconsistently in docs. | Publish `docs/specs/glossary.md` and reference it from `README.md` and `AI_RULES.md.tpl`.                                                                                                     | `docs/specs/glossary.md`                                                               | P1       |
| 3.6 | Consolidate scattered logic                    | Logic is split across Bash and JS — duplicated parsing/templating, harder to test.           | Keep Bash as a thin orchestrator (`new_spec_project.sh`). Move YAML/template logic entirely to JS so it can be unit‑tested.                                                                  | `scripts/new_spec_project.sh`, `scripts/domain-pack/common.js`                         | P2       |

---

## 4. Behavior-Driven Development (BDD)

The CLI ships Gherkin templates for users but has none of its own. Behaviour
of `init`, `validate`, `expand`, and the runtime contract is asserted only
through file‑existence checks.

| #   | Title                                                         | Problem                                                                                          | Proposed action                                                                                                                                                                | Files                                                                                          | Priority |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------- |
| 4.1 | Gherkin scenarios for CLI commands                            | No executable acceptance criteria for `init`, `validate`, `expand`.                              | Author `features/cli/init.feature`, `features/cli/validate.feature`, `features/cli/expand.feature`. Cover happy paths, `--dry-run`, `--force`, unknown commands, malformed configs. | `features/cli/init.feature`, `features/cli/validate.feature`, `features/cli/expand.feature`     | P0       |
| 4.2 | Step definitions and a runner                                 | Gherkin alone is not executable.                                                                 | Add `@cucumber/cucumber` as a dev dependency and `npm run test:bdd`.                                                                                                            | `features/cli/steps/**`, `package.json`                                                        | P0       |
| 4.3 | BDD scenarios for the runtime contract                        | The runtime additions on `codex/runtime-env-docker-devcontainer` have no behavioural coverage.   | Scenarios for `APP_ENV` switching dev→feature, DB healthcheck pass/fail, missing‑secret abort, devcontainer `postCreateCommand`.                                                | `features/runtime/env-switch.feature`, `features/runtime/healthcheck.feature`                  | P1       |
| 4.4 | Domain-pack expansion scenarios                               | The parking‑management fixture is only validated through the file tree.                          | Author `features/pack/expand-parking.feature` driving the existing fixture end‑to‑end.                                                                                          | `features/pack/expand-parking.feature`                                                         | P1       |
| 4.5 | Behaviour coverage report in CI                               | Cucumber output is not surfaced.                                                                 | Emit `--format json` and upload as a CI artefact; render a summary in PR comments.                                                                                              | `.github/workflows/ci.yml`                                                                     | P2       |

---

## 5. Test-Driven Development (TDD)

The current suite is E2E only and covers file structure, not behaviour or
edge cases. Move to a test pyramid.

| #   | Title                                                         | Problem                                                                                | Proposed action                                                                                                                                                                | Files                                                                       | Priority |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | -------- |
| 5.1 | Unit tests for `scripts/domain-pack/common.js`                | The YAML parser and template renderer are untested in isolation.                       | Cover happy paths, missing keys, escaping (quotes, slashes, special characters in passwords), and idempotency.                                                                  | `tests/unit/common.test.js`                                                 | P0       |
| 5.2 | Shell tests for `scripts/new_spec_project.sh`                 | Bash logic (config parsing, env derivation, traceability auto‑populate) is untested.   | Adopt **Bats‑core** for assertions and **ShellCheck** in CI.                                                                                                                   | `tests/shell/new_spec_project.bats`, `.github/workflows/ci.yml`             | P0       |
| 5.3 | JSON Schemas for `project.config` and `pack.yaml`             | Lenient parsing accepts typos; users get cryptic errors deep in template rendering.   | Author both schemas under `schemas/`; reject early with actionable messages; enable editor autocompletion via `$schema` headers.                                              | `schemas/project.config.schema.json`, `schemas/pack.yaml.schema.json`       | P1       |
| 5.4 | Coverage reporting                                            | Coverage is unknown.                                                                  | Add `c8` with a starting threshold of 80 % lines / 70 % branches; fail CI on regression.                                                                                       | `package.json`, `.github/workflows/ci.yml`                                  | P1       |
| 5.5 | Property-based tests for template rendering                   | Hand‑written examples miss escaping edge cases.                                       | Use `fast-check` to generate config inputs and assert invariants (no unresolved placeholders, deterministic output).                                                            | `tests/property/render.test.js`                                             | P2       |
| 5.6 | Mutation-testing pilot                                        | Tests may pass while logic regresses subtly.                                          | Run **Stryker** weekly on `scripts/domain-pack/common.js`; track score.                                                                                                        | `stryker.conf.mjs`, `.github/workflows/mutation.yml`                        | P2       |
| 5.7 | Snapshot tests for generated outputs                          | Hard to spot accidental drift in template output.                                     | Snapshot the parking‑management fixture's rendered tree; review diffs deliberately.                                                                                            | `tests/snapshots/**`                                                        | P1       |

---

## 6. Cross-Cutting Concerns

### 6.1 Runtime & operations (specific to `codex/runtime-env-docker-devcontainer`)

- **Secrets story (P0).** `.env.feature` and `.env.prod` ship placeholder
  passwords. Document one of: Docker secrets, `sops`, `doppler`, or
  environment injection from CI. Reference the decision from
  `docs/specs/runtime-environments.md`.
- **Migration adapter (P1).** No story for Flyway / Alembic / Prisma /
  TypeORM. Add a stack‑aware hook in `templates/base/docker-compose.yml.tpl`.
- **Devcontainer bootstrap (P1).** Add a `postCreateCommand` to
  `templates/base/.devcontainer/devcontainer.json.tpl` that installs
  dependencies and runs migrations on first attach.
- **Separate Compose vars from app vars (P1).** Split each `.env.<env>` into
  `.env.<env>.infra` (`POSTGRES_*`) and `.env.<env>.app` (`DATABASE_URL`, app
  config). Update `docker-compose.yml.tpl` and the generated README.
- **Whitelist the DB engine (P0).** `scripts/new_spec_project.sh` should
  reject `DATABASE_ENGINE` values outside `{postgres}` today (extendable)
  with an actionable error.
- **Healthcheck verification (P1).** Add a Cucumber scenario that asserts the
  generated `docker-compose.yml` reports `db` healthy within an SLA.

### 6.2 Tooling

- **ESLint + Prettier (P1)** — flat config, applied to `bin/`, `scripts/`,
  `tests/`. `eslint.config.js`, `.prettierrc`.
- **ShellCheck + `shfmt` in CI (P0)** — for every `*.sh` file.
- **`yamllint` (P1)** — for `pack.yaml` fixtures and templates.
- **Commitlint + conventional commits (P1)** — `commitlint.config.js`,
  `.husky/commit-msg`.
- **Release automation (P2)** — `release-please` workflow; replace manual
  version bumps.

### 6.3 Developer experience and governance

- **`CONTRIBUTING.md` (P1)** — onboarding, branching model, ADR cadence
  (one ADR per merged design decision).
- **`SECURITY.md` (P1)** — vulnerability disclosure policy.
- **`MAINTAINERS.md` (P2)** — current maintainers and review areas.
- **`docs/architecture.md` (P1)** — single page explaining the CLI's bounded
  contexts (links to §3.1) and how a request flows from `npx` to written
  files.
- **`.github/pull_request_template.md` (P1)** — require linking the affected
  requirement ID in `docs/specs/traceability.md`.

---

## 7. Roadmap

### Phase 1 — Quick wins (week 1, all P0)

`2.1`, `2.2`, `2.6`, `3.1`, `4.1`, `5.1`, `5.2`, `6.1` (env split, DB
whitelist, secrets policy stub), `6.2` (ESLint, ShellCheck).

### Phase 2 — Foundations (month 1)

`2.3`, `2.4`, `3.2`, `3.5`, `4.2`, `4.3`, `5.3`, `5.4`, `5.7`,
`6.1` (migrations, devcontainer bootstrap, healthcheck scenario),
`6.3` (CONTRIBUTING, SECURITY, architecture, PR template).

### Phase 3 — Maturity (quarter 1)

`2.5`, `3.3`, `3.4`, `3.6`, `4.4`, `4.5`, `5.5`, `5.6`,
`6.2` (commitlint, release‑please), `6.3` (MAINTAINERS, ADR cadence
enforcement).

---

## 8. Success Metrics

- Unit + shell test coverage ≥ **80 %** lines / **70 %** branches on `main`.
- ≥ **15** Gherkin scenarios across `features/cli/`, `features/runtime/`,
  `features/pack/`.
- ≥ **5** ADRs published in `docs/specs/adr/`.
- **100 %** of `pack.yaml` fixtures pass JSON‑Schema validation.
- `validate_specs.sh` exits **0** on the parking‑management fixture in CI.
- **0** ShellCheck warnings and **0** ESLint errors on `main`.
- Median time from `init` to a green `validate` ≤ **60 s** on a clean
  environment.
- Every merged PR references at least one requirement ID in
  `docs/specs/traceability.md`.

---

## 9. References

- **Spec-Driven Development** — B. Boehm & R. Turner, *Balancing Agility and
  Discipline*; M. Jackson, *Problem Frames*; ISO/IEC/IEEE 29148.
- **Domain-Driven Design** — E. Evans, *Domain-Driven Design*; V. Vernon,
  *Implementing Domain-Driven Design*; S. Millett, *Patterns, Principles and
  Practices of DDD*.
- **Behavior-Driven Development** — D. North, *Introducing BDD* (2006);
  M. Wynne & A. Hellesøy, *The Cucumber Book*; G. Adzic, *Specification by
  Example*.
- **Test-Driven Development** — K. Beck, *Test-Driven Development: By
  Example*; S. Freeman & N. Pryce, *Growing Object-Oriented Software,
  Guided by Tests*; M. Fowler, *Refactoring* (2nd ed.).
- **Operations** — A. Wiggins, *The Twelve-Factor App*; G. Kim et al.,
  *The DevOps Handbook*.
