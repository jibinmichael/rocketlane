# rocketlane-export

The masked Rocketlane export supplied with the brief, byte for byte. Two files: `projects.csv` (31 projects) and `tasks.csv` (325 tasks across 3 projects). Phases, predecessors (by task name), subtasks (`ParentTaskId`), milestones (`Is this a Billing Milestone?`) and hours are embedded in the tasks file.

**What it proves:** the engine runs on real data it was not written against, and the ingestion report surfaces real anomalies instead of hiding them: completed tasks with no time logged, a duplicate task name, task names containing commas, and projects with no tasks on record.

These files are never modified by the application. The system of record works on an in-memory copy.
