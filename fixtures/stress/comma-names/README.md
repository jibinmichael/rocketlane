# comma-names

One project (`PRJ-500`). Task names containing `, ` are used as predecessors:

| Task | Dependency cell | Expected predecessors |
|---|---|---|
| `Single Comma Dependent` (5004) | `Design, Build and Test` | 5001 |
| `Multi Dependent` (5005) | `Design, Build and Test, Review, Approve, Plan` | 5001, 5002, 5003 |
| `Unresolved Dependent` (5006) | `Plan, Nonexistent Task` | 5003 + `DEPENDENCY_UNRESOLVED` |
| `Ambiguous Dependent` (5009) | `Status Report` (two tasks share this name) | none + `DEPENDENCY_AMBIGUOUS` |
| `Go-Live` (5010, milestone) | `Multi Dependent, Single Comma Dependent` | 5005, 5004 |
| `Longest Match Dependent` (5013) | `Review, Approve` (while `Review` and `Approve` also exist) | 5002 only |

Proves: longest-match segmentation prefers the fewest known names, never splits a known name, fails closed on unknown
or ambiguous fragments, and reports the duplicate name itself.

Expected ingestion: counts `{ projects: 1, phases: 2, tasks: 13, dependencies: 8, milestones: 1, subtasks: 0, actors: 2 }`,
no rejects, no warnings; findings `DUPLICATE_NAME` (`TSK-5007, TSK-5008`), `DEPENDENCY_UNRESOLVED` (`TSK-5006`),
`DEPENDENCY_AMBIGUOUS` (`TSK-5009, TSK-5007, TSK-5008`).
