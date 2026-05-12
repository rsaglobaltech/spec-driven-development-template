# Comparison: `create-spec-driven-app` vs. alternatives

This document positions `create-spec-driven-app` honestly against four
adjacent tools that teams commonly evaluate when adopting Spec-Driven
Development or AI-assisted scaffolding: GitHub `spec-kit`, Cursor rules,
Aider conventions, and plain `README.md` files.

> **Bias disclosure.** This is written by the maintainers of
> `create-spec-driven-app`. Where we lose, we say so. We have asked the
> maintainers of each compared tool for review; their feedback (if received)
> is referenced in footnotes.

---

## 1. At-a-glance matrix

| Capability | `create-spec-driven-app` | GitHub `spec-kit` | Cursor `.cursorrules` | Aider `CONVENTIONS.md` | Plain `README.md` |
|---|:-:|:-:|:-:|:-:|:-:|
| **Generates an initial repo structure** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Ships with a domain pack format** | ✅ (YAML+schema) | ⚠️ ad-hoc | ❌ | ❌ | ❌ |
| **DDD-lite artefacts (aggregates, contexts, events)** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Gherkin scenario stubs** | ✅ | ⚠️ via templates | ❌ | ❌ | ❌ |
| **Traceability matrix** | ✅ rich + legacy | ⚠️ basic | ❌ | ❌ | ❌ |
| **`validate` CI gate** | ✅ shipped GHA | ⚠️ external | ❌ | ❌ | ❌ |
| **JSON Schema for the DSL** | ✅ draft 2020-12 | ❌ | ❌ | ❌ | n/a |
| **VS Code extension** | ✅ MVP | ❌ | n/a (own editor) | ❌ | ❌ |
| **MCP server** | 🚧 planned | ❌ | ❌ | ❌ | ❌ |
| **Cross-platform CLI (Windows/Linux/macOS)** | ✅ Node | ⚠️ Bash-heavy | ✅ | ✅ | ✅ |
| **Locked-in to one AI vendor** | ❌ | ❌ | ✅ Cursor | ❌ | ❌ |
| **Discoverable pack registry** | 🚧 planned | ❌ | ❌ | ❌ | n/a |
| **Zero-install (just docs)** | ❌ | ❌ | ❌ | ❌ | ✅ |

✅ supported · ⚠️ partial / via workaround · ❌ not supported · 🚧 in progress

---

## 2. When each tool wins

### `create-spec-driven-app` wins when…

- Your team needs **explicit traceability** between requirements, scenarios,
  and code (regulated industries, audited deliveries).
- You want a **DDD-lite domain model** in machine-readable form so AI agents
  and humans share the same vocabulary.
- You operate **multiple environments** (dev/feature/prod) and want generated
  Docker / devcontainer / `.env` scaffolding aligned with the domain.
- You want a **portable, vendor-neutral** workflow that works with Claude,
  Cursor, Aider, Copilot, or no agent at all.

### GitHub `spec-kit` wins when…

- You're already deep in the GitHub ecosystem and want first-party tooling
  with deeper repo integration (issues, PRs, projects).
- You only need lightweight templates without DDD vocabulary.
- You prefer Microsoft/GitHub to govern the spec format directly.

> `spec-kit` is fast-moving; some gaps above will close. Recheck quarterly.

### Cursor `.cursorrules` wins when…

- Cursor is your **only** AI coding tool and your team has standardised on it.
- You want rules that bias the model's behaviour without changing the repo
  layout or tests.

> Locks you into Cursor; not portable to other agents or to plain
> command-line workflows.

### Aider `CONVENTIONS.md` wins when…

- You work primarily from the terminal with Aider and want a single,
  human-readable file the agent reads on every prompt.
- Your team is small (1–3 engineers) and the overhead of formal traceability
  isn't justified.

> No structural enforcement — conventions drift over time without CI gates.

### Plain `README.md` wins when…

- The project is a **prototype or research spike** that may not survive the
  quarter.
- You're solo and the cost of any tooling exceeds the cost of forgetting.

> Fine for week-1. Doesn't scale past week-12.

---

## 3. When `create-spec-driven-app` loses

These are the honest trade-offs. We'd rather you choose a different tool than
adopt ours and regret it.

| Scenario | What hurts | Recommendation |
|---|---|---|
| **Solo developer, 1-week throwaway** | Setup overhead exceeds the project lifespan | Use a `README.md` + Gherkin in a single file |
| **Cursor-only team, no portability concern** | Our CLI duplicates what `.cursorrules` already does for them | Stick with Cursor rules |
| **Already on GitHub `spec-kit` for 6+ months** | Switching cost > marginal feature gap | Wait for `spec-kit` to add DDD/JSON-Schema; we'll re-publish this page |
| **Front-end-only project with no domain logic** | DDD vocabulary feels heavy | Use `--type frontend` (lighter) but consider plain templates |
| **Highly conservative shop, no Node.js allowed** | We require Node ≥ 18 at runtime | Pre-render templates from CI; ship the output without the CLI |
| **You hate YAML** | Pack format is YAML | We won't ship JSON/TOML packs in 0.x; revisit in 1.0 |

---

## 4. Migration paths

### From `spec-kit` → `create-spec-driven-app`

1. Run `npx create-spec-driven-app init --config your.config --out ./next`.
2. Copy your existing `spec-kit` artefacts into the generated `docs/specs/`.
3. Run `validate` — it will tell you what's missing in the traceability matrix.
4. Keep `spec-kit` running for 1 release cycle as a parallel checker.

### From `.cursorrules` → `create-spec-driven-app`

1. Generate a project with `create-spec-driven-app init`.
2. Move your Cursor rules into `AGENTS.md` and `AI_RULES.md` (we generate both).
3. Reference the generated traceability matrix from your rules so Cursor
   reads them on every prompt.

### From plain `README.md` → `create-spec-driven-app`

1. Generate a project as above.
2. Copy the existing README into `docs/specs/glossary.md`.
3. Run `pack init` to scaffold a domain pack from your existing module list.

---

## 5. Questions worth asking before you choose

1. **Will my team use this in 12 months?** — Tools that require discipline die.
   Tools that have a CI gate survive.
2. **Does my AI agent of choice exist in 12 months?** — Vendor lock-in is
   expensive when the vendor pivots or shuts down.
3. **Do I care about audit trails?** — If yes, traceability matrix and
   schema-validated specs are non-negotiable.
4. **Do I need cross-team consistency?** — If yes, a versioned pack format
   beats prose conventions.
5. **What's the cost of being wrong?** — All four alternatives are reversible
   in <1 day; choose the one that lets you experiment cheapest.

---

## 6. References

- [Case Study 1: Smart Parking brownfield adoption](case-studies/case-1.md)
- [ROI Calculator](roi.html)
- [GitHub spec-kit](https://github.com/github/spec-kit) (last reviewed 2026-05)
- [Cursor `.cursorrules` documentation](https://docs.cursor.com/context/rules-for-ai)
- [Aider CONVENTIONS.md guide](https://aider.chat/docs/usage/conventions.html)

This page is updated quarterly. Pull requests with corrections are welcome —
see [CONTRIBUTING.md](../CONTRIBUTING.md).
