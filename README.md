<div align="center">

# 🧭 create-spec-driven-app

**Specs as executable contracts — requirements, scenarios and traceability that CI enforces.**

[![CI](https://github.com/rsaglobaltech/spec-driven-development-template/actions/workflows/ci.yml/badge.svg)](https://github.com/rsaglobaltech/spec-driven-development-template/actions/workflows/ci.yml)
[![npm latest](https://img.shields.io/npm/v/create-spec-driven-app?logo=npm&label=npm)](https://www.npmjs.com/package/create-spec-driven-app)
[![npm beta](https://img.shields.io/npm/v/create-spec-driven-app/beta?logo=npm&label=beta)](https://www.npmjs.com/package/create-spec-driven-app)
[![Docs](https://img.shields.io/badge/docs-github_pages-0e8078)](https://rsaglobaltech.github.io/spec-driven-development-template/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#-license)

</div>

> Stop coding before requirements are operationally clear. Every requirement
> maps to a scenario, a domain artefact, an implementation and a test — and the
> gate fails when one is missing.

---

## ⚡ Start

**Existing codebase** — the common enterprise case:

```bash
cd your-repo
npx create-spec-driven-app@latest onboard   # reads the repo, proposes its capabilities
npx create-spec-driven-app@latest adopt     # writes the spec skeleton, touches no code
npx create-spec-driven-app@latest validate .
```

**New project:**

```bash
npx create-spec-driven-app@latest init      # interactive wizard
```

Requires **Node.js ≥ 20** — or none at all with the Docker image:

```bash
docker run --rm -v "$PWD:/workspace" ghcr.io/rsaglobaltech/csda validate . --strict-tdd
```

→ [Getting started](docs/getting-started.md) · [Quickstart for joiners](docs/quickstart.md)

## 🪜 Adopt one level at a time

Each level is useful on its own and never requires the ones above it.

| Level | You get | Commands | Cost |
| --- | --- | --- | --- |
| **L1** | Traceable specs in your repo | `onboard`, `adopt` | ~1 hour |
| **L2** | A PR gate enforcing spec and test coverage | `validate --strict-tdd` | ~1 hour |
| **L3** | Versioned, reusable domain requirements | `specops add / sync / diff` | ~1 day |
| **L4** | Agent-driven delivery, one requirement at a time | `agents init`, `harness run` | ~1 week |

## 🛠️ What it does

**A daily loop, not a one-shot scaffolder.** `csda status` says where the
project stands and what to run next; `csda plan` is the queue; `csda req` adds
and links requirements so nobody hand-edits the ten-column matrix; `csda done`
closes them.
→ [Quickstart](docs/quickstart.md) · [Command reference](docs/commands.md)

**Specs that are checked.** `csda validate` fails the build when a requirement
has no scenario, no test, or no row in the traceability matrix. `--strict-tdd`
fails it when a requirement moves past Draft without a test.
→ [Writing specs](docs/writing-specs.md) · [Validating](docs/validating.md)

**Changes you review as intent.** Modify a spec that already shipped through a
reviewable delta — only what moves, never a copy. Archiving merges it into the
spec tree, writes the matrix rows and materialises the feature files, so a
merged proposal cannot quietly become undone work.
→ [Reviewing changes](docs/reviewing-changes.md)

**Domain knowledge as a dependency.** A pack is a versioned, schema-validated
domain model. Install it, pin it, upgrade it deliberately — and review the
upgrade as intent with `specops diff --as-change`, not as a file diff.
→ [Domain packs](docs/domain-packs.md)

**An agent surface that is a contract.** Twelve commands speak JSON with stable
diagnostic codes and a `fix` on each — every command of the daily loop, and a
test asserts it. `csda agents init` wires the loop into eight agent tools from
one definition.
→ [Agents](docs/agents.md) · [The agent contract](docs/specs/agent-contract.md)

**Unattended delivery.** `csda harness run` drives plan → agent → verify → done
for every pending requirement, each in its own git worktree. It never merges.
`csda ci init` generates the gate for GitHub, GitLab, Azure or Jenkins, and
`csda alm sync` keeps Jira or Azure Boards in step.
→ [Automation](docs/automation.md)

**It stays current.** `csda update` refreshes the generated agent files after an
upgrade, three-way merging your edits rather than clobbering them. `csda doctor`
reports what has drifted, with a fix per finding.
→ [Command reference](docs/commands.md)

## 🆚 How it compares

| Capability | **this** | [OpenSpec](https://github.com/Fission-AI/OpenSpec) | [spec-kit](https://github.com/github/spec-kit) | [Cursor rules](https://docs.cursor.com/context/rules-for-ai) | README only |
| --- | :-: | :-: | :-: | :-: | :-: |
| Change lifecycle | ✅ | ✅ | ❌ | ❌ | ❌ |
| Versioned domain packs | ✅ | ❌ | ⚠️ | ❌ | ❌ |
| Traceability matrix + CI gate | ✅ | ❌ | ⚠️ | ❌ | ❌ |
| Agent JSON contract | ✅ | ✅ | ❌ | ❌ | ❌ |
| Vendor-neutral | ✅ | ✅ | ✅ | ❌ | ✅ |
| Smaller surface to learn | ❌ | ✅ | ✅ | ✅ | ✅ |

OpenSpec is the closest tool and the honest comparison: if you want the change
loop without versioned packs or an enforced matrix, theirs is the better fit.
→ [Full matrix, trade-offs and migration paths](docs/comparisons.md)

## 📚 Documentation

- [Command reference](docs/commands.md) — every command, grouped by when you reach for it
- [How-to guides](docs/how-to.md) — by task and by adoption level
- [Tutorial](docs/tutorial.md) — long-form, on a real public pack
- [Supply chain](docs/supply-chain.md) — pack pinning, digests, signing, air-gapped installs, SBOM
- [Architecture](docs/specs/architecture.md) — three repos, three lifecycles
- [Bootstrap prompt](docs/bootstrap-prompt.md) — the one freeform-AI step
- [Case study](docs/case-studies/case-1.md) · [ADRs](docs/specs/adr/README.md) · [Docs site](https://rsaglobaltech.github.io/spec-driven-development-template/)

## 🧰 Companion tools

**MCP server** ([`mcp-spec-driven`](packages/mcp-spec-driven)) · **Language
server** ([`lsp-spec-driven`](packages/lsp-spec-driven)) · **VS Code extension**
([`vscode-spec-driven`](packages/vscode-spec-driven)) · **Maven and Gradle
plugins** for teams that do not want Node on the build agent.

## 🤝 Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first contributions:
new module templates, validator rules, additional domain packs.
[MAINTAINERS.md](MAINTAINERS.md) says who owns what;
[SECURITY.md](SECURITY.md) is how to report a vulnerability privately.

## 📄 License

MIT © RSA Global Tech
