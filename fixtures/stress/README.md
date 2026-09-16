# fixtures/stress

Stress datasets for the ingestion normalizer and the dependency resolver. Every folder is in the exact two-file
shape of `fixtures/rocketlane-export` (39-column `projects.csv`, 26-column `tasks.csv`) and is exercised by
`tests/fixtures-stress/ingest.test.ts`. Nothing in `core/` knows any of these names.

| Fixture | Proves |
|---|---|
| `deep-chain/` | a 15-deep predecessor chain under one milestone is traversed to the leaf with no time logged |
| `wide-fanin/` | one milestone with 40 name-based predecessors (half complete, some with 0 hours) |
| `diamond/` | shared predecessors reached via several paths are visited once |
| `cycle/` | A→B→C→A is a `CYCLE` finding; a dependent of the cycle is blocked by data |
| `comma-names/` | task names containing `, ` as single/multi predecessors, plus unresolved, ambiguous and duplicate names |
| `subtasks-nested/` | milestone subtasks in NA / Blocked / nested (grand-child) states |
| `many-projects/` | 25 projects across 4 owners: 15 empty, 5 completed, 5 mixed |
| `malformed/` | BOM, CRLF, embedded newline, and every row-level reject/warn code |
| `unicode-and-quotes/` | accents, CJK, emoji, embedded quotes, 300-char names, non-ASCII ids |
| `scale/generate.mjs` | seeded generator; `scale-sample/` is its committed 200 × 4000 output |
