# Release process

Replaces the frozen `RELEASE_0.1.0_CHECKLIST.md`, which described a manual
0.1.0 dry run and had drifted (it claimed Node ≥ 18, and every box was
unticked long after 0.1.4 shipped).

## What gets published

| Artefact | Registry | Workflow | Status |
|---|---|---|---|
| `create-spec-driven-app` | npm, public | `publish-npm.yml` | Live |
| `@rsaglobaltech/create-spec-driven-app` | GitHub Packages | `publish-github-packages.yml` | Live |
| CLI image | `ghcr.io` | `publish-docker.yml` | Built, never pushed — C7-04 |
| `csda-maven-plugin` | Maven Central or an internal Nexus | none yet | C7-05 |
| `csda-gradle-plugin` | Gradle Plugin Portal or an internal repo | none yet | C7-06 |
| `vscode-spec-driven` | VS Code Marketplace | none yet | C7-07 |
| `@spec-driven/mcp-server`, `@spec-driven/lsp-server` | npm | none yet | C7-08, blocked on C6-03 |

## Versioning

Semantic versioning. The CLI and the companion packages version independently;
a CLI release does not force a bump of the VS Code extension.

**Tags are `vX.Y.Z`.** The publish workflows trigger on `v*`, and the two tags
that predate this document (`0.1.0-beta.1`, `0.1.4`) have no `v` prefix, which
is why the tag-triggered path had never once fired. Do not create unprefixed
tags.

## Cutting a release

1. Update `CHANGELOG.md`. Every user-visible change gets a line; group by
   Added / Changed / Fixed / Removed.
2. Bump `version` in `package.json`.
3. Open a PR to `main`. CI must be green — all ten jobs, Windows included.
4. Merge.
5. Tag the merge commit `vX.Y.Z` and push the tag. `publish-npm.yml` fires.
6. Write the GitHub release notes from the changelog entry.

## Pre-releases

Run `publish-github-packages.yml` manually (`workflow_dispatch`) with
`dist_tag: beta` and a version like `0.2.0-beta.1`. Pre-releases never go to
the public npm registry with the `latest` tag.

## Before you tag — the gate

The publish workflows currently gate on `npm test`, which is the 37-case E2E
suite only. Until C6-06 changes that to `test:all`, run the full suite locally
first:

```bash
npm run verify        # typecheck · eslint · prettier · tests · pack dry-run
npm run test:all      # every suite, including BDD and the package tests
npm pack --dry-run    # inspect the tarball contents
```

Check the tarball carries `bin/`, `dist/`, `templates/`, `examples/` and
`README.md`, and nothing else — no `.local`, no `dist/packages/**` for
unpublished packages, no coverage output.

## Verifying a published release

```bash
npx create-spec-driven-app@X.Y.Z --help
npx create-spec-driven-app@X.Y.Z init --config ./project.config --out /tmp --dry-run
```

## After the release

Open the next milestone and record the release in
[`mejoras/plan-cierre-enterprise.md`](../mejoras/plan-cierre-enterprise.md)
if it closes one of its tasks.
