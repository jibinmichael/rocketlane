# malformed

`tasks.csv` starts with a UTF-8 BOM and uses CRLF line endings; `projects.csv` is plain LF. Rows are deliberately broken.

`projects.csv` (line → outcome): 2 `PRJ-800` ok · 3 `PRJ-801` ok, `DueDate=someday` → `MALFORMED_DATE` ·
4 empty `ProjectId` → `MISSING_ID` · 5 duplicate `PRJ-800` → `DUPLICATE_ID` · 6 only 38 fields → `MALFORMED_ROW` ·
7 `prj_lower` ok → `NON_STANDARD_ID`.

`tasks.csv` (line → outcome): 2 `TSK-8001` ok · 3 25 fields → `MALFORMED_ROW` · 4 27 fields → `MALFORMED_ROW` ·
5 status `Waiting` → `UNKNOWN_STATUS` · 6 hours `-2.00` → `NEGATIVE_HOURS` · 7 project `PRJ-999` → `UNKNOWN_PROJECT` ·
8 duplicate `TSK-8001` → `DUPLICATE_ID` · 9 empty `ProjectId` → `MISSING_ID` · 10 empty `TaskId` → `MISSING_ID` ·
11–12 quoted name with an embedded newline → accepted (later line numbers shift by one) ·
13 `StartDate=31/12/2026`, `DueDate=not-a-date` → two `MALFORMED_DATE` · 14 `task-x10` → `NON_STANDARD_ID` ·
15 `ParentTaskId=TSK-9999` → `UNRESOLVED_PARENT` · 16 `HoursTracked=abc` → accepted with 0 hours ·
17 status `  completed ` → accepted as `COMPLETED` · 18 `CompletedAt=2026-13-45` → accepted (shape-only date check) ·
19 stray `"` inside an unquoted last field → `MALFORMED_ROW` "quote inside unquoted field" (line 19) and
"unterminated quoted field" (line 20).

Expected ingestion: counts `{ projects: 3, phases: 1, tasks: 9, dependencies: 0, milestones: 0, subtasks: 0, actors: 2 }`;
13 rejects and 6 warnings as listed above; one finding `PROJECT_WITHOUT_TASKS` (`PRJ-801`, `prj_lower`).

Known gaps this fixture documents (see the test report): the stray-quote row is reported as malformed **and** still
accepted as `TSK-8015` (hence tasks = 9); non-numeric hours are silently 0 with no warning; `2026-13-45` passes the
date check.
