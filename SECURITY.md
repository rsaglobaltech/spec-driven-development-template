# Security policy

## Reporting a vulnerability

**Use [GitHub private vulnerability reporting](https://github.com/rsaglobaltech/spec-driven-development-template/security/advisories/new).**
It is enabled on this repository, so the report stays private until a fix ships.

Do not open a public issue for a vulnerability. Do not send it to a maintainer's
personal address — the advisory form keeps the report attached to the project
rather than to one person's inbox.

Include what you would want if you were fixing it: the version, the command, the
smallest input that triggers it, and what an attacker gets.

**What to expect.** This is a single-maintainer project (see
[MAINTAINERS.md](MAINTAINERS.md)), which is the honest context for these numbers:

| Stage | Target |
| --- | --- |
| Acknowledgement | 5 working days |
| Initial assessment | 10 working days |
| Fix or documented mitigation | 90 days for high and critical |

If a report goes unacknowledged past those windows, disclose publicly. A silent
maintainer is not a reason for a vulnerability to stay hidden.

Credit goes in the advisory and the changelog unless you ask otherwise.

## Supported versions

| Version | Supported |
| --- | :-: |
| 0.2.x | ✅ |
| 0.1.x | ❌ |

Pre-1.0, only the latest minor gets fixes. Backports to an older minor are not
promised; the upgrade path is forward. Once 1.0 ships, this table is replaced by
the support policy in `docs/release-process.md`.

The guarantees themselves — pinning, digests, signing, air-gapped installs and
the SBOM — are documented in [docs/supply-chain.md](docs/supply-chain.md).

## What is in scope

This is a CLI and a set of build-tool plugins. They read your repository, write
spec files, and shell out to `git`. The interesting attack surface is therefore:

- **Domain packs.** `csda specops add` fetches a pack from a git repository and
  renders its templates into your project. A malicious pack is the most direct
  route to writing unwanted files. Packs are pinned in `.specops.lock` with an
  integrity digest, and `csda validate --against-lock` fails on drift. A way to
  bypass either is in scope.
- **Path traversal on render.** Any input that makes the CLI write outside the
  project directory.
- **Command injection.** The CLI invokes `git` and, in `harness run`, an agent
  command. Input that escapes into a shell is in scope.
- **The published artefacts.** The npm package, the Docker image and the plugin
  jars. npm releases carry [provenance](https://docs.npmjs.com/generating-provenance-statements);
  a mismatch between a published artefact and this repository is in scope.
- **CI secrets.** This project has zero runtime dependencies, but a compromised
  devDependency still executes on CI with a publish token in scope. That is why
  Dependabot, `npm audit` and CodeQL all gate the build.

## What is not in scope

- Vulnerabilities in *your* project that `csda validate` failed to notice. It is
  a specification gate, not a security scanner, and it never claims otherwise.
- Running the CLI against a repository you do not trust. Rendering a pack from
  an untrusted source is equivalent to running its code — pin what you install.
- Denial of service through deliberately pathological input to a local CLI.
- Anything requiring an attacker to already have write access to your repository
  or your CI configuration.
