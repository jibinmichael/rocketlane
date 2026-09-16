# 03 — Decisions locked

Decisions already made. Do not re-open them in a later session without the human's explicit instruction. Each entry: decision · why · tradeoff. Items under **Assumptions awaiting confirmation** are proposals with a recommended default; build on the default unless the human overrides.

## Locked

**D-01 · Adapt the existing scaffold; do not rebuild.** Keep tooling, tokens, Typography, shadcn, docs structure. Replace only behaviour that conflicts with the spec (chat pages, Chatbox product chrome, ThinkingIndicator). *Why:* spec §0A. *Tradeoff:* some Wati-era mechanics are re-implemented rather than reused verbatim.

**D-02 · Pure `core/` engine at repo root, framework-free, lint-enforced boundary.** *Why:* the operating model must be testable headlessly and reusable behind a real API later (spec §31, Gate 1). *Tradeoff:* one new top-level folder beyond `CLAUDE.md` §1's list (see proposed CLAUDE.md addendum in `docs/implementation-plan.md`).

**D-03 · The engine runs in the browser against an in-memory, versioned, fault-injectable system of record.** *Why:* self-contained demo, offline, deterministic, zero latency, zero secrets; the `SystemOfRecord` port is the seam to Rocketlane's real API. *Tradeoff:* no multi-user server truth in the prototype; concurrency is simulated through scripted world events and the Lab's mutation controls, which is exactly what the edge journeys need.

**D-04 · Two interpreters, one contract; enforcement is never swappable.** The `IntentInterpreter` port returns an `IntentProposal`: an intent from a closed union plus entity arguments as **spans of the user's utterance**, never free text. Deterministic grounding (`core/agent/intent/ground.ts`) resolves spans to ids within scope. **Both adapters are built:** `ModelInterpreter` (Claude, server action, key in `.env.local`) is the primary path for the live demo; `DeterministicInterpreter` is the fallback when the API fails (visibly, in flight status), the oracle the Lab compares against, and the reason evaluation stays reproducible. The Lab runs both, records `interpreter_disagreement`, and `Recording`/`Replay` decorators pin model answers per scenario. *Why:* this is the production pattern (model for language only; system for authority); it answers "can everything be conversational?" with natural phrasing while keeping §3, §17, §18 intact. *Tradeoff:* one more dependency (Anthropic SDK) and a server action in the demo path; mitigated by fallback. Model default: `claude-haiku-4-5-20251001` for latency, switchable to `claude-sonnet-5` in the Lab; confirm ids against the claude-api reference at build time. Decided by the human on 2026-09-16.

**D-05 · Mission state persists in `localStorage` via a `MissionStore` port; tests use a memory store.** *Why:* Gate 4 (survives turns and reloads) without a backend. *Tradeoff:* per-browser only.

**D-06 · Governance policies evaluate transitions, not history.** Trigger fires on an attempted status change (`→ Completed`). Existing `Completed` tasks with zero hours in the export are reported by the Lab as *data findings*, never retroactively blocked. *Why:* the brief's rules are stated as completion constraints; retroactive enforcement would invent behaviour. *Tradeoff:* none for the demo.

**D-07 · Project completion is gated by milestones only (policy 1).** Open non-milestone tasks are **reported as a consequence** ("14 tasks remain open; this does not block completion under current policies") but do not block. *Why:* do not invent a fifth policy; do not hide consequences (north star). 

**D-08 · Name-based dependencies are resolved within the same project at ingestion; ambiguity is a reported error, never a guess.** *Why:* the export references predecessors by task name; PRJ-028 has a duplicate name. *Tradeoff:* a dependency on an ambiguous name is rejected with a reason and the task is flagged, so the evaluator sees it.

**D-09 · Both CSV shapes are supported through one normalizer:** the real two-file export (projects + tasks with embedded phase/dependency/hours/milestone/parent) and the brief's five-file shape (projects, phases, tasks, dependencies, time_entries). *Why:* Gate 8 says "test the system from uploaded data"; the interviewer may bring either.

**D-10 · The hero scenario lives in a fixture (`fixtures/cascading-conflicts/`), never in code.** It contains a project named "Acme Implementation" with a milestone → task → predecessor → predecessor → time chain. The same engine runs the real masked export in the Lab. *Why:* spec §0.13–14, §33.

**D-11 · Copy is generated from structured state in `core/agent/conversation`, through templates keyed by block type and reason code.** Components never author explanatory prose. *Why:* spec §42 "never let the model invent a reason when a structured reason exists"; also makes copy testable.

**D-12 · Product surface is exactly:** `Projects · Governance Agent · Policies · Activity · Test Lab`. Routes: `/` (agent home) · `/m/[missionId]` · `/projects` · `/policies` · `/activity` · `/lab`. *Why:* spec §43. No settings page, no notification center.

**D-13 · Aesthetic: Linear density + Notion calm, monochrome neutral with one restrained accent, hairline borders, system font stack, motion only for state transitions.** The rocketship metaphor appears in state names, copy and motion — never as illustration. *Why:* spec §19, §25, §45; the human's brief.

**D-14 · Dependencies: `vitest` (dev), `zod`, `@anthropic-ai/sdk`.** CSV parsing is in-house; no state or chat libraries. *Why:* smallest footprint that gives machine-checkable evaluation, typed ingestion and the model interpreter. Approved by the human on 2026-09-16.

**D-15 · Permission model is an abstract role boundary, labelled as ours.** Roles derived from the dataset: `owner` (ProjectOwner), `member` (TeamMembers / Assignee), `viewer`. Default: owner may complete projects and tasks and log time on the project; member may complete tasks assigned to them and log time; viewer reads only. The demo actor is selectable in the Lab and shown in the agent header. *Why:* spec §8D forbids inventing Rocketlane's real model but requires an explicit boundary.

**D-16 · Session state (`Flight status`) is derived, never persisted as truth.** *Why:* spec §5, §34.

**D-17 · Fonts: system stack. Remove the unused Geist import.** *Why:* the CSS never references Geist; removing it deletes a Google Fonts request and matches the Typography doc. *Tradeoff:* none.

**D-18 · The plan-authority boundary is structural.** `core/agent` emits `ProposedPlan`; only `core/execution/validateFlightPlan` produces the branded `FlightPlan`; the executor accepts nothing else; ESLint intra-core import rules forbid `core/agent` from importing `core/execution` or `core/system`. Gate 5 includes a type-level test. *Why:* spec §3 plan authority boundary must not be a variable rename.

**D-19 · Dependency resolution fails closed.** `Dependency` strings are resolved by longest match against the project's task names (task names may contain `, `). Any unresolved fragment makes the task `DEPENDENCY_UNRESOLVED` and non-completable, reported as a finding. *Why:* dropping a predecessor edge silently weakens policy 3 (§38).

**D-20 · Action ids are stable content hashes** `hash(missionId, targetId, transition)`; the idempotency ledger persists with the dataset; on rehydrate, `RUNNING` actions reconcile as timeouts. *Why:* §8 "never duplicate through unsafe retry" across reloads and replans.

**D-21 · Scope is defined and asserted.** `scope_expansion := ∃ write ∉ requiredTransitions(goal)`; the flight plan renders as artifacts before the first write; batches confirm once with per-item opt-out; scope reduction never reverts verified state. *Why:* §0.10, §39 needs a machine-checkable predicate.

**D-22 · Virtual clock in core; the scenario runner always builds an isolated engine.** *Why:* §39 reproducibility; the Lab must never mutate the demo dataset.

**D-23 · Multi-tab is the live concurrency demo.** Dataset persistence uses `BroadcastChannel`/`storage` events; a write from a second tab surfaces as an ordinary `StateChange` → pause → replan. The scripted world event in the hero scenario is the fallback for single-screen demos. *Why:* a real external mutation is more convincing than a puppeteered one, and it exercises the same path.

**D-24 · Routines: one durable `WAITING` mission per routine.** Ticks are events on it; `READY` spawns the completion action inside it; the scheduler catches up at most once on rehydrate; notifications are blocks on that mission and "needs action" rows on the agent home. The browser scheduler limitation is a README known limitation. *Why:* §13, §37 — notification is an output of mission state.

**D-25 · No modals for decisions.** High-impact confirmation is a `WAITING` mission state rendered as `action_request.confirm` in the thread; the block becomes the decision record. *Why:* §27; pending decisions must survive reload.

## Assumptions awaiting confirmation (defaults we will build on)

**A-01 · `NA` status counts as closed for policies 1–3** (not "open"), configurable per policy in `core/governance/config`. Rationale: `NA` in the export marks not-applicable template tasks (46 rows). Blocking a milestone on an NA subtask would be absurd in the demo; but this is an interpretation, so it is a switch, not a constant.

**A-02 · "Time logged" means `HoursTracked > 0` on the task itself** (not summed from subtasks). Configurable.

**A-03 · `Blocked` status is treated as open and non-completable until changed;** the agent reports it as a blocker with `required_change: unblock` and no available action (human decision outside the system).

**A-04 · A milestone's "open subtasks" are direct children only** (one level), matching `ParentTaskId`. Nested subtasks are handled by recursion in the resolver anyway; the policy reads direct children. Configurable.

**A-05 · High-impact actions requiring explicit confirmation:** completing a project; completing a project with zero tasks on record; any batch (one confirmation for the whole set with per-item opt-out); any action on a project the actor does not own. Everything else is `SAFE_WRITE`.

**A-08 · "Is this a Billing Milestone?" is the milestone flag.** It is the only milestone marker in the export; the brief's "milestone tasks" map to it. Configurable at ingestion.

**A-09 · Project status "Not Started"** (named in the brief, absent from the export) parses as an open, non-completed status and behaves like In Progress for governance.

**A-07 · Time is recorded as `AddTimeEntry { taskId, hours, actorId, at }`;** `hoursTracked` is the derived sum. The export seeds one synthetic entry per task with hours > 0, attributed to `import`. Configurable.

**A-06 · The human commits.** The agent prepares conventional-commit-sized changes and proposes messages; `git init` and commits are executed by the human unless they say otherwise (CLAUDE.md §7).

## Open questions — resolved 2026-09-16

1. Model interpreter: **build it** (D-04). Deterministic interpreter stays as fallback and oracle.
2. Assumptions A-01 … A-07: **accepted** as defaults; each remains a switch visible in the Policies view.
3. Dependencies `vitest`, `zod`, `@anthropic-ai/sdk`: **approved**.
4. `core/`, `fixtures/`, `tests/` and the CLAUDE.md addendum: **approved**.
5. Deletions (`components/chat/*`, `app/c/`, `HANDOFF.md`, starter SVGs) and package rename: **approved**.
6. `package.json` scripts and CI workflow edits: **approved**.
7. `git init` and one conventional commit per build step by the agent: **approved**. The human pushes.
8. Web Worker transport: **no**; the two-tab boundary is the stand-in for the network boundary.
9. Project completion gated by milestones only (D-07): **confirmed**.

## QA-phase decisions (2026-09-16, applied in code, each reversible by one test)

Found by the adversarial QA lanes; each changes observable behaviour, so it is recorded here rather than fixed silently.

| # | Decision | Why |
|---|---|---|
| Q-01 | A task a human set to **BLOCKED** is never completed by the system, even when all four policies pass. Blocker `unblock_task`, outside the system's authority. | The resolver already declared it outside its authority; the engine then wrote anyway. A hold placed by a person is not a policy the system can satisfy. |
| Q-02 | A-01 (`NA` counts as closed) now applies to policies 1 and 3 as well as 2. | Documented intent; the code only honoured it for subtasks. An NA milestone blocked its project forever and the plan would have completed an NA task. |
| Q-03 | Declining a confirmation lands the mission **Cancelled**, not Blocked. | Nothing blocks it; the user said no. The chip said "Blocked" and the thread opened with "can be completed". |
| Q-04 | Flagged data fails closed at plan time (no write steps under a flagged node). | Contract 07 said non-completable; the plan still counted the writes. |
| Q-05 | Phase targets are rejected (`UNSUPPORTED_TARGET_KIND`) instead of landing as "already complete". | Completing a phase has no policy or write behind it. |
| Q-06 | A target the world completed while the mission waited lands **already complete**, not Failed; "completed before scope change" is only written when the scope changed. | Honest reporting. |
| Q-07 | Cancel is honoured while a step is in flight: a terminal mission is never revived by a stale copy, and no write starts after a stop. | Spec §11. |
| Q-08 | "yes please", "ok go ahead", "yes, do it" approve; "yes yes yes" does not. Pronoun tails ("why is it blocked?") are never looked up as names. | Grammar gaps; the model interpreter already handled these but the fallback did not. |
| Q-09 | The hours request names the consequence: "It's assigned to {assignees}; hours you enter are recorded as yours." (or "Hours you enter are recorded as yours." when the actor is the assignee). | "Logged as Priya Raman." read as past tense and hid that a PM was logging time on someone else's task. North star. |
| Q-10 | "my projects" means projects the acting user **owns**. It narrows `all`; it never widens. An actor who owns nothing gets "You don't own a project in this workspace." | The brief's headline example, "Mark all my projects as completed.", expanded to all 31 projects through the model path and failed through the deterministic one. Spec §0.10. |
| Q-11 | Requests scoped by assignee or date ("assigned to John", "before end of week") answer "I can't scope by assignee or date yet", not the knowledge-boundary line. | Those requests are inside the product; saying "I can only act on projects, tasks and governance" was untrue. |
| Q-13 | The grammar can veto the model, deterministically, in two cases only: the model returned nothing usable and the grammar found an intent; or the sentence names a target and the model reduced it to a bare decision (continue / approve / decline / cancel / status). The band then says "Interpreted locally". | Haiku read "actually leave Handover open" during a confirmation as "continue", and "Mark all my projects as completed." as a name lookup. The model proposes; it is not the authority (spec §3). |
| Q-14 | A typed turn freezes the narrative but never an open decision: blocks with actions stay live and re-anchor below the reply. | Asking "why is it blocked?" while a decision was pending froze the confirmation and its buttons disappeared: a dead end. |
| Q-15 | Missing input is a generic mission capability: a step declares a `RequiredInput` (field, policy, reason, permission, schema); the engine checks permission **before asking**, collects the value from the conversation, validates it against the schema (never guesses: "two hours", "0", "-2", "5000" are refused with the ask re-stated), checks permission again at execution, writes, verifies by re-read and continues. The inline hours form and its button are gone; the composer is the input. | The ask read like a CRUD form inside chat and contradicted "conversation is the primary control surface". Hours are the only field today; the next rule that needs a human value adds a case, not a component. |
| Q-16 | A mission carries its `origin` (user or routine). A routine that meets missing input leaves the same durable WAITING mission and renders a `notification.blocked` block naming the target, the node, the policy and who must supply the value. It never invents hours. The scheduler itself is still not built (D-24). | The routine boundary had to be provable now, not after the scheduler exists. |
| Q-17 | The agent acknowledges the goal ("Got it. I'll get X to completed.") and every accepted answer ("Got it — 2 hours for QA Complete."), rendered from mission state and the `INPUT_RECEIVED` event, never from the model. | The thread read as a workflow log. Acknowledgement is what makes it an agent; deriving it from state keeps it truthful. |
| Q-18 | Observable work is an `activity` block per phase derived from the audit log (plan-time `POLICY_CHECKED` added; `ACTION_STARTED` carries hours). The current phase is open, finished phases fold to one sentence. Per-step "Verified" blocks are gone; the landing block carries compact evidence. | Live mission while it runs, clean conversation afterwards. Nothing simulated: every row is an event. |
| Q-19 | The band shows goal · current activity · state. No "N of M updates". Home rows show state, not counts. | Operation counts are the implementation's model, not the user's. |
| Q-20 | `BLOCKED` renders as over for now (evaluation shown) although the engine keeps it resumable when the world changes. | Evidence should be readable whenever the agent has stopped. |
| Q-21 | The Test Lab is one page: upload project data, acting user, simulate the outside world, missions on this data with their evaluation. Scenarios, "Run all", weaken-policy chips and the `?run=` deep link are gone from the product; the scenario runner and fixtures stay in the test suite. | The evaluator's job is upload → run the normal agent → read evidence. The engine does not change with the dataset. |
| Q-22 | Pause is a first-class mission state. `pause()` stops scheduling; if an update is in flight it is finished and verified (reconciled, never claimed stopped), then the mission is `PAUSED`. Esc pauses; cancel is a typed or clicked decision. Resume re-reads the system, replans (permissions, governance, dependencies) and records whether the world moved while paused. Nothing is ever rolled back. A pause requested and resumed before it takes effect is withdrawn. | Interruption safety (spec §11) had one lever, cancel. A person needs to stop without giving up the goal. |
| Q-23 | The agent is the product: no left sidebar, no module destinations. One header with a fabricated Acme workspace identity and the acting user, which opens a small workspace dialog (acting as, project data, simulate the outside world). Home = welcome · composer · trust line · "Test with project data" · previous missions. `/projects`, `/policies` and `/lab` are gone; `/activity` stays only as the deep audit behind "View activity". | The sidebar made the architecture look like modules (final brief §2–§4, §27). Spec §43's navigation list is superseded by this brief. |
| Q-12 | An exact task name resolves even when a longer task name starts with it ("Legacy Migration" vs "Legacy Migration scope, strategy and plan"). | The 0.15 ambiguity margin treated an exact match as a tie with a prefix match. |

## Open questions (new)

None. Add here before guessing.
