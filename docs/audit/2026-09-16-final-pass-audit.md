# Final Staff-level pass: read-only audit

Date 2026-09-16. Tree clean at the start (`git status` empty, 32 commits). Gate green: 24 files, 372 tests, build 7 routes. Stack: Next 16 / React 19 / TypeScript strict / Tailwind v4 / zod 4 / motion / vitest 5; `lucide-react` already installed by the shadcn preset and unused.

Every finding below is stated as CURRENT → PROBLEM → EVIDENCE → ROOT CAUSE → PROPOSED CHANGE, followed by the impact rows. Nothing in `core/governance`, `core/resolver`, `core/execution` write safety, permissions, verification or revalidation changes; the UI adapts to the state and events those already produce.

## 1. The thread reads as a workflow log

- **CURRENT** `renderMission` emits blocks by section: outcome → blocker chain → path → one `result.verified` block per step → state changes → pending → terminal. No acknowledgement of the request. No acknowledgement of the answer.
- **PROBLEM** After "2 hours" the user sees six "Verified: X is Completed." lines, then a form-like confirmation. The agent never says what it understood or what it is about to do.
- **EVIDENCE** [renderer.ts:105-190](core/agent/conversation/renderer.ts#L105-L190) section order; `renderStepResult` emits `result.verified` per step; screenshot `drive-hero3.png`.
- **ROOT CAUSE** Blocks are derived from mission state only; the event log (already passed in) is unused for narration; there is no notion of transient vs durable output.
- **PROPOSED CHANGE** Time-ordered timeline anchored on the event log. Durable blocks: acknowledgement (start, after input), blocker, ask, decisions, state change, course correction, failure, landing with compact evidence, evaluation. Transient work becomes one `activity` block per phase (phase boundaries = `INPUT_RECEIVED`, `ACTION_APPROVED`, `ACTION_DECLINED`, `MISSION_REPLANNED`), expanded while current, collapsed to one line afterwards.

## 2. Observable work has no icons and no phases

- **CURRENT** Every block has a coloured hairline rail; no semantic icon. Verified lines are indistinguishable from blockers at a glance.
- **PROBLEM** Not scannable. Kind of work is not visible.
- **EVIDENCE** `Block` has no icon field ([blocks.ts:72-80](core/agent/conversation/blocks.ts#L72-L80)); no icon component exists; `lucide-react` unused.
- **ROOT CAUSE** The block contract predates the activity model.
- **PROPOSED CHANGE** `SemanticIcon` on every block and activity item, mapped deterministically by block type / event kind; one `ConversationIcon` component over lucide.

## 3. Plan-time governance is invisible in the log

- **CURRENT** `POLICY_CHECKED` is emitted only at execution time, per step. Planning evaluates governance through the resolver without an event.
- **PROBLEM** "Checking governance · 4 policies checked" cannot be shown honestly before the blocker.
- **EVIDENCE** `applyFlightPlan` emits `PLAN_CREATED`, `DEPENDENCY_FOUND`, `PERMISSION_DENIED` only ([engine.ts](core/execution/engine.ts)).
- **ROOT CAUSE** Event model was written for the audit, not for narration.
- **PROPOSED CHANGE** Emit one `POLICY_CHECKED` per target at plan time with `phase: "plan"`, `checked` (policies consulted) and `policies` (triggers matched). Emit `INPUT_RECEIVED` when a validated input is accepted. Both are real system events; the write-order invariant test filters plan-phase checks.

## 4. Header exposes operation counts

- **CURRENT** Band shows "0 of 6 updates" and a determinate progress hairline; home rows show "0/6".
- **PROBLEM** Internal step counts are not the user's model. The state is.
- **EVIDENCE** [MissionBand.tsx](components/mission/MissionBand.tsx) `progress.done of progress.total`; `ArtifactMissionRow` `progress.done/progress.total`.
- **PROPOSED CHANGE** Band = goal · "Working · Checking governance" (state + current activity) · chip. Indeterminate hairline while working, solid on landing. `summarize().progress` removed.

## 5. Course correction copy is a status line

- **CURRENT** "Replanned. 5 of 6 updates still apply. Next: …"
- **PROPOSED CHANGE** `state_change` (change icon) → activity "Rechecking" → `course_correction` block: "Course correction. I've updated the remaining steps." with the count as secondary detail.

## 6. Test Lab is a second product

- **CURRENT** Three tabs (Dataset, Scenarios, World), "Run all 12", weaken-policy chips, regression records, `?run=` deep link that plays a scenario through the live thread.
- **PROBLEM** The prompt withdraws the Test Lab as a major surface. The evaluator's job is: upload data → run the normal agent → see evidence.
- **EVIDENCE** [LabPanel.tsx](components/lab/LabPanel.tsx), `LabScenariosTab.tsx` (262 lines), `Runtime.playScenario`.
- **PROPOSED CHANGE** One page: "Test with your project data" (upload, dataset summary with records needing attention), acting user, a compact "Simulate the outside world" section (kept: it is how concurrent change, timeout and failure are evaluated in one browser), and recent missions on this dataset with their evaluation. Scenarios, the deep link and `playScenario` are removed from the product; the scenario runner and fixtures stay in tests.

## 7. No evaluation evidence for a live mission

- **CURRENT** Invariants are judged only inside the scenario runner's write observer.
- **PROPOSED CHANGE** `evaluateMission(mission, events, graph)`: policy_violation, unauthorized_write, unverified_completion, scope_expansion, expected_final_state, judged from the audit log and a fresh re-read; execution counts and versions. Rendered as a collapsed `evaluation` block after any terminal mission and in the evaluator page. No score.

## 8. Focus does not move when input is required

- **PROPOSED CHANGE** When `pending.kind === "input"` appears and nothing else has focus, focus the composer. Announcements already exist through the live region.

## Impact

- **Architectural** `core/agent/conversation/activity.ts` (event → activity), `core/evaluation/mission-evaluation.ts`. Two new event types. No engine control-flow change.
- **UI** Block item renders icon + activity items + collapsed summaries; band; mission row; Lab page; icon component. Inline hours form already gone.
- **Event** `POLICY_CHECKED { phase: "plan" }` at planning; `INPUT_RECEIVED`; `ACTION_STARTED` carries `hours` for time entries.
- **Test plan** Activity derivation unit tests (phases, items, collapse); renderer order tests rewritten to the timeline; evaluation unit tests (hero passes all five; a mission with an unverified step fails one); runtime tests updated (no `result.verified`); write-order test filters plan-phase policy checks; browser drives: hero, course correction, cancel, permission, batch, upload, fallback.
- **What will not change** governance rules, closure, mission state model, execution loop, permissions, verification, revalidation, failure handling, target resolution, ingestion contract, scenario runner, fixtures, the deterministic and model interpreters, the conductor.
