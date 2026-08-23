---
description: Merge the change into the spec tree.
---

# /csda:archive

Merge the change into the spec tree.

**Use when:** The work is done and every task is checked.

## Run

```bash
csda change instructions archive --json
csda change archive <change-id> --dry-run
csda change archive <change-id> --json
```

## Guidance

- Preview with `--dry-run` first: it lists the specs and matrix rows that will move.
- Archiving inserts the traceability rows and materialises the feature files. It is not a file move.
- After archiving, `csda plan` lists the requirement as pending work.

> The authoritative rules come from `csda change instructions <artifact> --json`.
> If this file and the engine disagree, the engine is right — say so and continue.
