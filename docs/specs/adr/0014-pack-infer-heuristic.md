# ADR-0014 — `pack infer`: heuristic `.feature` → pack.yaml inference

## Status

Accepted — 2026-05-14

## Context

Authoring a `pack.yaml` is model-first: you write `requirements` →
`use_cases` → `commands` → `events`, and only then the Gherkin
`scenarios`. The executable artifact — the `.feature` — comes last.

That ordering has a waterfall smell, and it is also the hardest way to
start: a blank `pack.yaml` is a blank page. The friction analysis in
`mejoras/visual-pack-authoring-todo.md` flagged "invert the flow" as the
highest-leverage ergonomic move — higher than any visual editor, because
it removes the blank-page problem rather than decorating it.

## Decision

Ship `pack infer --from <feature-file>`. It reads a Gherkin `.feature`
and prints a proposed `pack.yaml` fragment (`requirements`, `use_cases`,
`commands`, `events`, `scenarios`) to stdout.

The inference is **heuristic and deterministic**:

| Source in the `.feature`                 | Inferred                                                 |
| ---------------------------------------- | -------------------------------------------------------- |
| `@REQ-NNN` tag                           | a `requirement` reference (else a `REQ-XXX` placeholder) |
| `Feature:` name                          | the `use_case` name                                      |
| `When` step                              | a PascalCased `command`                                  |
| quoted PascalCase token in a `Then` step | an `event`                                               |
| each `Scenario:`                         | a `scenarios[]` entry                                    |

Everything the heuristic cannot infer is emitted as an explicit `TODO:`
string. `--format json` emits the same model as a structured object.

## Rationale

- **Heuristic, not LLM, for v1.** Deterministic output is testable,
  reviewable in a git diff, works offline, has no vendor dependency, and
  is instant. An LLM would produce richer guesses but at the cost of
  every one of those properties. The heuristic is intentionally crude —
  its job is to kill the blank page, not to be correct.
- **`TODO:` over silent guesses.** A field the heuristic cannot fill is
  marked, not invented. The author always knows exactly what still needs
  judgement. The fragment is a skeleton, never a final answer.
- **stdout, not in-place edit.** `pack infer` prints; it does not mutate
  `pack.yaml`. The author decides what to merge. This keeps the command
  pure, composable (`pack infer ... >> pack.yaml`, or pipe to a diff),
  and impossible to use destructively by accident.
- **Round-trips through the project's own YAML reader.** The emitted
  fragment is parseable by `parseYamlLite` — verified in tests — so it
  drops straight into a real `pack.yaml`.

## Alternatives considered

1. **LLM-assisted inference as the default.** Rejected for v1 — kills
   determinism, testability, offline use and vendor neutrality. Kept as a
   possible future `--llm` flag using the same shell-out pattern as
   `harness run`.
2. **Edit `pack.yaml` in place / merge automatically.** Rejected —
   merging into a structured file is a judgement call (which `UC` does
   this belong to? does the `REQ` already exist?). Printing to stdout
   keeps the author in control and the command non-destructive.
3. **One use case per scenario.** Rejected for v1 — over-produces. One
   use case per feature, one command per scenario, is a saner default
   skeleton; the author splits further if needed.
4. **Infer aggregates / bounded contexts too.** Rejected — nothing in a
   `.feature` reliably signals an aggregate boundary. Guessing it would
   produce confident noise. Left as an explicit `TODO:`.

## Consequences

### Positive

- Inverts the authoring flow: the executable scenario leads, the model
  follows. No blank-page start.
- Deterministic and fast — usable in a pre-commit hook or a scaffold
  script, not just interactively.
- Pairs with `pack lint --graph` and the VS Code extension: infer a
  skeleton, then see and link-check the graph it produced.

### Negative / trade-offs

- The heuristic is crude. Command names from `When` steps are often
  awkward (`MoreVehiclesEnterTheCommand`); the author must rename them.
  This is acceptable — a named thing to rename beats a blank line.
- It only reads one `.feature` at a time. Multi-file inference (a whole
  `features/` tree → one pack) is a follow-up.
- No aggregate/bounded-context inference — those stay `TODO:`.

## Follow-ups

- `--llm` mode: shell out to a configurable agent for richer inference,
  vendor-neutral, same pattern as `harness run`.
- Multi-file inference: `pack infer --from-dir features/`.
- An `init_pack` integration that offers to seed from an existing
  `.feature` directory.

## References

- `scripts/infer_pack.ts`
- `docs/specs/domain-pack-format.md` §5c
- `mejoras/visual-pack-authoring-todo.md` — Phase 3
- ADR-0013 — `harness run` (the shell-out pattern a future `--llm` mode would reuse)
