---
description: Understand the project before proposing anything.
---

# /csda:explore

Understand the project before proposing anything.

**Use when:** Starting work on an unfamiliar spec-driven repository.

## Run

```bash
csda status --json
csda plan --json
```

## Guidance

- Read `spec.md` and `AI_RULES.md` first — `AI_RULES.md` is binding, not advisory.
- `csda status` gives totals, orphan features and locked pack versions in one document.
- Do not propose a change until you can name which capability it belongs to.

> The authoritative rules come from `csda change instructions <artifact> --json`.
> If this file and the engine disagree, the engine is right — say so and continue.
