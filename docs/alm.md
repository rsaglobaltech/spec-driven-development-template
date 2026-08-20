# Jira and Azure Boards

**Goal:** every requirement in the matrix has exactly one issue on the board,
and the two never quietly disagree.

`csda alm sync` creates an issue for each unlinked `REQ`, closes the issue when
its requirement reaches a done status, and reports **drift** — an issue closed
while its requirement is still open — without resolving it for you.

**The ALM is a mirror, not a source of truth.** The spec and the matrix are the
contract; an issue reflects a requirement, it never defines one. That is why
`sync` closes issues but never reopens requirements, and why drift is reported
rather than reconciled.

## Configure

`alm.config.yaml` at the project root. **Tokens never live in this file** —
only the *name* of the environment variable that holds them, so the file is
safe to commit and CI supplies the secret.

```yaml
alm_version: 1
provider: jira            # jira | azure
base_url: https://acme.atlassian.net
project_key: HIE
token_env: JIRA_TOKEN     # env var holding the API token
user_env: JIRA_USER       # jira only: env var holding the account email
```

Which keys a provider reads is the provider's own declaration, and they differ:

<!-- csda:alm-provider-table — checked by tests/unit/alm-conformance.test.ts -->

| Provider | Required | Optional |
| --- | --- | --- |
| `jira` | `base_url`, `project_key`, `token_env` | `user_env`, `issue_type` |
| `azure` | `base_url`, `project_key`, `token_env` | `issue_type`, `done_state` |

Two asymmetries worth knowing, because both used to fail silently:

- **`done_state` is Azure-only.** Jira's workflows are per-project, so "done"
  there is a status *category* and closing means finding a transition into it.
  Setting `done_state` on a Jira project does nothing — and `sync` now says so
  before its first request.
- **`user_env` is Jira-only**, because Jira Cloud's Basic auth pairs the token
  with an account email. It defaults to `JIRA_USER` when omitted.

Any key that the configured provider does not read is reported as a warning
with a fix, naming the provider that *would* have read it.

## Run

```bash
export JIRA_TOKEN=…  JIRA_USER=…
csda alm sync --dry-run     # plan only: no issue is created or closed
csda alm sync               # do it, and write .specops/alm-map.json
csda alm status             # the REQ ↔ issue mapping, no network
csda alm link REQ-007 HIE-42   # adopt an issue that already exists
```

`.specops/alm-map.json` is the mapping and **belongs in git**: it is what makes
`sync` idempotent, and what lets a second machine pick up where the first left
off. `sync` exits 1 when it finds drift, so it works as a scheduled CI job.

## Adding a provider

A provider is one module under `scripts/alm/providers/` plus a row in that
directory's `index.ts`. It declares which config keys it reads and which
operations it supports, and implements three methods — `createIssue`,
`getIssueStatus`, `closeIssue`. `tests/unit/alm-conformance.test.ts` then runs
the same suite against it as against the two that ship, from a recorded fixture
in `tests/fixtures/alm/<id>.json`; a registered provider without one fails.

---

## Next

- [Automation](automation.md)
- [Command reference](commands.md)
