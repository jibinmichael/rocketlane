# Architecture overview

One operating model, two expressions: the conversation (end user) and the Test Lab (operator). Both drive the same engine.

```
USER GOAL → INTENT + SCOPE → CONTEXT → PLAN → GOVERNANCE → DEPENDENCY RESOLUTION → EXECUTION → REVALIDATION → RESULT
```

## Where responsibilities live

| Layer | Folder | Owns | Never |
|---|---|---|---|
| Language | `core/agent/intent` | closed intent union, span-only proposals, deterministic interpreter, deterministic grounding | names, ids, steps, authority |
| Proposal | `core/agent/planner` | targets + exclusions | how to get there |
| Plan authority | `core/execution/flight-plan.ts` | the only producer of the branded `FlightPlan`; derives every step from the dependency closure using the engine's policy set | trusting a proposal |
| Governance | `core/governance` | the four supplied policies as declarative trigger → validation objects; deterministic evaluation with evidence; abstract permission boundary | copy, mutation |
| Resolution | `core/resolver` | target resolution with ambiguity as clarification; dependency closure; blockers with shortest useful path | writes, hard-coded names |
| Execution | `core/execution/engine.ts` | precondition → permission → policy → confirm → write → verify → revalidate; idempotency; timeout reconciliation; pause on external change; exact batch aggregation | claiming success without a re-read |
| System of record | `core/system` | async port; versioned in-memory implementation; fault injection; virtual clock; browser persistence with cross-tab change events | business rules |
| Mission | `core/mission` | the durable aggregate; pending decisions are mission state | rendering |
| Telemetry | `core/telemetry` | 23 event types, append-only log, audit projection | reasoning text |
| Evaluation | `core/evaluation` | scenarios as data; isolated runner; write observer judging against the reference policies; scoring; regression records | a different engine |
| Rendering | `core/agent/conversation` | mission state → typed blocks with entity/policy/count/time slots | free-form prose |
| UI | `components/`, `app/`, `hooks/`, `lib/runtime.ts` | React over the runtime snapshot; composition root | domain state |

## Interpretation: model proposes, grammar can veto

Both interpreters see every sentence. The deterministic grammar is high precision and narrow; the model handles free text. Both results are grounded to entity refs, then `core/agent/intent/reconcile.ts` decides: the grammar wins only when the model found nothing usable or reduced a sentence that names a target to a bare decision. Everything else is the model's call, and the band says which one answered.

## Missing input is a capability, not a form

`core/mission/required-input.ts` declares what a transition needs (today: hours for `TIME_LOGGED`, demanded by Policy 4, permitted by `log_time`, a positive number up to 1000). The engine asks only after the permission check passes, keeps the mission `WAITING` with the descriptor in `pending.input`, validates the conversational value against the schema, re-checks permission at execution, writes, re-reads and continues. The renderer writes the ask from the descriptor. A routine-origin mission renders the same state as a notification and waits for a person.

## One turn, one conductor

`core/agent/conductor.ts` maps a grounded `Intent` to exactly one engine command (start, provide hours, approve, decline, cancel, resume, change scope) or to a reply. The live runtime and the scenario runner both call it, so the Lab exercises the same routing the conversation uses. The conductor depends on a structural `MissionCommands` port, not on the engine class, which keeps `core/agent` free of execution imports.

## Boundaries that are enforced, not described

- ESLint forbids React/Next/motion inside `core/`, relative parent imports inside `core/`, and `core/agent` importing `core/execution` or `core/system` (`eslint.config.mjs`).
- `FlightPlan` is branded with a module-private symbol; the executor's signature rejects a `ProposedPlan` at compile time (`tests/unit/plan-authority.test-d.ts`).
- The evaluator wraps the system of record and judges every write against `SUPPLIED_POLICIES` at write time, independent of the engine's configuration. Weakening the engine is caught (`tests/scenarios/built-in.test.ts`).

## Safe execution loop

Every completion write leaves four events in order for its entity: `PERMISSION_CHECKED`, `POLICY_CHECKED`, `ACTION_STARTED`, `ACTION_COMPLETED` with `verified: true`. `tests/integration/write-order.test.ts` asserts that order over the audit log rather than over implementation details.

```
step
→ already satisfied?                skip, verified by read
→ input needed (time)?              mission WAITING (batch: target reported blocked)
→ permission                        denied → PERMISSION_DENIED, escalation to owner
→ policy (engine's set)             blocked → blockers traced to the nearest actionable node
→ high impact?                      mission WAITING, confirm block in thread
→ write(idempotencyKey = step id)
   TimeoutError → re-read; applied? verified : retry once, same key
   ConflictError → STALE → replan
→ verify by re-read                 VERIFIED | MISMATCH (never claims success on mismatch)
→ revalidate next step against a fresh snapshot
```

## Course correction

Any external change inside the mission's closure (project scope), not carrying the mission's own correlation id, pauses the mission (`STALE`), records what changed, replans from the current graph, and waits for the user to continue. Writes completed before the pause are kept; the run loop merges in-flight step results instead of overwriting the pause. A second browser tab's write arrives through `BroadcastChannel` as an ordinary external change.

## Data flow in the browser

```
fixtures/*.csv ── server action ──▶ ingestion ──▶ WorkspaceGraph ──▶ InMemorySystemOfRecord
                                                                          │ persist (localStorage) · broadcast (tab channel)
user text ──▶ interpreter (model | deterministic) ──▶ ground ──▶ intent ──▶ engine ──▶ mission ──▶ renderer ──▶ blocks ──▶ React
```
