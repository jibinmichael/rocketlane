# tests/

vitest. Run with `pnpm test` (CI) or `pnpm test:watch`.

| Folder | What lives here |
|---|---|
| `unit/` | one module at a time: policies, resolver, reducer, parser, templates |
| `integration/` | executor against the in-memory system of record with fault injection |
| `scenarios/` | JSON scenarios run through the same `ScenarioRunner` the Test Lab uses |
| `regression/` | one file per discovered failure, replayed on every run |

Type-level tests use the `.test-d.ts` suffix (for example, proving a `ProposedPlan` cannot reach the executor).
