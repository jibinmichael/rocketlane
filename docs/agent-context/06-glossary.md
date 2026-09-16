# 06 — Glossary

One word per concept. Use these names in code, copy, docs and tests.

## Domain (assignment facts)

| Term | Meaning | Source |
|---|---|---|
| **Project** | Top of the hierarchy. Has phases, tasks, owner, status. | brief |
| **Phase** | Groups tasks within a project. | brief; export embeds it per task |
| **Task** | Unit of work. Has status, assignees, dates, hours tracked, optional milestone flag, optional parent, optional predecessors. | brief |
| **Subtask** | A task whose `parentTaskId` is set. | brief |
| **Milestone** | A task flagged as a milestone. Project completion depends on all milestones being complete. | brief + export flag |
| **Predecessor** | A task that must be complete before a dependent task can complete. | brief |
| **Time logged** | Hours tracked against a task. | brief |
| **Policy** | A governance rule with a trigger and validations, producing allow/block. Exactly four exist. | brief |

## Operating model (our design)

| Term | Meaning |
|---|---|
| **Mission** | The durable unit of work: goal, scope, plan, actions, blockers, decisions, outcome. Survives turns and reloads. What the user wants. |
| **Flight plan** | The system-generated executable plan derived from a proposed plan after target/precondition/permission/governance/dependency validation. |
| **Navigation** | Dependencies, policies and blockers along the path to the goal. |
| **Flight status** | The agent session state right now (`UNDERSTANDING, PLANNING, CHECKING, WAITING_FOR_USER, EXECUTING, VERIFYING …`). |
| **Course correction** | The world changed while working: pause → identify change → revalidate → replan → continue only if safe. |
| **Abort** | The user cancels. Execution stops; nothing further is written. |
| **Landing** | The goal is verified complete. Mission resolves. |
| **Black box** | Append-only event log and audit record; the Activity view projects it. |
| **Ground control** | Policies, permissions and evaluation: the deterministic authority. |
| **Blocker** | Structured object: target, policy, reason, evidence, dependency path, required change, available action, required input, actor, next check. |
| **Shortest useful path** | The nearest node in the dependency closure where an available action exists; shown first. The full path remains expandable. |
| **Action** | One consequential unit with id, mission id, actor, intent, target, preconditions, permission result, policy result, execution status, verification status, correlation id. |
| **Action class** | `READ · SAFE_WRITE · DECISION_REQUIRED · BLOCKED · HIGH_IMPACT`. |
| **Verification** | A fresh read of system state after a write, compared to the intended state. Success is only claimed after this. |
| **Revalidation** | Re-checking the next planned action against current state before executing it. |
| **Stale** | The mission's dependency closure changed since the plan was formed. |
| **Routine** | A scheduled mission with trigger, scope, condition, action, notification and completion rule. |
| **Notification** | An output of mission state that returns the user to mission context. Not proof of completion. |
| **Artifact** | The reusable conversational primitive rendering an entity/result: type, title, status, metadata, context, available actions, expanded detail, source. |
| **Block** | A typed unit of agent output rendered in the thread. Canonical list (mirrors `04-ux-and-copy-contract.md`): `outcome.blocked · outcome.ready · already_complete · blocker · resolution_path · action_request.input · action_request.confirm · action_request.batch_confirm · declined · consequence · result.verified · result.mismatch · timeout_reconciled · state_change · replanned · stale_on_resume · scope_change · cancelled · partial_summary · permission_denied · clarification · boundary · routine.created · routine.check.not_ready · notification.ready · landing`. Copy is generated from structured data; entity slots are `EntityRef`s rendered as chips. |
| **Proposed plan** | What `core/agent` emits. Not executable. |
| **Flight plan** (typed) | Branded `FlightPlan` produced only by `core/execution/validateFlightPlan`. The only thing the executor accepts. |
| **Span** | `{start, end}` over the user's utterance; the interpreter's only way to reference an entity. Grounding to ids is deterministic. |
| **Failure class** | `timeout · api_failure · conflict · duplicate · partial_execution` — carried on every failed action and surfaced in `partial_summary`. |
| **System of record** | The port through which all project state is read and written. In the prototype an in-memory, versioned, fault-injectable implementation stands in for Rocketlane. |
| **Scenario** | Dataset + actor + instructions + scripted world events + interruptions + fault injection + expected outcome. The Test Lab's unit. |
| **Regression record** | A serialized failed scenario with its diagnosis, kept so it can be replayed. |

## States

**Mission:** `READY · ACTIVE · WAITING · EXECUTING · VERIFYING · COMPLETED · BLOCKED · FAILED · STALE · PERMISSION_DENIED · CANCELLED · PARTIALLY_COMPLETED`

**Agent session:** `READY · UNDERSTANDING · PLANNING · CHECKING · WAITING_FOR_USER · EXECUTING · VERIFYING · COMPLETED · ERROR · CANCELLED`

**Action execution:** `PENDING · APPROVED · RUNNING · SUCCEEDED · FAILED · SKIPPED · CANCELLED`
**Action verification:** `UNVERIFIED · VERIFIED · MISMATCH`

**Per-action outcome (batch aggregation):** `completed · blocked · already_complete · failed(failureClass) · cancelled · permission_denied · completed_before_scope_change`

**Intents (closed union):** `complete_target · log_time · complete_task · explain_blocker · show_path · show_status · cancel · continue · change_scope · approve · decline · create_routine · unsupported · ambiguous`

## Words we do not use

"Thinking", "Oops", "Great news", "snag", "AI", "smart", "magic", "brain", "assistant" (in UI copy), "bot".
