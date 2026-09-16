# 05 — Build ledger

Locked build order (spec §50) with gates (spec §40). Update after every work session. Status: `todo · in-progress · passed · blocked`. A step is `passed` only when its gate command output has been pasted or summarised truthfully here.

Gate command for every step from 03 onward: `pnpm typecheck && pnpm lint && pnpm test`. Steps with UI additionally require a manual browser check noted in "Evidence".

| # | Step | Gate | Status | Evidence / notes |
|---|---|---|---|---|
| 01 | Inspect existing code | audit report exists | **passed** | `docs/audit/2026-09-16-current-state-report.md` |
| 02 | Establish clean project boundaries | `git init`; `core/`, `fixtures/`, `tests/` created; lint boundary rule active; vitest runs; dead scaffold removed; package renamed; `.env.example` has `ANTHROPIC_API_KEY=` | **passed** | 2026-09-16: typecheck OK · lint OK · test OK (1 file, 1 test, type errors none) · format OK · build OK (routes `/`, `/_not-found`). Boundary probe: react / `@/core/execution` / `../` imports inside `core/agent` → 3 errors; `@/core/mission` + `@/lib` inside `core/domain` → 2 errors; allowed imports in `core/execution` → 0. First attempt missed `react` because per-module overrides replaced the base rule; fixed by composing base + module rules. Deps added: zod 4.6, @anthropic-ai/sdk 0.126, vitest 5.0, @vitest/coverage-v8 5.0. |
| 03 | Domain model (+ ingestion of shape A, pulled forward from 18) | Gate 1: same code builds `WorkspaceGraph` from `rocketlane-export` and `cascading-conflicts` fixtures; unit tests on indexes | **passed** | 2026-09-16: 19 tests pass. Real export: 31 projects, 325 tasks, 20 phases, 9 milestones, 39 subtasks, 53 predecessor edges, 0 rejected; findings surfaced: DUPLICATE_NAME (TSK-0312/0313), 76 HISTORICAL_POLICY_INCONSISTENCY, 28 PROJECT_WITHOUT_TASKS, no cycles. Hero fixture builds Go-Live → Deploy API → QA Complete from data. Longest-match dependency resolution tested incl. comma-containing names; first DP tiebreak swallowed a known name into an unknown fragment, fixed to minimise unresolved parts. |
| 04 | Governance engine | Gate 2: each of the four policies blocks and allows deterministically; evidence recorded in `PolicyEvaluation`; snapshot tests | todo | |
| 05 | Dependency resolver | Gate 3: arbitrary chains traversed; shortest useful path; cycle detection; property test on random DAGs; `comma-names` fixture resolves by longest match and fails closed | todo | |
| 06 | Mission engine | Gate 4: reducer round-trips through `MissionStore`; state survives reload in browser | todo | |
| 07 | Execution engine | Gate 5: `ProposedPlan` rejected by executor at type level; writes precondition/permission/policy checked and verified; timeout → reconcile → single retry with same key; reload with a `RUNNING` action reconciles without duplicate | todo | |
| 08 | Revalidation | Gate 6: scripted world change during execution pauses and replans; own writes do not self-pause; second-tab write (BroadcastChannel) surfaces as STATE_CHANGED; stale plan never executes | todo | |
| 09 | Event / activity model | event log drives an activity projection and audit record; tests | todo | |
| 10 | Conversational state layer | `ConversationRenderer` emits blocks for every mission state; copy snapshot tests; `DeterministicInterpreter` + `ground()` pass the intent fixture; `ModelInterpreter` server action with schema validation, 1.5 s fallback, recording/replay cassettes; both adapters agree on the hero utterances | todo | claude-api skill consulted before writing SDK code |
| 11 | Reusable artifact system | one primitive, ≥5 presentations, dev-only "Artifacts" tab inside `/lab` for visual checks (no sixth surface) | todo | |
| 12 | Core conversation journey | Gate 7: hero fixture completed end to end inside the conversation **and** the same journey on a real-export project (PRJ-028) with no code change; browser check | todo | |
| 13 | Mid-flight change | course-correction journey passes in browser and as a scenario | todo | |
| 14 | User interruption | cancel + change-scope journeys pass in browser and as scenarios | todo | |
| 15 | Partial success | "Complete all projects" on real export yields exact breakdown | todo | |
| 16 | Routine checks | one durable WAITING mission per routine; ticks are events; catch-up once on rehydrate; condition gating tested | todo | |
| 17 | Conversational notifications | notification block returns to mission context; not proof of completion | todo | |
| 18 | CSV ingestion | Gate 8: both shapes ingest; report lists rejects/warnings/findings; real export anomalies surfaced | in-progress | Shape A (two-file export) done at step 03 with report, rejects, warnings, findings. Shape B (five-file brief shape) and browser upload remain. |
| 19 | Test Lab | upload → ingest → pick/author scenario → run → results; failure injection controls | todo | |
| 20 | Evaluation engine | assertions machine-checkable incl. `no_scope_expansion` predicate; score; run reproducible from dataset hash + scenario id; version stamps; compaction scenario (summary → fresh session → same outcome) | todo | |
| 21 | Regression suite | Gate 9: a recorded failure replays and is caught | todo | |
| 22 | Adversarial tests | misleading content, out-of-scope, conflicting instructions handled by boundary/clarification blocks on **both** interpreters; `interpreter_disagreement` reported | todo | |
| 23 | Motion / streaming | state transitions animate per token table; reduced-motion respected | todo | |
| 24 | Visual polish | Gate 10: token migration table applied; no unexplained one-offs; accent chosen | todo | |
| 25 | Final verification | clean build, tests, README, plan matches architecture, no secrets, demo runs from documented commands | todo | |

## 8-hour compression (decided 2026-09-16, submission deadline)

Order unchanged; depth reallocated. Steps 03+18 (domain + ingestion) merge because the domain gate needs real data. Steps 16–17 (routines, notifications), the scale generator and replay cassettes are **documented, not built**, and listed as known limitations in the README. The model interpreter is time-boxed to 30 minutes at hour 7; if it slips, the deterministic interpreter ships and the seam is documented. Depth goes to the conversation (hero + four edge journeys) and the Test Lab.

## Session log

| Date | Steps touched | Summary | Left out deliberately |
|---|---|---|---|
| 2026-09-16 | 01 | Read-only audit, agent-context docs, implementation plan, proposed ADRs, fixtures copied; adversarial review folded in; human resolved all open questions (model interpreter approved) | No source changes; no dependencies installed; no git init |
| 2026-09-16 | 02 | git init; deps; `core/` `tests/` `fixtures/` READMEs; lint boundary (base + intra-core) verified by probes; vitest config with type-tests; removed `app/c`, `components/chat`, `HANDOFF.md`, starter SVGs, unused Geist fonts; package renamed; CLAUDE.md addendum applied (approved); README rewritten; `.env.example` extended; CI test step | No `core/` code yet (step 03). Interim `app/page.tsx` shell exists only so the build passes; replaced at step 12. `types/` folder kept until step 25 decision. |
