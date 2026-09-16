# core/

The product. Pure TypeScript with no React, Next.js or motion imports; the ESLint boundary in `eslint.config.mjs` enforces it.

Modules and ownership are defined in [docs/agent-context/02-architecture-contract.md](../docs/agent-context/02-architecture-contract.md). In short:

| Module | Owns |
|---|---|
| `domain/` | entities, status vocabulary, the indexed `WorkspaceGraph` |
| `governance/` | the four supplied policies, evaluation, permission boundary |
| `resolver/` | target resolution, dependency closure, blockers, shortest useful path |
| `mission/` | the durable mission aggregate and its reducer |
| `agent/` | intent interpreters (model + deterministic), grounding, planner, conversation renderer |
| `execution/` | flight-plan validation, executor, idempotency, verification, revalidation, batch |
| `system/` | the `SystemOfRecord` port, in-memory implementation, virtual clock, persistence |
| `ingestion/` | CSV parsing, normalization, reference validation, ingestion report |
| `telemetry/` | events, activity projection, audit |
| `routine/` | scheduled missions |
| `evaluation/` | scenarios, runner, assertions, scoring, regression records |

Rules: cross-module imports use `@/core/<module>/...`; no barrel files; `core/agent` never imports `execution` or `system`; only `core/execution` writes to the system of record.
