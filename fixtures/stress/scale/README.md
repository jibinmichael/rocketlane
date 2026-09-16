# scale

`generate.mjs` is a seeded, dependency-free generator for the two-file export shape. Same arguments produce
byte-identical output. Predecessors reference only earlier tasks in the same project (acyclic, depth capped by `--depth`,
fan-in capped by `--width`), names are unique per project and never contain `, `, parents exist in the same project.

    node fixtures/stress/scale/generate.mjs --seed 7 --projects 200 --tasks 4000 --depth 12 --width 6 --out fixtures/stress/scale-sample

Options: `--seed`, `--projects`, `--tasks`, `--depth`, `--width`, `--empty-ratio` (default 0.1), `--out`.
The committed sample lives in `../scale-sample/`; larger runs (e.g. `--tasks 20000`) are not committed.
