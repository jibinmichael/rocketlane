# QA plan and remaining build order

**Goal of this phase:** nobody can break the agent with a complex dataset, a hostile sentence, an unlucky race or a weird click, and every engineer who reads the code says it is clean. Nothing in this phase changes the operating model, the four policies, the product surface or the copy contract. If a fix would, it is written up as a proposal instead.

## Four QA lanes, run in parallel, strict file boundaries

| Lane | Agent role | May write to | Deliverable |
|---|---|---|---|
| A · Code quality | Staff engineer, Linear bar | nothing (read-only) | ranked findings with file:line and fix: correctness, type escapes (`as never`, `!`), duplication between `lib/runtime.ts` and `core/evaluation/runner.ts`, dead code, naming, perf, a11y |
| B · Adversarial engine | Break-it QA | `tests/qa/` only | failing tests kept failing with `// FINDING:` comments: cycles, self-deps, cross-project deps, NA/BLOCKED under both switches, double approve, bad hours, cancel/scope on terminal, concurrent missions, faults stacked, batch edge cases, renderer no-throw on every state, banned words, 5k-task ingestion timing, 40+ phrasings, command-like hostile utterances |
| C · Stress datasets | Data engineer | `fixtures/stress/`, `tests/fixtures-stress/` only | ten datasets in the exact export shape with READMEs stating expected findings; seeded generator; ingestion + closure tests |
| D · UX and copy | Staff designer | nothing (read-only) | deviations from `04-ux-and-copy-contract.md`, undesigned edge states, visual contract, keyboard path, demo-script mismatches |

Boundaries are the point: lanes cannot collide, cannot "fix" core while another lane is measuring it, and every proposed change arrives as evidence (a failing test, a file:line) rather than an opinion.

## Triage protocol (after the lanes report)

1. Merge findings into one list; dedupe; rank blocker → major → minor → nit.
2. For every finding that changes behaviour, a test must exist first (lane B or C already wrote most of them). Fix in core, run the whole suite, keep the test.
3. Fixes are grouped into commits by module, conventional-commit messages, one gate each (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`).
4. Anything that touches the copy contract, a policy interpretation, or the product surface is **not** fixed silently; it goes to `03-decisions-locked.md` as a proposal for the human.
5. The ledger's session log records what was fixed and what was deliberately left.
6. Re-run the headless screenshots of the hero and course-correction threads after UI fixes.

## Definition of done for this phase

- All lane-B and lane-C tests pass, or a failing one is documented as a known limitation with a reason.
- Zero `as never` in core (typed helpers instead); non-null assertions only where a preceding check makes them safe and a comment is unnecessary.
- No logic duplicated between the runtime and the scenario runner: one conductor drives both.
- Copy contract and renderer agree line for line.
- Every surface has designed loading, empty, error and not-found states.
- README, ledger and test-results updated. Build green.

## Status (2026-09-16, end of QA phase)

- Lanes reported: UX 30 findings, code quality 30, stress fixtures 10 datasets + 35 tests, adversarial 216 tests (22 red).
- All lane tests pass: 342 tests, 21 files. Core has zero `as never`; tests still use it in helpers (allowed).
- Not met yet, carried forward: one conductor for runtime and runner (R1); zod-validated `localStorage` shapes; typed step notes instead of strings; a11y pass (`aria-describedby`, focus to first action); dark-mode review (R9).

## Remaining build order (after QA)

Locked order from the spec resumes where the 8-hour compression stopped. Each item names its gate.

| # | Item | What it is | Gate |
|---|---|---|---|
| R1 | Conductor extraction | One `core/agent/conductor.ts` drives a turn (interpret → ground → route → engine) for both the live runtime and the scenario runner | runtime and runner tests unchanged and green; `lib/runtime.ts` shrinks |
| R2 | Five-file ingestion shape | `projects/phases/tasks/dependencies/time_entries` normalizer producing the same `Dataset` | brief-shape fixture ingests; report identical in structure |
| R3 | Routine checks (D-24) | one durable `WAITING` mission per routine; virtual scheduler tick in tests, interval in browser, catch-up once on rehydrate | scenario: routine created → not ready → world changes → ready → notification block → complete |
| R4 | Conversational notifications | `notification.ready` block at the top of the home inbox and in the routine's thread; never proof of completion | renderer + runtime tests |
| R5 | Replay cassettes | `RecordingInterpreter` / `ReplayInterpreter`; scenarios pin model answers; `interpreter_disagreement` metric in results | Lab shows both interpreters per turn; CI never calls the API |
| R6 | Scenario authoring in the Lab | JSON editor with schema validation, save to `localStorage`, export | authored scenario runs and can be saved as a regression record file |
| R7 | Regression records on disk | `tests/regression/*.json` replayed by vitest; Lab "download record" | a committed record replays red on purpose, then green after fix |
| R8 | Path-contraction motion | resolved node settles, row collapses 260ms, next blocker enters after 60ms | reduced-motion respected; screenshots |
| R9 | Dark mode review | tokens exist; review every surface | headless screenshots in dark |
| R10 | Worker transport (optional) | `WorkerSystemOfRecord` moves the in-memory system into a Web Worker | scale-sample ingests off the main thread |
| R11 | Real-export hero walk | PRJ-028 completed inside the conversation, screenshotted | Gate 7 second dataset |
| R12 | Design-token migration table closure | `docs/design-system/tokens.md` with legacy → semantic mapping applied | no unexplained one-off values (lint check on `text-[` and `rgba(`) |

Not on the list on purpose: a Rocketlane API adapter (no sandbox), multi-user server truth, any fifth policy.
