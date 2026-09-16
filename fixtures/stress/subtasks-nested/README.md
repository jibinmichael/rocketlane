# subtasks-nested

One project (`PRJ-600`). Milestone `Go-Live` (`TSK-6001`) has five direct subtasks: `Prep A` (To do), `Prep NA` (NA),
`Prep Blocked` (Blocked), `Prep Nested` (To do) and `Prep Done` (Completed). `Prep Nested` has its own subtask
`Grandchild` (To do, 0h).

Proves: subtasks with a missing/blocked/NA state ingest cleanly; under the default interpretation NA is not open, so only
`Prep A`, `Prep Blocked` and `Prep Nested` are required before `Go-Live`; `Grandchild` is not required (policy 2 looks at
direct subtasks of a milestone only, A-04) and is reported as open-but-not-required; the Blocked subtask yields an
`unblock_task` blocker the system cannot perform. With `naCountsAsOpen: true` the NA subtask becomes required.

Expected ingestion: counts `{ projects: 1, phases: 1, tasks: 7, dependencies: 0, milestones: 1, subtasks: 6, actors: 1 }`,
no rejects, no warnings, no findings.
