# Maintainers

| Area | Maintainer |
| --- | --- |
| Everything | [@rsaglobaltech](https://github.com/rsaglobaltech) |

One maintainer. That is worth stating plainly rather than implying a team
through a plural heading, because it tells you what to expect: review latency is
one person's calendar, and the
[response windows in SECURITY.md](SECURITY.md#reporting-a-vulnerability) are set
accordingly.

The areas below exist so that ownership is already carved up when a second
maintainer arrives, and so [`.github/CODEOWNERS`](.github/CODEOWNERS) has
something to name.

| Area | Paths |
| --- | --- |
| CLI and validator | `bin/`, `scripts/` |
| Domain packs | `packs/`, `schemas/`, `scripts/specops/`, `scripts/domain-pack/` |
| Specs and ADRs | `docs/specs/` |
| Build-tool plugins | `packages/maven-plugin/`, `packages/gradle-plugin/` |
| Editor and agent surfaces | `packages/vscode-spec-driven/`, `packages/lsp-spec-driven/`, `packages/mcp-spec-driven/`, `templates/agents/` |
| Release and CI | `.github/workflows/`, `Dockerfile.cli`, `docs/release-process.md` |

## How merging works here

`main` is protected. A pull request merges when the required checks pass; see
[CONTRIBUTING.md](CONTRIBUTING.md) for the full list.

**Approving reviews are not required, deliberately.** With a single maintainer,
requiring an approval would mean nobody can merge anything — you cannot approve
your own pull request. The gate that actually protects `main` here is the test
suite, and that one is enforced. When a second maintainer joins, turn on
required reviews and delete this paragraph.

## Becoming a maintainer

There is no committee. Sustained, reviewed contributions in one of the areas
above, then ask. The realistic first steps are in
[CONTRIBUTING.md](CONTRIBUTING.md): module templates, validator rules, and
domain packs are the places where a contribution does not require holding the
whole architecture in your head.
