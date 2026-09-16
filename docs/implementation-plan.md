# Implementation plan — Rocketlane project governance agent

**Status:** Approved 2026-09-16 (all open questions resolved in `docs/agent-context/03-decisions-locked.md`). Build begins at ledger step 02.
**Date:** 2026-09-16
**Inputs:** `docs/spec/ROCKETLANE_AGENT_BUILD_SPEC.md`, `docs/audit/2026-09-16-current-state-report.md`, `fixtures/rocketlane-export/*`

This document follows spec §0A Phase 1. Every change has a reason. Sections marked **[assignment fact]** come from the brief, **[design decision]** are ours, **[engineering requirement]** are ours.

---

## 1. Current architecture

A Next.js 16 client-only chat scaffold ("vibe") with two pages, a composer, a decorative thinking indicator, no domain model, no state beyond React, no tests. Tooling (pnpm, TS strict, ESLint, Prettier, Husky, commitlint, CI), shadcn Nova primitives, Tailwind v4 tokens and a documented Typography system are sound. Full detail in the audit report.

## 2. Target architecture

```
USER GOAL → INTENT + SCOPE → CONTEXT → PLAN → GOVERNANCE → DEPENDENCY RESOLUTION → EXECUTION → REVALIDATION → RESULT
```

realised as a framework-free `core/` engine (domain · governance · resolver · mission · agent · execution · system · ingestion · telemetry · routine · evaluation) rendered by a thin React layer that reads mission state and system state through `useSyncExternalStore`. The same engine is driven headlessly by vitest and by the Test Lab. Details and interfaces: `docs/agent-context/02-architecture-contract.md`.

### Target repository layout

```
rocketlane-governance-agent/
├── app/
│   ├── layout.tsx                      AppShell (left nav: Projects · Governance Agent · Policies · Activity · Test Lab)
│   ├── page.tsx                        Governance Agent home — composer on top, missions below (the home is the inbox)
│   ├── m/[missionId]/page.tsx          Mission conversation (rehydrates from MissionStore)
│   ├── projects/page.tsx               Read-only projection of system state; each row → "Open in agent"
│   ├── policies/page.tsx               The four policies, versions, evaluation counts (Ground control)
│   ├── activity/page.tsx               Black box projection (event log → activity)
│   └── lab/page.tsx                    Test Lab (operator surface)
├── components/
│   ├── ui/                             shadcn — untouched
│   ├── shared/                         Typography, AppShellNav, EmptyState (when used in 2+ domains)
│   ├── conversation/                   ConversationThread, ConversationComposer, ConversationBlockList (block → component map)
│   ├── mission/                        MissionBand (goal · progress · state chip), MissionFlightStatus (+ Stop),
│   │                                   MissionBlockerBlock, MissionResolutionPathBlock, MissionConfirmBlock, MissionInputBlock,
│   │                                   MissionResultBlock, MissionStateChangeBlock, MissionSummaryBlock, MissionNotificationBlock,
│   │                                   MissionHomeList (composer on top, missions below, needs-input first)
│   ├── artifacts/                      ArtifactShell (primitive), ArtifactProjectRow, ArtifactTaskRow, ArtifactPolicyCheckList,
│   │                                   ArtifactActionRow, ArtifactTestResultRow, ArtifactActivityRow, ArtifactRoutineRow,
│   │                                   ArtifactMissionRow, ArtifactPathList (composition)
│   ├── projects/  policies/  activity/ per-surface tables/lists
│   └── lab/                            LabDatasetUpload, LabIngestionReport, LabScenarioEditor, LabRunResults,
│                                       LabFaultControls, LabWorldMutator
├── core/                               pure TypeScript (see architecture contract)
│   ├── domain/  governance/  resolver/  mission/  agent/  execution/  system/
│   └── ingestion/  telemetry/  routine/  evaluation/    (no barrel files; UI imports module paths)
├── hooks/                              use-mission.ts, use-agent-session.ts, use-workspace.ts, use-event-log.ts
├── lib/                                utils.ts, motion.ts (reads CSS motion tokens), ids.ts
├── fixtures/                           rocketlane-export/ cascading-conflicts/ happy-path/ failures/ concurrency/ adversarial/ scale/
├── tests/                              unit/ integration/ scenarios/ regression/ (vitest)
├── docs/                               spec/ agent-context/ audit/ adr/ architecture/ design-system/ test-results/ implementation-plan.md
├── public/                             favicon only
└── config: package.json, tsconfig.json (paths: @/core/*), eslint.config.mjs (+ core boundary rule), vitest.config.ts, next.config.ts, .github/workflows/ci.yml (+ test job)
```

**Why not `src/`?** The existing project and `CLAUDE.md` use root-level `app/ components/ lib/ hooks/ types/`. Moving to `src/` reorganises for its own sake (spec §0C forbids that). Adding `core/`, `fixtures/`, `tests/` is the minimal structural change that isolates the operating model.

**`types/` folder:** domain types move into `core/domain`. `types/` is kept for UI-only shared types (e.g. block view-models) or removed at step 25 if empty.

## 3. Migration strategy

Incremental, layer by layer, in the locked order (spec §50). Nothing in the conversation UI is built before the state it renders exists in `core/`. Each step ends with its gate (`docs/agent-context/05-build-ledger.md`).

```
CURRENT   client-only chat scaffold, transcript = state, no domain
→ PROBLEM  cannot represent missions, governance, verification, or any edge journey; conflicts with spec §4/§34/§45
→ PROPOSED pure core engine + thin renderers; conversation reads mission state
→ WHY      testability, dataset independence, model-agnostic authority boundary
→ IMPACT   replace app/c, components/chat; add core/, fixtures/, tests/; add 2 deps
→ PROOF    gates 1–10; hero + 4 edge journeys run as vitest scenarios AND in the browser on ≥2 datasets
```

## 4. Files and components — keep / modify / remove / new

### Keep (unchanged)
`components/ui/*` · `components/shared/Typography.tsx` · `lib/utils.ts` · `.husky/*` · `commitlint.config.js` · `.prettierrc` · `docs/adr/0001–0003` · `docs/_templates/*` · `components.json` · `postcss.config.mjs` · `.env.example` (extended, no real values)

### Modify (with reason)
| File | Change | Reason |
|---|---|---|
| `package.json` | name → `rocketlane-governance-agent`; add `test`, `test:watch`, `eval` scripts; add `vitest`, `zod` (after approval) | identity; Gate 8/9 |
| `tsconfig.json` | add `"@/core/*"` path (covered by `@/*` already; explicit for clarity), include `tests/**` | boundary clarity |
| `eslint.config.mjs` | add override for `core/**`: `no-restricted-imports` on `react, react-dom, next, next/*, motion, @/components/*, @/app/*, @/hooks/*` | enforce dependency rule (D-02) |
| `.github/workflows/ci.yml` | add `pnpm test` step | Definition of done |
| `app/layout.tsx` | title/description; remove unused Geist import (D-17); add AppShell nav | identity, latency |
| `app/globals.css` | add status + state + motion tokens; migrate one-offs (table in §7) | spec §0B |
| `app/page.tsx` | becomes Server shell rendering the conversation client boundary | CLAUDE.md boundary pattern |
| `lib/motion.ts` | export tokens that mirror CSS motion variables; keep `springEnter` for composer | §0B motion tokens |
| `README.md` | rewrite for this product (§0C list of nine things) | shareable git contract |
| `.env.example` | add `ANTHROPIC_API_KEY=` placeholder and `AGENT_INTERPRETER=model|deterministic` | model interpreter (D-04) |
| `next.config.ts` | no change expected; server actions are default in App Router | |
| `docs/adr/README.md` | index new ADRs | |

### Remove (with reason)
| Path | Reason |
|---|---|
| `app/c/[id]/page.tsx` | transcript-as-state and empty canvas conflict with §4, §34, §45 |
| `components/chat/ThinkingIndicator.tsx` | generic thinking spinner + playful copy (§5, §15, §45); mechanics re-implemented as `MissionFlightStatus` driven by session state |
| `components/chat/Chatbox.tsx` | Wati product chrome (mic, Skills, WhatsApp-flavoured suggestions) (§0.18); mechanics re-implemented as `ConversationComposer` |
| `HANDOFF.md` | describes a different product; replaced by README + architecture docs |
| `public/{file,globe,next,vercel,window}.svg` | starter assets, unused |
| `components/shared/.gitkeep`, `hooks/.gitkeep`, `types/.gitkeep` | folders will have content |

### New (grouped by build step)
- **02** `core/`, `fixtures/*/README.md`, `tests/setup.ts`, `vitest.config.ts`, `docs/adr/0004–0006`
- **03** `core/domain/{entities,status,graph,ids}.ts`
- **04** `core/governance/{policy,policies/*.ts,engine,permissions,config}.ts`
- **05** `core/resolver/{target,closure,blockers,path,cycles}.ts`
- **06** `core/mission/{mission,reducer,events,store,summary}.ts`
- **07** `core/execution/{action,executor,idempotency,verifier,retry,batch}.ts`, `core/system/{port,in-memory,faults,clock}.ts`
- **08** `core/execution/revalidator.ts`
- **09** `core/telemetry/{events,log,activity,audit}.ts`
- **10** `core/agent/{intent/{interpreter,deterministic,ground,model-config,recording},planner,conversation/{blocks,templates,renderer}}.ts`, `app/actions/interpret.ts` (server action wrapping `@anthropic-ai/sdk`), `hooks/use-interpreter.ts` (model → fallback)
- **07 (also)** `core/execution/flight-plan.ts` (branded `FlightPlan`), `tests/unit/plan-authority.test-d.ts` (type-level: `ProposedPlan` rejected by executor)
- **11** `components/artifacts/*`; dev-only "Artifacts" tab inside `/lab` for visual checks (not a sixth surface)
- **12–15** `components/conversation/*`, `components/mission/*`, `hooks/*`, `app/page.tsx`, `app/m/[missionId]/page.tsx`, `core/system/persistence/{local-storage,broadcast}.ts`
- **16–17** `core/routine/*`, `components/mission/MissionNotificationBlock.tsx`
- **18** `core/ingestion/*`
- **19–22** `core/evaluation/*`, `components/lab/*`, `app/lab/page.tsx`, `tests/scenarios/*`, `tests/regression/*`, `fixtures/adversarial/*`
- **23–25** token migration, `docs/design-system/tokens.md`, `docs/test-results/*.md`, `docs/architecture/overview.md`

## 5. Data / state migration

There is no existing state to migrate. New state:
- **System state:** `InMemorySystemOfRecord` seeded from a fixture on load (default `cascading-conflicts`; selectable in Lab). Persisted per dataset in `localStorage` so a page reload does not reset the demo mid-mission; a "Reset dataset" control exists in the Lab.
- **Mission state:** `LocalStorageMissionStore`, keyed by mission id; listed on the agent home.
- **Event log:** append-only in memory, persisted alongside the mission.
Ingestion path (`docs/agent-context/07-data-contract.md`) is the only way data enters the system.

## 6. Design-token migration (spec §0B)

| Legacy value / token | → Semantic token | Components affected | Visual risk | Review |
|---|---|---|---|---|
| `body { background-color: #fefefe }` | `--background` (oklch 1 0 0) | all | imperceptible | screenshot diff |
| canvas `#F8F8F7`, inline shadow | removed with canvas | — | none | — |
| `rgba(0,0,0,0.35/0.4/0.55/0.7)` text in Chatbox/ThinkingIndicator | `--muted-foreground`, `--foreground` | replaced components | slight contrast change, improves AA | contrast check |
| `bg-black/5` hover/backgrounds | `--muted` / `--accent` | composer, buttons | none | |
| inline `boxShadow` on composer | `--shadow-md` (new) | composer | none | |
| `--destructive` only | add `--status-success/-warning/-error/-info` (desaturated) | artifacts, flight status | new | contrast check |
| none | add `--state-ready/-working/-waiting/-blocked/-paused/-error/-completed` mapped onto status tokens | flight status, artifacts | new | |
| `lib/motion.ts` literals | `--motion-fast/normal/slow`, `--ease-out/-in-out` + TS mirror | all transitions | none | reduced-motion test |
| Geist fonts loaded, unused | removed | layout | none | network tab |
| text sizes `text-[15px]`, `text-[13px]` ad hoc | `text-body`, `text-caption` roles | composer, header | none | |

No global rewrite of shadcn tokens. Accent colour is chosen at Gate 10 with two candidates side by side.

## 7. Test plan

**Unit (vitest):** graph indexes; each policy allow/block with evidence; resolver paths incl. cycles and multi-predecessor; mission reducer transitions; idempotency; verifier mismatch; batch aggregation; CSV parser (quoted commas, CRLF, BOM); normalizer rejects; copy templates snapshot.

**Integration:** executor against in-memory system with fault injection (timeout → reconcile → single write; conflict → pause → replan).

**Scenarios (`tests/scenarios/*.json`, run by the same `ScenarioRunner` the Lab uses):** hero; happy path; each policy blocks once; mid-flight change; cancel; change scope; partial success on the real export; permission denied; ambiguous target; out-of-scope; adversarial task names; missing reference; malformed row; scale (generated).

**Regression:** every failure found during build becomes `tests/regression/<id>.json` + a one-line diagnosis; CI runs them.

**Manual (browser):** hero + four edge journeys, keyboard-only pass, reduced motion, 1280px and 1024px widths.

**Evaluation dimensions (spec §20):** correct outcome, policy compliance, scope adherence, state accuracy, authorized actions, verification, recovery, communication (copy snapshot), efficiency (actions per outcome, reads per action), robustness.

## 8. Dependencies proposed (require approval)

| Package | Why | Alternative rejected |
|---|---|---|
| `vitest` (dev) | fast TS-native runner; runs the pure core headlessly; scenario tests | Jest (slower config with ESM/TS) |
| `zod` | runtime validation of CSV rows, scenario files, intents (closed union) | hand-rolled validation (more code, less safe) |
| `@vitest/coverage-v8` (dev, optional) | coverage in test-results docs | — |
| `@anthropic-ai/sdk` | `ModelInterpreter` behind a server action; structured output validated with zod | raw fetch (no typed tool-use helpers) |

Not proposed: state libraries (native `useSyncExternalStore`), CSV libraries (in-house parser is ~100 lines and testable), graph libraries, chat UI kits.

**Approved 2026-09-16** by the human, together with all open questions in `docs/agent-context/03-decisions-locked.md`.

## 9. Interview demo path (spec §48)

Every beat below is a real engine event, not a staged animation. Two browser tabs are open on the same dataset.

1. **Home.** Composer on top: "Mark Acme Implementation as completed." → flight status: Finding → Planning → Checking governance (checks reveal) → `outcome.blocked`: "I can't complete **Acme Implementation** yet."
2. **Blocker + shortest path.** "**Go-Live** can't complete: predecessor **Deploy API** is incomplete." → "**Deploy API** can't complete: predecessor **QA Complete** is incomplete." → "**QA Complete** can't complete: no time logged." → `resolution_path`: "3 updates to complete **Acme Implementation**. First: log time on **QA Complete**." Full path expandable in place.
3. **Resolve in conversation.** `action_request.input` inline hours field, "Logged as {actor}" → `[Log time]` → `result.verified`. Path contracts; **QA Complete** settles; **Deploy API** becomes active.
4. **Verification is real.** Hero scenario carries one `fail-once` timeout on the Deploy API write: `timeout_reconciled` — "The write to **Deploy API** timed out. I re-read it: In progress. Retrying once with the same request." → `result.verified` "1 retry, no duplicate write." This four-second beat is the thesis.
5. **Course correction, from the second tab.** In tab two, reopen a task in scope (or the scenario's scripted world event fires while the presenter's hands are off the keyboard). Tab one: `state_change` — "**Acme Implementation** changed while I was working. I paused before the next update." What changed · what it affects · next → `replanned` → continuing. Mission band keeps the goal and progress throughout.
6. **High impact, in thread.** `action_request.confirm`: "Complete **Acme Implementation**? 2 milestones complete. 4 tasks remain open (does not block under current policies). Status → Completed." `[Complete project]` → verified → `landing`: "**Acme Implementation** completed. Verified at 10:42." → `[View activity]` shows who/what/why/when/result/verify.
7. **Interruption (second mission, 20 seconds).** "Complete Beacon rollout" → while executing: "Actually leave Go-Live open." → `scope_change`: "Stopped. **Go-Live** stays open. Continuing with the remaining 2 updates." Batch outcome shows `completedBeforeScopeChange` honestly if any.
8. **Routine (20 seconds).** "Check this every morning and complete it when it's ready." → `routine.created` with routine artifact → Lab virtual-clock tick → `notification.ready` block at the top of home → `[Complete project]`. A notification is not proof of completion; the verify read is.
9. **Test Lab.** Upload the real Rocketlane export → ingestion report shows real anomalies (76 completed tasks with no time, duplicate task name, 28 projects without tasks) → "Complete all projects" → one batch confirmation with per-item opt-out → exact `partial_summary`. Then **introduce a failure**: disable policy 4's validation via fault control → rerun → evaluator flags `policy_violation` → a regression record is created and replays red.
10. Close: **The demo is one scenario. The system is the product.**

## 10. Risks and unresolved questions

| Risk | Mitigation |
|---|---|
| Time: 25 steps is a lot | Steps 03–10 are pure TS with tests and go fast; UI steps reuse one artifact primitive; polish is last and bounded |
| Deterministic interpreter feels "not AI" to an interviewer | Framing in D-04; optional model adapter seam; clarification blocks show language handling |
| Real export has only 3 projects with tasks | honest reporting (D-07, data contract); scale fixture generator for depth/breadth claims |
| `NA` semantics and other assumptions wrong | all configurable switches (A-01…A-05), surfaced in Policies view |
| localStorage limits with large datasets | persist missions and event log, not the scale dataset; Lab datasets stay in memory |
| Scope creep toward a Rocketlane clone | product surface locked (D-12); drift alarms in agent-context README |
| Multi-tab demo fails on the day | scripted world event in the hero scenario is the single-screen fallback; both use the same `StateChange` path |
| Interviewer asks "where is the model?" | The live demo runs on Claude for language; the Lab shows both interpreters and their disagreement metric live |
| API key or network fails on the day | deterministic interpreter takes over visibly; the whole demo still runs |

Open questions are listed in `docs/agent-context/03-decisions-locked.md` and must be answered before step 02 begins.

## 11. Proposed `CLAUDE.md` addendum (not applied — requires permission)

Under §1 "Key folders", add:

```
- `core/` — framework-free domain, governance, mission, execution, ingestion and evaluation engine. No React/Next imports (lint-enforced). See docs/agent-context/02-architecture-contract.md
- `fixtures/` — datasets and scenarios as data. Never imported by core logic.
- `tests/` — vitest unit/integration/scenario/regression suites.
```

Under §7 "Before writing code", add:

```
0. Read docs/agent-context/README.md and follow its session protocol. Check docs/agent-context/05-build-ledger.md for the current step and gate.
```
