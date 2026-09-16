# 01 — North star and non-negotiables

> **Make the complexity disappear. Never make the consequences disappear.** (spec §0)

## What we are building

A **project governance agent**: a reliable action-taking system whose primary interface happens to be conversational. The user states an outcome ("Mark Acme Implementation as completed"). The system resolves the target, checks governance, traverses dependencies, exposes the shortest useful resolution path, lets the user act inside the conversation, executes with verification, revalidates when the world changes, and lands the mission with an auditable record.

The interviewer's core question: **can everything be done in conversational UX?** Our answer is a demonstration, not an argument. Every end-user action (inspect a blocker, log time, complete a task, approve a high-impact write, change scope, cancel, review activity, set up a routine check) is available from the conversation. The only non-conversational surfaces are operator/developer surfaces: the Test Lab and the Policies/Activity views, which are read-only projections of system state.

## Who owns what (spec §3)

| The model may | The system owns |
|---|---|
| understand language, resolve ambiguity, interpret intent, form a *proposed* plan, explain state, adapt the conversation, suggest next steps | current project state, governance enforcement, permissions, action execution, verification, audit, retries, idempotency, evaluation, regression, versioned behaviour |

**The model can reason about governance. The model does not enforce governance.** A proposed plan is not executable authority; only the system-generated executable plan reaches the executor (§3 plan authority boundary).

## The four governance policies (the only ones that exist — spec §1)

1. A project cannot be completed until all milestones are complete.
2. A milestone cannot be completed while it has open subtasks.
3. A task cannot be completed while a predecessor is incomplete.
4. A task cannot be completed without time logged.

Do not invent a fifth. Everything else in the spec (idempotency, revalidation, permission boundary) is **our** engineering requirement and must be labelled as such in UI copy and docs.

## Twenty-five non-negotiables, condensed (spec §0)

1. Do not drift from the operating model: `goal → intent+scope → context → plan → governance → dependency resolution → execution → revalidation → result`.
2. Not a generic chatbot. Not a Rocketlane CRUD clone.
3. End-user work happens in the conversation. Test Lab is an operator surface.
4. Deterministic system state and rules are authoritative. The model is not.
5. Never claim success before verification. Never execute a blocked action. Never silently expand scope. Never continue a stale plan.
6. Never expose chain-of-thought. Show observable actions, decisions, state, reasons.
7. No hard-coded hero scenario. Must run on any valid dataset.
8. Every meaningful failure becomes diagnosable and regression-testable.
9. Reuse proven conversational primitives as *patterns*; do not copy Wati assumptions, terminology or visual identity.
10. Quiet, precise, product-native. No AI decoration, no gradients, no confetti, no fake typing.
11. Every component maps to a real system state, action, decision or result.
12. Make no claims about Rocketlane behaviour that are not in the supplied brief.
13. Distinguish assignment facts / design decisions / implementation requirements.
14. If the implementation cannot support a design claim, fix the system before polishing the UI.
15. If a feature does not make the agent more reliable or the user's decision easier, reject it.

## Knowledge boundary (spec §17)

For Rocketlane actions the agent knows: Rocketlane state + Rocketlane governance policies + authorized context. **External world knowledge is locked.** The deterministic interpreter has none. If a model adapter is ever enabled, it receives only structured entity references and returns a validated structured intent; it never sees free-form project content as instructions, and never answers general questions. Out-of-scope requests get: *"I can only act on projects, tasks and governance in this workspace."*

## Definition of done (spec §51)

Not "the hero conversation looks good". Done means: deterministic policies, data-driven traversal, persisted mission state, checked and verified actions, stale-state detection, interruption → replan, exact partial-success reporting, routine checks as missions, conversational notifications, reusable artifacts, CSV-driven scenarios, machine-checkable evaluation, regression records, hero + four edge journeys working on **different datasets**, no chain-of-thought UI, quiet product-native visuals, a clean reproducible repository.
