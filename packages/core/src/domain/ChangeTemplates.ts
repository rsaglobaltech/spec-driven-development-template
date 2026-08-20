/**
 * The files `csda change new` scaffolds.
 *
 * Prose follows the project's language; the grammar never does. `SHALL`,
 * `GIVEN`/`WHEN`/`THEN`, `## ADDED Requirements` and `REQ-NNN` are what the
 * validator parses, so they stay in English in every locale — see
 * `domain/Language`.
 *
 * The phrase table arrives already resolved, which is what keeps this module
 * pure: working out which language a project speaks reads its config.
 */

import { Phrases } from "./Language";

export function templateProposal(changeId) {
  return `# Proposal: ${changeId}

## Intent

<!-- Why this change exists. The problem, not the solution. -->

## Scope

In scope:

-

Out of scope:

-

## Approach

<!-- One paragraph. The technical detail belongs in design.md. -->
`;
}

export function templateTasks() {
  return `# Tasks

## 1. Specification

- [ ] 1.1 Write the delta spec for each affected capability
- [ ] 1.2 Run \`csda change validate\`

## 2. Implementation

- [ ] 2.1
`;
}

export function templateDesign(changeId) {
  return `# Design: ${changeId}

## Technical approach

<!-- How. Only what a reviewer needs to judge the approach. -->

## Decisions

### Decision:

<!-- What was chosen, and what was rejected, and why. -->

## Affected files

-
`;
}

export function templateDelta(capability, reqId, t: Phrases) {
  return `# Delta — ${capability}

## ADDED Requirements

### Requirement: ${reqId} — ${t.shortName}

${t.systemShall(t.observableBehaviour)}

#### Scenario: ${t.scenarioName}

- GIVEN ${t.precondition}
- WHEN ${t.action}
- THEN ${t.outcome}

<!-- csda:trace uc=UC-000 feature=features/<area>/<name>.feature -->
`;
}

/** The scaffolded file set, keyed by the artefact `change new` writes. */
export const CHANGE_TEMPLATES = {
  proposal: (changeId: string) => templateProposal(changeId),
  tasks: () => templateTasks(),
  design: (changeId: string) => templateDesign(changeId),
  specs: (_changeId: string, t: Phrases) => templateDelta("<capability>", "REQ-NNN", t),
};
