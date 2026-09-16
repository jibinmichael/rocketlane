# cycle

One project (`PRJ-400`). `Alpha` → `Beta` → `Gamma` → `Alpha` form a predecessor cycle. Milestone `Ship` depends on
`Alpha`, so the project's completion path runs into the cycle. `Independent` is open and unrelated.

Proves: cycle detection flags exactly the three cycle members (not `Ship`); every member carries the `CYCLE` flag;
`resolveClosure` and `traceCurrentBlockers` terminate and surface `fix_data` blockers for the cycle members.

Expected ingestion: counts `{ projects: 1, phases: 3, tasks: 6, dependencies: 4, milestones: 1, subtasks: 0, actors: 1 }`,
no rejects, no warnings, exactly one finding: `CYCLE` with ids `TSK-4001, TSK-4002, TSK-4003`.

Known gap: `resolveClosure` still lists `COMPLETED` transitions for the cycle members even though they are
non-completable; planners must consult `blockers` first.
