# unicode-and-quotes

One project (`PRJ-900`, name `Zoë & Søren GmbH - Größere Integration`, owner `José Núñez`). Task names: accents and an
en dash (`Café Réunion – Phase 1`), CJK (`日本語のタスク`), emoji (`🚀 Launch 🎉`), embedded double quotes
(`Say "Hello" to the team`), comma plus quotes (`Alpha, Beta "Gamma"`), a 300-character name, a name padded with
whitespace, and a task whose id contains a non-ASCII letter (`TSK-Ü08`). Milestone `Go-Live` lists all eight as
predecessors in one `Dependency` cell.

Proves: RFC 4180 escaping round-trips every name byte-for-byte, names are trimmed before indexing, and name-based
dependency resolution works on non-ASCII and very long names.

Expected ingestion: counts `{ projects: 1, phases: 2, tasks: 9, dependencies: 8, milestones: 1, subtasks: 0, actors: 3 }`,
no rejects, no findings, exactly one warning: `NON_STANDARD_ID` for `TSK-Ü08` (tasks.csv line 9).
