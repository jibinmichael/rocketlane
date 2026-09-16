# deep-chain

One project (`PRJ-100`). Milestone `Go-Live` (`TSK-1000`, 2h) depends on `Step 01`, which depends on `Step 02`, … down to
`Step 15` (`TSK-1015`) which has **0 hours** and no predecessor. `Kickoff` is a completed task with hours so no historical
finding is raised.

Proves: the resolver follows a 15-deep chain from the project to the single actionable leaf; `resolveClosure` emits every
predecessor's `COMPLETED` before its dependent's; `nextActionable(traceCurrentBlockers(project))` is `log_time` on
`TSK-1015` with a dependency path of length 17 (project + milestone + 15 steps).

Expected ingestion: counts `{ projects: 1, phases: 4, tasks: 17, dependencies: 15, milestones: 1, subtasks: 0, actors: 3 }`,
no rejects, no warnings, no findings.
