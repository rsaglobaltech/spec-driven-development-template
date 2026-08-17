# Release process

Replaces the frozen `RELEASE_0.1.0_CHECKLIST.md`, which described a manual
0.1.0 dry run and had drifted (it claimed Node ≥ 18, and every box was
unticked long after 0.1.4 shipped).

## What gets published

| Artefact | Registry | Workflow | Status |
|---|---|---|---|
| `create-spec-driven-app` | npm, public | `publish-npm.yml` | Live |
| `@rsaglobaltech/create-spec-driven-app` | GitHub Packages | `publish-github-packages.yml` | Live |
| CLI image | `ghcr.io` | `publish-docker.yml` | Live, `linux/amd64` and `linux/arm64` |
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

## Support policy

**Which versions get fixes.** Pre-1.0, only the latest minor. Backports to an
older minor are not promised — the upgrade path is forward, and pretending
otherwise would be a commitment one maintainer cannot keep. The same table is
in [SECURITY.md](../SECURITY.md#supported-versions) for vulnerabilities
specifically.

Once 1.0 ships, the intent is one supported line at a time plus the previous
minor for six months. That is intent, not a promise, until it is written here
without this sentence.

**Node.js.** `package.json` declares `>=22` and CI tests Node 22 and 24 across
Linux, macOS and Windows — the floor and the current LTS, so a break at either
end shows up. Raising the floor is **breaking** for the CLI, never a quiet
minor: an `npx` invocation that used to work and now refuses to run is breaking,
whatever the changelog calls it.

The floor moved from 20 to 22 in August 2026, because Node 20 left LTS
maintenance that April and testing against an unsupported runtime proves
nothing. The rule from here: **the floor is a maintained LTS.** When one leaves
maintenance the floor moves in the next release, and the changelog says so under
Breaking.

**Docker.** Images are tagged `X.Y.Z` and `latest`, for `linux/amd64` and
`linux/arm64`. A published tag is never rebuilt in place — `0.2.0` shipped
amd64-only and the fix had to be `0.2.1`, because re-running a workflow against
an old tag checks out the workflow *as it was at that tag*. Pin `X.Y.Z` in CI
and treat `latest` as a convenience only.

## Compatibility windows

Three version numbers travel with a project, and they are checked, not merely
recorded. Both gates below were added after finding that the fields were
written by the CLI and read by nothing.

| Field | Where | This CLI supports | On mismatch |
| --- | --- | --- | --- |
| `schema_version` | `pack.yaml` | up to **1.2.0** | A pack declaring a newer schema is rejected with the reason and the upgrade command |
| `specops_version` | `.specops.lock` | **1** | A lockfile from a newer CLI is rejected on read |
| pack `version` | `.specops.lock` | any | Pinned; a content digest change fails the build — see [supply chain](supply-chain.md) |

**Older is always readable.** A pack on an older schema, or a lockfile with no
`specops_version` at all, works unchanged — those files predate the field, and
refusing them would strand existing projects to enforce a rule invented later.
Only *newer than this CLI* is refused, because `schemas/pack.schema.json` sets
`additionalProperties: false`: a newer minor is genuinely unreadable here, not
merely unfamiliar. Failing at the top with "upgrade the CLI" beats failing
twenty lines in with "unknown property".

**Bumping the pack schema** is a two-step release, in this order:

1. Ship the CLI that understands the new schema — raise `PACK_SCHEMA_VERSION`
   in `scripts/domain-pack/common.ts` in the same change as the field.
2. Only then publish packs that use it.

Reverse the order and every curated pack becomes uninstallable on the released
CLI. A unit test asserts that no pack in `packs/` declares a schema newer than
the CLI supports, so getting this backwards fails CI rather than users.

## Cutting a release

1. Update `CHANGELOG.md`. Every user-visible change gets a line; group by
   Added / Changed / Fixed / Removed.
2. Bump `version` in `package.json`.
3. Open a PR to `main`. `main` is protected: the twelve required checks in
   [CONTRIBUTING.md](../CONTRIBUTING.md#required-checks) must be green, and the
   branch must be up to date with `main` before it will merge.
4. Merge.
5. Tag the merge commit `vX.Y.Z` and push the tag. `publish-npm.yml` fires.
6. Write the GitHub release notes from the changelog entry.

## Pre-releases

Run `publish-github-packages.yml` manually (`workflow_dispatch`) with
`dist_tag: beta` and a version like `0.2.0-beta.1`. Pre-releases never go to
the public npm registry with the `latest` tag.

## Before you tag — the gate

`publish-npm.yml` gates on `npm run test:all` and a `pack:dry-run`, so a broken
tag cannot publish. Run the same things locally first — finding it here costs a
commit, finding it in the workflow costs a version number:

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
