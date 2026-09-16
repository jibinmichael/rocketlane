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

## Boundaries that are enforced, not described

- ESLint forbids React/Next/motion inside `core/`, relative parent imports inside `core/`, and `core/agent` importing `core/execution` or `core/system` (`eslint.config.mjs`).
- `FlightPlan` is branded with a module-private symbol; the executor's signature rejects a `ProposedPlan` at compile time (`tests/unit/plan-authority.test-d.ts`).
- The evaluator wraps the system of record and judges every write against `SUPPLIED_POLICIES` at write time, independent of the engine's configuration. Weakening the engine is caught (`tests/scenarios/built-in.test.ts`).

## Safe execution loop

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
