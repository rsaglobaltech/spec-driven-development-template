# ADR-0005: Multi-environment .env files split into .infra and .app

**Date:** 2024-03-10  
**Status:** Accepted  
**Deciders:** Core maintainers

---

## Context

Generated projects need environment-specific configuration for at least three stages: `dev`, `feature`, and `prod`. The initial approach was a single `.env.<env>` file per environment containing both Docker Compose service variables (`POSTGRES_*`) and application-level variables (`DATABASE_URL`, `APP_ENV`).

This created two problems:

1. **Conceptual mixing:** Docker Compose's `env_file` directive loaded the same file for both the `db` service (which only needs `POSTGRES_*`) and the app container (which only needs `DATABASE_URL`). This made the blast radius of a misconfiguration unnecessarily large.
2. **Secrets discipline:** It was unclear which variables should be committed to version control and which should be injected at deploy time.

## Decision

Split each environment file into two:

- **`.env.<env>.infra`** — consumed by the `db` Docker Compose service. Contains only `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`. Safe to commit for `dev` and `feature`; must be injected via secrets manager for `prod`.
- **`.env.<env>.app`** — consumed by the application container (workspace service). Contains `APP_ENV`, `DATABASE_URL`, `DATABASE_*` application-level variables. Commitable for `dev`; rotate credentials for `feature`/`prod`.

`docker-compose.yml` loads `env_file: .env.${APP_ENV}.infra` for `db` and `env_file: .env.${APP_ENV}.app` for `workspace`.

## Consequences

- **Positive:** Clear separation of concerns; reduces the risk of app-layer leaking into the DB container; sets up a natural injection boundary for secrets managers (doppler, sops, Vault).
- **Positive:** Easier to audit: a security reviewer can inspect `.infra` files independently.
- **Negative:** More files to manage per environment (6 instead of 3). Mitigated by generation — the files are always scaffold-produced, never hand-written.
- **Neutral:** The original `.env.<env>` files are no longer generated. Projects generated before this change need a one-time migration (rename and split).

## Secrets guidance

For `prod`, **never commit real credentials**. Use one of:

- **doppler** — `doppler run -- docker compose up`
- **sops** — encrypted `.env.prod.infra` in version control
- **CI secrets** — inject via `${{ secrets.POSTGRES_PASSWORD }}` in GitHub Actions
