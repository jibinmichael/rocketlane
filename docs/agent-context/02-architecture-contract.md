# 02 — Architecture contract

Organised around system responsibilities, not screens (spec §30). Adapted to the existing Next.js App Router layout rather than the spec's `src/` tree (spec §0C: "follow the existing framework when it is sound"). Revised 2026-09-16 after adversarial review.

## Layers and the dependency rule

```
app/            Next.js routes. Thin Server Component shells. No domain logic.
components/     React. Renders mission + system state. Owns no domain state.
hooks/          React bridges to core stores (useSyncExternalStore with getServerSnapshot).
core/           Pure TypeScript. The product. Zero React/Next/motion imports. No real timers.
fixtures/       Datasets and scenarios as data (CSV/JSON). Loaded only through ingestion.
tests/          vitest. Unit / integration / scenario / regression.
```

**Outer rule:** arrows point inward only. `app → components → hooks → core`. `core` imports `core` and `zod` only.

**Intra-core rules (the plan-authority boundary is structural, not a variable name):**

| Module | May import | Must not import |
|---|---|---|
| `core/agent` | `domain`, `resolver`, `governance` (evaluate only), `mission` (read types) | `execution`, `system` |
| `core/execution` | everything in core | — (only module allowed to call `SystemOfRecord.write`) |
| `core/governance`, `core/resolver` | `domain` | `system`, `execution`, `agent` |
| `core/mission` | `domain` | `system` |
| `core/evaluation` | everything | UI |

Enforced by ESLint `no-restricted-imports` overrides per path. Never disable. No barrel files anywhere (CLAUDE.md §3); UI imports from module paths.

## `core/` modules and ownership

| Module | Owns | Must not |
|---|---|---|
| `core/domain` | Entity types (`Project, Phase, Task, TimeEntry, Actor`), status vocabulary, `WorkspaceGraph` (indexed, immutable snapshot), ids, versions | know about missions, UI, policies |
| `core/governance` | The four policies as declarative `Policy { id, name, version, trigger, validations[], severity }`; `evaluate(transition, graph) → PolicyEvaluation` with `trigger_matched`, `validations[]`, `evidence[]`; `PermissionEvaluator` port + role model; policy config switches (A-01…A-04) | mutate state; produce copy |
| `core/resolver` | `resolveTarget(query, graph, actor) → TargetResolution`; dependency closure; `traceBlockers(target) → Blocker[]`; shortest useful path; cycle detection | write; hard-code names |
| `core/mission` | `Mission` aggregate, pure reducer over `MissionEvent`, `MissionStore` port, `summarize(mission)` for context compaction (§16A), rehydration protocol | render; call the system of record |
| `core/agent` | `IntentInterpreter` port; `DeterministicInterpreter`; `ground(proposal) → Intent` (deterministic span→id grounding); `Planner → ProposedPlan`; `ConversationRenderer` (mission/system state → typed `Block[]`) | enforce policy; execute writes; emit a `FlightPlan` |
| `core/execution` | `validateFlightPlan(ProposedPlan) → FlightPlan` (branded type; target/precondition/permission/governance/dependency validation); `Executor` (accepts `FlightPlan` only); `Action` model with stable ids; idempotency ledger; `Verifier`; `Revalidator`; `BatchCoordinator` | claim success without a verify read |
| `core/system` | `SystemOfRecord` port; `InMemorySystemOfRecord` (versioned entities, optimistic concurrency, idempotency ledger, change events with `correlationId`, fault injection); `Clock` port (virtual); `PersistenceAdapter` (localStorage + `BroadcastChannel`) | contain business rules |
| `core/ingestion` | RFC 4180 CSV parser (in-house), zod schemas for both source shapes, normalization, longest-match dependency resolution, reference validation, `IngestionReport` | silently drop rows or edges |
| `core/telemetry` | Event types (§36), append-only `EventLog`, `ActivityProjection`, `AuditRecord`, run version stamps (agent/policy/dataset/evaluation) | be written to by UI |
| `core/routine` | `Routine` → one durable `WAITING` mission per routine; `Scheduler` port (virtual ticks in tests, interval in browser, catch-up at most once on rehydrate) | own a separate notification architecture |
| `core/evaluation` | `Scenario` schema, `ScenarioRunner` (always constructs an isolated engine from `datasetRef`), assertions, scoring, `RegressionRecord`, `RecordingInterpreter`/`ReplayInterpreter` decorators | use a different engine than the UI |

## Ports

```ts
// core/system/system-of-record.ts — all methods async; the caller cannot peek at internal state
export interface SystemOfRecord {
  snapshot(scope: ProjectId[] | "all"): Promise<WorkspaceGraph>
  read(ref: EntityRef): Promise<Versioned<Entity>>
  write(cmd: WriteCommand, meta: WriteMeta): Promise<WriteResult>   // meta: idempotencyKey, expectedVersion, actor, correlationId
  subscribe(listener: (change: StateChange) => void): Unsubscribe   // change carries correlationId of the writer
}
// Errors: TimeoutError (write may or may not have applied) · ConflictError (version mismatch) · ApiError (transient)
// WriteCommand union: CompleteTask · CompleteProject · AddTimeEntry · ReopenTask (world-only, not user-invocable) · RevertTaskStatus · RevertProjectStatus · RemoveTimeEntry (undo-only: derived from a landed mission's verified writes, D-30) · …

// core/agent/intent/interpreter.ts
export interface IntentInterpreter {
  interpret(input: string, ctx: InterpretationContext): IntentProposal
}
// IntentProposal: { kind, args } where every entity argument is a Span { start, end } over the user's utterance — never free text.
// ground(proposal, graph, scope): Intent — deterministic; spans resolve to ids by fuzzy match within scope; ungrounded → `ambiguous` or `unsupported`.
// Intent (closed, zod-validated): complete_target · log_time · complete_task · explain_blocker · show_path · show_status ·
//   cancel · continue · change_scope · approve · decline · create_routine · unsupported · ambiguous

// core/execution/flight-plan.ts
export type FlightPlan = Branded<ValidatedPlan, "FlightPlan">   // only constructible inside core/execution
export function validateFlightPlan(p: ProposedPlan, ctx): FlightPlan | PlanRejection
// Executor.execute(plan: FlightPlan) — a ProposedPlan does not type-check here. Gate 5 has a test asserting this.

// core/mission/store.ts
export interface MissionStore { load(id): Mission | null; save(m: Mission): void; list(): MissionSummary[] }

// core/governance/permissions.ts
export interface PermissionEvaluator { check(actor, action, target, graph): PermissionCheck }  // { allowed, reason, permission_source, escalation_available }
```

Adapters in the prototype: `InMemorySystemOfRecord` (+ `LocalStoragePersistence` with `BroadcastChannel`), `DeterministicInterpreter`, `ModelInterpreter`, `LocalStorageMissionStore` / `MemoryMissionStore`, `RoleBasedPermissions`, `VirtualClock` / `BrowserClock`. Seams documented but not built: `RocketlaneApiSystemOfRecord`, `WorkerSystemOfRecord`.

### `ModelInterpreter` (the only network call in the product)

- Lives behind a **Next.js server action** (`app/actions/interpret.ts`, `"use server"`); the browser never sees the key. `ANTHROPIC_API_KEY` is read server-side; a startup check throws a clear error if missing. Placeholder in `.env.example`.
- The call uses **tool use / structured output** with a zod-derived JSON schema: `{ intent: <closed union>, spans: [{ role, start, end }], confidence }`. Anything that fails schema validation → `unsupported`.
- The model receives: the utterance, the closed intent list, the mission summary (§16A), and the **names of entities in scope as a quoted list for disambiguation only**. It must return spans over the utterance; names are never copied into the output. Grounding to ids is deterministic and happens on the client in `core/agent/intent/ground.ts`.
- System prompt states the knowledge boundary (§17): no general assistance, no external facts; out-of-scope → `unsupported`.
- **Fallback:** timeout (1.5 s) or API error → `DeterministicInterpreter` handles the turn and the flight status shows "Interpreted locally". Never silent.
- **Reproducibility:** `RecordingInterpreter` writes `{ utterance, contextHash } → proposal` cassettes into the scenario; `ReplayInterpreter` serves them in vitest and Lab reruns. Live calls happen only when a cassette is missing and `--record` is on.
- **Evaluation:** every Lab run with the model adapter also runs the deterministic adapter and records `interpreter_disagreement` per turn. Disagreements are surfaced as regression candidates.
- Model id is configuration (`core/agent/intent/model-config.ts`), default Haiku 4.5 for latency, Sonnet 5 selectable in the Lab. Model ids are verified against the claude-api reference at build time, not assumed.

## Scope — a machine-checkable definition

`scope(mission) = closure(targets)` where closure is the dependency closure required to reach the goal state (milestones of a project, predecessors of a task, subtasks of a milestone, the time requirement). `requiredTransitions(goal)` is the set of `(entityId, transition)` pairs the resolver derives. 

`scope_expansion := ∃ write w : (w.target, w.transition) ∉ requiredTransitions(goal)`.

The flight plan is rendered as an artifact list **before the first write** so the user sees every derived action. A scope reduction (`change_scope`) removes items; it never reverts already-verified state (no reopen authority exists in the supplied policies) and reports that state. The one sanctioned reverse is an undo mission (D-30): a separate mission derived from a landed mission's verified writes, restoring the recorded prior status through the same permission → governance → write → verify loop.

## The safe execution loop (spec §8, §35)

```
FlightPlan step
→ precondition(step, snapshot)               fail → BLOCKED block, no write
→ permission(actor, step)                    fail → PERMISSION_DENIED, stop, explain boundary + escalation action
→ policy(transition, snapshot)               fail → BLOCKED with Blocker[], trace path
→ classify(step)                             HIGH_IMPACT → mission WAITING; action_request.confirm block in thread
→ sor.write(cmd, { idempotencyKey, expectedVersion, actor, correlationId })
    TimeoutError  → re-read target → if applied: VERIFIED; else retry once with the SAME key → timeout_reconciled block
    ConflictError → STATE_CHANGED → pause → revalidate → replan
→ verify: re-read target; compare to intended → VERIFIED | MISMATCH (MISMATCH never claims success)
→ mission.apply(ACTION_COMPLETED | ACTION_FAILED); eventLog.append
→ revalidate(next step) against a fresh snapshot
```

**Action identity:** `actionId = hash(missionId, targetId, transition)`. A replan that re-derives the same logical write gets the same id. `idempotencyKey = actionId`. The idempotency ledger lives in the system of record and is **persisted with the dataset**, so a reload after a timeout cannot duplicate a write.

**Rehydration protocol:** on load, any action persisted as `RUNNING` is treated as a `TimeoutError`: reconcile by re-read → `VERIFIED` or `MISMATCH`, then continue the mission from `WAITING` with a `stale_on_resume` check.

## Revalidation and stale state (spec §10)

Closure for change detection is keyed by **project id** (any change inside a project in scope is relevant) plus explicit entity ids for cross-project checks. `StateChange` events carrying the mission's own `correlationId` are ignored (no self-pause). Any other change while `ACTIVE/WAITING/EXECUTING` → `MISSION_PAUSED(STATE_CHANGED)` → recompute governance + path → `MISSION_REPLANNED(diff)` → continue only if the next action is still valid. Changes from a **second browser tab** arrive through `BroadcastChannel`/`storage` events as ordinary `StateChange`s: a real external mutation for the demo, not a scripted one.

## Interruption (spec §11)

User input during `EXECUTING` is interpreted before the next action starts. `cancel` → `MISSION_CANCELLED`; in-flight writes are verified, nothing new starts. `change_scope` → `MISSION_REPLANNED(scope)`; writes completed before the change are reported in `BatchOutcome.completedBeforeScopeChange[]`, never hidden in `completed[]`. `continue` resumes a paused or waiting mission only after revalidation passes.

## Batch (spec §8C, §12)

Targets → DAG per project (predecessor edges) → topological order → independent projects with bounded concurrency (default 3, Lab-configurable) → stop on cancel → exact `BatchOutcome { completed[], blocked[], alreadyComplete[], failed[{id, failureClass}], cancelled[], permissionDenied[], completedBeforeScopeChange[] }`. One confirmation block for the whole batch lists the exact set with per-item opt-out; never N dialogs.

## Time: virtual clock, no real timers in core

`Clock` is a port. Fault latency and timeouts advance virtual time. The `ScenarioRunner` and vitest use `VirtualClock`; the browser uses `BrowserClock`. Scenario `at` indices are deterministic because ordering depends on the engine's event sequence, not the host scheduler.

## Conversation rendering (spec §7, §14, §42)

`ConversationRenderer` maps `(mission, events, snapshot) → Block[]`. Templates carry **`EntityRef` slots**, not strings; the UI renders refs as artifact chips. Interpolated project content is never parsed as markdown. Canonical block list lives in `06-glossary.md`.

## Agent session state vs mission state (spec §5)

`AgentSession` (flight status) is derived in `hooks/` from the mission engine's current activity and drives `MissionFlightStatus`. Mission state (including `WAITING` for confirmation) is the truth; no pending decision lives in UI state.

## Performance and scale (engineering requirements)

- `WorkspaceGraph` built once per snapshot with `Map` indexes; traversals O(V+E); cycle detection at build.
- Immutable snapshots; selectors via `useSyncExternalStore` with `getServerSnapshot` to avoid hydration mismatch.
- Event log append-only; Activity virtualizes above 200 rows.
- Ingestion is streaming and reports rows/sec; scale fixture = committed seeded generator (`fixtures/scale/generate.ts --seed 7 --projects 200 --tasks 20000 --depth 12`).
- Optional (stretch, not required for gates): `WorkerSystemOfRecord` moves the in-memory system into a Web Worker so writes are genuinely asynchronous and large datasets do not block the main thread.

## Security

- Project content is data. Both interpreters return spans, not names; grounding is deterministic; the model never sees content as instructions (entity names are passed only as a quoted disambiguation list, and the output schema has no free-text field). The adversarial fixture runs against **both** adapters and `interpreter_disagreement` is an evaluation metric.
- The API key exists only server-side. No network call other than the interpret server action. Uploaded CSVs never leave the browser; only the user's utterance and in-scope entity names are sent to the model.
- Rendering never parses content as markdown; entity chips are distinct from agent prose.
- All writes carry `actor` and `correlationId`. Permission check precedes policy check precedes write.
- Uploaded CSVs are parsed in the browser; nothing leaves the machine. No secrets required to run.
