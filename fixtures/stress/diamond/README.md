# diamond

One project (`PRJ-300`). `Launch` (milestone) → `Left Branch` and `Right Branch` → both → `Shared Base` → `Root` (0h).
A second milestone `Report` also depends on `Shared Base`, so `Shared Base` is reachable by three paths.

Proves: `resolveClosure` visits each task exactly once (one `COMPLETED` per task, 8 transitions in total),
`Shared Base:COMPLETED` precedes both branches and `Report`, and blockers dedupe to a single `log_time` on `Root`.

Expected ingestion: counts `{ projects: 1, phases: 3, tasks: 6, dependencies: 6, milestones: 2, subtasks: 0, actors: 2 }`,
no rejects, no warnings, no findings.
