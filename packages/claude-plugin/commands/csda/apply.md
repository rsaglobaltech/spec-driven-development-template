---
description: Implement the change: tests first, then code.
---

# /csda:apply

Implement the change: tests first, then code.

**Use when:** The change is validated and its proposal is agreed.

## Run

```bash
csda change instructions apply --json
csda plan --json
```

## Guidance

- One requirement at a time. `csda plan` is the queue.
- Write the test first. Set the row's status to `In Dev` only once it exists, or `validate --strict-tdd` fails with `[TDD-1]`.
- Never edit `docs/specs/traceability.md` by hand — `csda req link` and `csda done` write it.

> The authoritative rules come from `csda change instructions <artifact> --json`.
> If this file and the engine disagree, the engine is right — say so and continue.
