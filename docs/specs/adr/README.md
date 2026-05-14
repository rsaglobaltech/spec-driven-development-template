# Architecture Decision Records

This directory contains the ADRs (Architecture Decision Records) for
`create-spec-driven-app`. See [CONTRIBUTING.md](../../../CONTRIBUTING.md#3-adr-policy)
for the policy on when and how to write an ADR.

## Index

| #                                              | Title                                                   | Status                 | Date       |
| ---------------------------------------------- | ------------------------------------------------------- | ---------------------- | ---------- |
| [0001](0001-node-test-over-jest.md)            | `node:test` over Jest                                   | Accepted               | 2026-05-12 |
| [0002](0002-bash-for-init-script.md)           | Bash for init script                                    | Superseded by ADR-0008 | 2026-05-12 |
| [0003](0003-javascript-for-expand.md)          | JavaScript for expand engine                            | Accepted               | 2026-05-12 |
| [0004](0004-yaml-for-pack-format.md)           | YAML for pack format                                    | Accepted               | 2026-05-12 |
| [0005](0005-multi-env-dotenv.md)               | Multi-environment `.env.*` strategy                     | Accepted               | 2026-05-12 |
| [0006](0006-node-engine-for-init.md)           | Node.js engine for `init`                               | Accepted               | 2026-05-12 |
| [0007](0007-flip-default-engine-to-node.md)    | Flip default engine to Node.js                          | Accepted               | 2026-05-12 |
| [0008](0008-remove-shell-scripts.md)           | Remove Bash engine and `validate_specs.sh`              | Accepted               | 2026-05-12 |
| [0009](0009-specops-remote-packs.md)           | SpecOps remote packs + `.specops.lock`                  | Accepted               | 2026-05-12 |
| [0010](0010-specops-sync-diff.md)              | SpecOps `sync` + `diff`                                 | Accepted               | 2026-05-12 |
| [0011](0011-contracts-pack-tdd-enforcement.md) | Contracts pack + `--strict-tdd` gate                    | Accepted               | 2026-05-13 |
| [0012](0012-plan-done-implementation-loop.md)  | `plan` + `done` implementation loop                     | Accepted               | 2026-05-13 |
| [0013](0013-harness-run-loop.md)               | `harness run` — spec-driven delivery loop for AI agents | Accepted               | 2026-05-14 |
| [0014](0014-pack-infer-heuristic.md)           | `pack infer` — heuristic .feature → pack.yaml inference | Accepted               | 2026-05-14 |

## Template

Copy `docs/specs/adr/0001-node-test-over-jest.md` as a starting point, or use
the template in [CONTRIBUTING.md](../../../CONTRIBUTING.md#3-adr-policy).
