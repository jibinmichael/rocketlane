# scale-sample

Output of `node fixtures/stress/scale/generate.mjs --seed 7 --projects 200 --tasks 4000 --depth 12 --width 6`.
The test regenerates it into a temp directory and asserts the bytes match, so the sample cannot drift from the script.

Proves: ingestion of 200 projects / 4000 tasks / 5579 predecessor edges stays well under 300 ms, with a longest chain of
exactly 12 and a widest fan-in of exactly 6, and no cycles or unresolved names.

Expected ingestion: counts `{ projects: 200, phases: 701, tasks: 4000, dependencies: 5579, milestones: 321, subtasks: 90, actors: 52 }`,
no rejects, no warnings; findings `HISTORICAL_POLICY_INCONSISTENCY` (393 ids) and `PROJECT_WITHOUT_TASKS` (20 ids).
Project statuses: 162 `IN_PROGRESS`, 25 `COMPLETED`, 13 `OTHER` (raw `On hold`).
