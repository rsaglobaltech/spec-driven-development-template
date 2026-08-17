# Contract traceability — {{PROJECT_NAME}}

Which consumer relies on which part of the provider contract. A row here is
what turns "we changed the API" into "we know who breaks".

| Contract | Element | Consumer | Verified by | Status |
| --- | --- | --- | --- | --- |
| `contracts/openapi/provider-v1.yaml` | `GET /health` | TBD | TBD | Draft |
| `contracts/asyncapi/provider-events-v1.yaml` | `healthReported` | TBD | TBD | Draft |

Add a row per consumer-visible element. `Verified by` names the consumer-driven
test that proves the expectation, so a contract nobody verifies is visible as
an empty cell rather than as silence.
