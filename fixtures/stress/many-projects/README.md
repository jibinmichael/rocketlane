# many-projects

25 projects (`PRJ-701` … `PRJ-725`) owned round-robin by four owners (Priya, Daniel, Mei, Sofia) with rotating team
members and regions, so batch permission outcomes vary by owner.

- `PRJ-701`–`715`: `In progress`, zero tasks → `PROJECT_WITHOUT_TASKS`.
- `PRJ-716`–`720`: `Completed`, each with `Kickoff` and a completed milestone `Go-Live`.
- `PRJ-721`: milestone ready to complete (predecessor `Build` complete, hours logged).
- `PRJ-722`: milestone blocked by `Build` (In progress, 0 hours) → `log_time`.
- `PRJ-723`: milestone blocked by `Build` (Blocked) → `unblock_task`.
- `PRJ-724`: milestone with an NA subtask (ignored by default) and an open subtask `Docs`.
- `PRJ-725`: `In progress` but every milestone complete → only the project transition remains.

Expected ingestion: counts `{ projects: 25, phases: 10, tasks: 22, dependencies: 3, milestones: 10, subtasks: 2, actors: 10 }`,
no rejects, no warnings, exactly one finding: `PROJECT_WITHOUT_TASKS` with 15 ids. 5 projects have status `COMPLETED`,
20 `IN_PROGRESS`; 4 distinct owner actors.
