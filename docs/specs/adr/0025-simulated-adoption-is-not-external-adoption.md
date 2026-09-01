# ADR-0025 — Simulated adoption is a gate of its own, not `GATE-G3`

## Status

Accepted — 2026-09-01

## Context

`GATE-G3` is the last open gate on the road to 1.0, and the only one no test can
close: *an outside team adopts L1–L2 and reports back, including what they could
not work out from the docs.* Nobody outside this repository has used the tool.

There is nobody to ask yet. The proposal on the table is to have agents simulate
a company adopting it — three brownfield repositories, in unfamiliar domains,
driven cold.

The question this ADR settles is not whether that is worth doing. It is worth
doing, and this ADR authorises it. The question is **what it is allowed to
close.**

## What simulated adoption genuinely produces

Every genuine defect this project has found came from running the tool against
real work rather than from reading the code, and the four the earlier pilots
produced are exactly the kind an agent meets on its first afternoon:

- **H14** — `onboard` reported `Platform 1` where there are 38 source files,
  because `countFiles` prunes `src`, `main` and `java`. The list sorts by that
  number, so the ranking came out near-inverted.
- **H15** — `validate` printed `✅ Validation passed` over an adoption abandoned
  months earlier: 297 real test cases, a matrix describing none of them.
- **H16** — `onboard` escaped upward out of an un-adopted subproject and
  analysed a *different* codebase in silence, while `adopt` in the same
  directory got it right. Two commands disagreeing about which project you are
  standing in.
- **H17** — zero capabilities proposed on a 299-file hexagonal project, because
  `descendThroughWrappers` descends only through a single child and `build/` was
  the second one.

None of those needed a human's judgement. They needed somebody without the
author's map to type the first command and read what came back. An agent given
only the published documentation and an unfamiliar repository does that
faithfully, cheaply, and three times over.

There is already a measured list waiting for one: the entry documentation calls
the tool by three different names across `case-1.md`, `getting-started.md` and
`mejoras/`; the greenfield path opens with `cp examples/project.config.example`,
which assumes a checkout that somebody following the `npx` instructions does not
have; and neither entry document mentions the harness at all.

## What it does not produce, and why that is decisive

`GATE-G3` does not buy *"the tool works"*. It buys two things an agent cannot
supply.

**Independence from the author's assumptions.** An agent this repository's
maintainer orchestrates inherits those assumptions through the prompt, the
choice of repositories and the definition of success. The isolation described in
the plan — published package only, published docs only, no checkout, no
conversation history — narrows that leak. It does not close it, because somebody
still wrote the prompt.

**The signal that somebody with something at stake keeps using it.** An agent
has no fatigue, no team politics, no deadline it actually feels, and will never
abandon the tool out of frustration. Abandonment is the loudest thing a real
adopter ever tells you, and a simulation is structurally incapable of it.

## Decision

**Simulated adoption is recorded as `GATE-G6`, and `GATE-G3` stays open.**

`GATE-G6` is satisfied when three brownfield repositories in distinct domains
have been taken to L1–L2 by isolated agents, each producing a measured
assessment in the shape `mejoras/*-pilot-assessment.md` already uses, with every
defect reproduced from this repository before it is filed.

`GATE-G3` is satisfied only by a team outside this repository. It continues to
govern 1.0.

A case study written from a simulated pilot carries a third disclaimer, beside
the two `docs-site.test.ts` already enforces: not *"illustration, not a
customer"* (which is `case-1.md`, and is invented), not *"verified customer"*,
but **"agent-driven adoption, not a customer"** — measured for real, by nobody
who chose to be there.

## Consequences

- **1.0 does not move.** The simulation can close `C8-01` through `C8-04`, and
  cannot close `#100`. Anyone reading `GATE-G6` as evidence of external adoption
  is reading it wrong, and this ADR is the answer to them.
- **The defects it finds are as real as any other.** A crash is a crash whoever
  typed the command. They are filed as `H<n>`, reproduced from this repository
  with a failing test, and fixed on their own merits.
- **One step stays human.** `harness report` leaves `realFailureRate` at `null`
  until somebody marks a failure as the gate's fault rather than the agent's —
  because *"guessing 100% would be the most flattering possible lie about our
  own gate"*. A simulated pilot that never adjudicates produces an incomplete
  ledger by this project's own definition, so adjudication is a maintainer's
  task and is not delegated.
- **The cost of being wrong here is the project's signature failure.** Closing
  G3 on simulated evidence would be a gate approving what it did not check —
  the exact defect this product exists to prevent — applied to its own release
  gate. That is why this is an ADR and not a line in a plan.

## Alternatives considered

**Re-scope `GATE-G3` so the simulation satisfies it.** Rejected. It would be
honest only if the ADR said plainly that the bar had been lowered and why, and
having written that sentence, there is no reason to lower it: the gate costs
nothing to leave open, and 1.0 is not otherwise ready.

**Do nothing until a real team appears.** Rejected. It concedes the defects the
simulation would find, for as long as nobody shows up. H14 through H17 were all
found this way, and each was fixed the same day it was measured.

**Run the simulation without isolating the agent.** Rejected as worthless: an
agent with the repository checked out reads the answer instead of discovering
it, and the whole value is the cold read.
