# Test strategy — {{PROJECT_NAME}}

## Consumer-driven contract tests

The provider publishes a contract; each consumer publishes the subset it
actually uses. The provider's build verifies every published expectation, so a
change that breaks a consumer fails on the provider's side — before release,
not after.

| Layer | What it proves | Runs where |
| --- | --- | --- |
| Schema validation | The contract is well-formed | Provider CI |
| Consumer expectations | The provider still satisfies each consumer | Provider CI |
| Provider verification | The implementation matches its own contract | Provider CI |

## What this does not cover

Performance, authorisation policy and data residency are not contract
concerns. Do not encode them here — a contract that tries to say everything
stops being checkable.
