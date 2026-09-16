# wide-fanin

One project (`PRJ-200`). Milestone `Release` (`TSK-2000`, 1h) lists all 40 `Feed NN` tasks in one `Dependency` cell.
Feeds 01–20 are `Completed`; 01, 05, 09, 13, 17 completed with 0 hours. Feeds 21–40 are open (`To do` / `In progress`);
22, 26, 30, 34, 38 have 0 hours.

Proves: the longest-match name resolver handles a 40-part dependency string; the closure lists 20 open feeds once each
(plus 5 `TIME_LOGGED` steps) before `Release`; `traceCurrentBlockers` yields 20 blockers (15 `complete_task`,
5 `log_time`), all at depth 3.

Expected ingestion: counts `{ projects: 1, phases: 2, tasks: 41, dependencies: 40, milestones: 1, subtasks: 0, actors: 7 }`,
no rejects, no warnings, one `HISTORICAL_POLICY_INCONSISTENCY` finding with 5 ids (`TSK-2001, 2005, 2009, 2013, 2017`).
