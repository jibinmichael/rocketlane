# ROCKETLANE — PROJECT GOVERNANCE AGENT
## Staff-level conversational UX + software build specification

### Status
Build specification — source of truth for the coding agent.

### Mission

**Design a Project governance agent — a reliable action-taking system whose primary interface happens to be conversational.**

### North star

**Make the complexity disappear. Never make the consequences disappear.**

---

# 0. NON-NEGOTIABLES

These rules govern the entire build.

1. Do not drift from the operating model.
2. Do not turn this into a generic chatbot.
3. Do not introduce a conventional Rocketlane CRUD workflow for the end user.
4. End-user work must be completed through the conversational interface.
5. The conversation is the primary control surface.
6. Supporting system surfaces such as evaluation/test tooling are separate operator/developer surfaces, not legacy end-user workflows.
7. The model is not the authority over project state or governance.
8. Deterministic system state and governance rules are authoritative.
9. Never claim an action succeeded until the system verifies the resulting state.
10. Never silently expand the user's scope.
11. Never continue executing a stale plan.
12. Never expose internal chain-of-thought. Show observable actions, decisions, state and reasons.
13. Do not hard-code the hero scenario.
14. Do not build a fake demo that only works for one project.
15. The system must operate from structured project data.
16. Every meaningful failure must become diagnosable and regression-testable.
17. Reuse proven conversational UI primitives where they are genuinely reusable.
18. Do not copy Wati product assumptions, terminology or visual identity into Rocketlane.
19. Keep the interface quiet, precise and product-native. No AI decoration.
20. Do not add functionality simply because it sounds like an AI feature.
21. Every new component must map to a real system state, action, decision or result.
22. Do not make claims about Rocketlane behavior that are not in the supplied brief.
23. Clearly distinguish:
   - assignment facts
   - design decisions
   - implementation requirements
24. If the implementation cannot support a design claim, fix the system before polishing the UI.
25. If a proposed feature does not make the agent more reliable or make the user's decision easier, reject it.

---

---

# 0A. PRE-BUILT APPLICATION ADAPTATION PROTOCOL

This specification assumes the starting repository may already contain a working prototype.
The coding agent must **adapt the existing application**, not blindly rebuild it and not preserve legacy structure just because it already exists.

## Required sequence

```text
READ-ONLY AUDIT
↓
CURRENT-STATE REPORT
↓
IMPLEMENTATION PLAN
↓
PROPOSED CHANGES
↓
BUILD
↓
VERIFY
↓
CLEANUP
↓
FINAL REPOSITORY REVIEW
```

### Phase 0 — Read-only audit

Before changing source code, inspect and document:

1. repository tree
2. package manager and framework
3. build/dev/test commands
4. routes and entry points
5. component architecture
6. state management
7. domain/data model
8. mock/API/data layer
9. existing conversation implementation
10. existing design system and tokens
11. styling architecture
12. existing tests
13. environment/configuration
14. assets and fonts
15. current technical debt
16. reusable code
17. code that conflicts with this specification

Do not make speculative architectural changes during the audit.

### Phase 1 — Implementation plan

Create `docs/implementation-plan.md` containing:

- current architecture
- target architecture
- migration strategy
- files/components to keep
- files/components to modify
- files/components to remove
- new files required
- data/state migration requirements
- design-token migration
- test plan
- risks and unresolved questions

Every proposed change must have a reason.

### Phase 2 — Proposed changes

Before implementation, present the proposed architecture and migration in a concise form:

```text
CURRENT
→ PROBLEM
→ PROPOSED
→ WHY
→ IMPACT
→ PROOF / TEST
```

Do not rebuild working infrastructure without evidence that it conflicts with the target system.

### Phase 3 — Build

Only after the plan/proposal is established:

- implement incrementally
- preserve working behavior that does not conflict
- replace conflicting behavior at the correct architectural boundary
- run the relevant gate after each layer
- avoid parallel rewrites of unrelated areas

### Phase 4 — Final repository cleanup

The final Git repository must be shareable as a professional engineering/design artifact.

Do not commit:

- secrets
- API keys
- `.env` files containing credentials
- temporary exports
- screenshots used only for debugging
- generated caches
- build artifacts
- agent transcripts
- unused dependencies
- dead demo code
- duplicate components
- abandoned experiments
- hard-coded scenario logic

Include where appropriate:

- `README.md`
- `.env.example`
- reproducible install/build/test commands
- architecture documentation
- implementation plan
- design decisions
- evaluation/test results
- representative fixtures
- clean commit history if the repository is being shared as a portfolio artifact

The final repository should communicate the same quality of thinking as the prototype.

---

# 0B. DESIGN SYSTEM + TOKEN CONTRACT

The design system must be adapted to the existing pre-built application's infrastructure rather than layered on top as a second styling system.

These are **our implementation requirements**, not claims about Rocketlane's official internal design tokens.

## Token architecture

Use three levels where useful:

```text
PRIMITIVE TOKENS
↓
SEMANTIC TOKENS
↓
COMPONENT TOKENS
```

### Primitive tokens

Define raw values only once for:

- color palette
- typography scale
- font weights
- spacing scale
- border widths
- radii
- shadows/elevation
- motion durations
- easing curves
- breakpoints where required

Avoid using primitive values directly inside components when a semantic token exists.

### Semantic tokens

At minimum support concepts such as:

```text
color.background.canvas
color.background.surface
color.background.elevated
color.text.primary
color.text.secondary
color.text.muted
color.text.inverse
color.border.default
color.border.strong
color.interactive.default
color.interactive.hover
color.interactive.active
color.status.success
color.status.warning
color.status.error
color.status.info
color.focus.ring

space.xs
space.sm
space.md
space.lg
space.xl
space.2xl

radius.sm
radius.md
radius.lg
radius.full

shadow.sm
shadow.md
shadow.lg

motion.fast
motion.normal
motion.slow
```

Exact values must be derived from the existing application where those values are coherent. If the existing system is inconsistent, document the proposed normalization before replacing it.

### Typography

Define semantic text roles rather than arbitrary font sizes:

```text
text.display
text.heading.xl
text.heading.lg
text.heading.md
text.body.lg
text.body.md
text.body.sm
text.label
text.caption
text.mono
```

Each role should define:

- family
- size
- line height
- weight
- letter spacing where required

Do not introduce a second font family unless the existing product direction requires it.

### Spacing

Use a consistent spacing scale.
Do not introduce arbitrary one-off margins or padding when a token can express the relationship.

### State tokens

Agent state and governance state must have explicit visual semantics.

Examples:

```text
state.ready
state.working
state.waiting
state.blocked
state.paused
state.error
state.completed
```

These should map to semantic status tokens rather than component-specific colors.

### Motion tokens

Motion must communicate state transitions.
Define reusable durations/easing rather than bespoke animations.

Use motion for:

- working → paused
- paused → rechecking
- rechecking → replanned
- dependency resolution
- result confirmation
- expandable detail

Do not use animation to manufacture activity.

## Token migration rule

The agent must first inventory existing values. Then produce a mapping:

```text
LEGACY VALUE / TOKEN
→ SEMANTIC TOKEN
→ COMPONENTS AFFECTED
→ VISUAL RISK
→ TEST / REVIEW
```

Do not perform a global token rewrite merely for cleanliness. Migrate where it improves consistency, removes duplication, or is required by the new interaction model.

## Design-system acceptance criteria

The final UI should have:

- one coherent token source
- no unexplained one-off spacing values
- no unexplained one-off colors
- no duplicate semantic states
- consistent typography roles
- consistent focus/hover/disabled behavior
- consistent motion semantics
- accessible contrast and focus treatment
- components that consume tokens rather than inventing their own visual language

The visual system should remain quiet, precise and native to the product context.

---

# 0C. SHAREABLE GIT CONTRACT

The repository is part of the deliverable. It must be understandable by another designer or engineer without the author being present.

Recommended top-level structure:

```text
rocketlane-governance-agent/
├── README.md
├── package.json
├── .env.example
├── src/
├── tests/
├── docs/
│   ├── implementation-plan.md
│   ├── architecture/
│   ├── decisions/
│   └── test-results/
├── fixtures/
├── public/
└── [framework-specific config]
```

The exact structure must follow the existing framework when it is sound. Do not reorganize files simply to match this example.

README must explain:

1. what the product is
2. the operating model
3. how to run it
4. how to run tests
5. how to load a dataset
6. how to run the evaluation
7. where the core domain/governance logic lives
8. key architectural decisions
9. known limitations

A reviewer should be able to clone the repository and understand the system without reading the entire codebase first.

---

# 1. SOURCE OF TRUTH

The supplied Rocketlane brief defines:

## Product hierarchy

Project
→ Phase
→ Task

Tasks may have:
- subtasks
- predecessors
- assignees
- dates
- status
- milestone behavior

## Governance policies supplied by the brief

1. A project cannot be completed until all milestones are complete.
2. A milestone cannot be completed while it has open subtasks.
3. A task cannot be completed while a predecessor is incomplete.
4. A task cannot be completed without time logged.

These rules must be implemented as deterministic governance logic.

Do not invent additional Rocketlane business policies.

Additional reliability constraints in this document are OUR design/engineering requirements, not claims about existing Rocketlane behavior.

---

# 2. THE PRODUCT THESIS

The user gives an outcome.

Example:

> Mark Acme Implementation as completed.

The user should not need to manually discover:

Project
→ Milestone
→ Task
→ Predecessor
→ Predecessor
→ Time entry

The system owns that complexity.

The user should only enter when:

- a decision is genuinely required
- authorization is required
- information is missing
- the system cannot safely proceed
- the user changes the goal or scope

The system must remain transparent about consequential state.

---

## 2A. TARGET RESOLUTION

The agent must resolve the user's natural-language target into explicit system entities before planning writes.

```text
USER REQUEST
↓
ACTOR / IDENTITY
↓
TARGET RESOLUTION
↓
SCOPE
↓
PLAN
```

Conceptual contract:

```text
target_resolution
  actor
  target_type
  target_query
  resolved_ids[]
  inaccessible_ids[]
  ambiguous_targets[]
  resolution_status
```

Do not silently broaden an ambiguous target.

# 3. OPERATING MODEL

This is the architecture contract.

USER GOAL
↓
INTENT + SCOPE
↓
CONTEXT
↓
PLAN
↓
GOVERNANCE
↓
DEPENDENCY RESOLUTION
↓
EXECUTION
↓
REVALIDATION
↓
RESULT

## Model responsibilities

The model may:

- understand language
- resolve ambiguity
- interpret intent
- form a plan
- explain state
- communicate
- adapt the conversation
- suggest next steps

## System responsibilities

The system owns:

- current project state
- governance enforcement
- permissions
- action execution
- verification
- audit history
- retries
- idempotency
- evaluation
- regression
- versioned behavior

### Critical rule

**The model can reason about governance. The model does not enforce governance.**

### Plan authority boundary

The model may propose a plan, but a proposal is not executable authority.

```text
MODEL PROPOSES PLAN
↓
TARGET VALIDATION
↓
PRECONDITION CHECK
↓
PERMISSION CHECK
↓
GOVERNANCE CHECK
↓
DEPENDENCY VALIDATION
↓
EXECUTABLE PLAN
```

Only the system-generated executable plan may reach the execution layer.

---

# 4. MISSION MODEL

A conversation may contain many turns.

The mission is the durable unit of work.

## Mission

```text
goal
scope
context
plan
dependency graph
actions
blockers
user decisions
exceptions
current state
outcome
```

## Mission states

```text
READY
ACTIVE
WAITING
EXECUTING
VERIFYING
COMPLETED

BLOCKED
FAILED
STALE
PERMISSION_DENIED
CANCELLED
PARTIALLY_COMPLETED
```

The conversation transcript is not the source of truth.

**Mission state + current system state are.**

---

# 5. AGENT SESSION STATES

Keep agent session state separate from mission state.

```text
READY
UNDERSTANDING
PLANNING
CHECKING
WAITING_FOR_USER
EXECUTING
VERIFYING
COMPLETED

ERROR
CANCELLED
```

The UI must make these states observable without pretending to reveal private model reasoning.

Do not use a generic "Thinking..." spinner for every state.

---

# 6. DEPENDENCY MODEL

The assignment's cascading conflicts are a dependency graph.

Example:

```text
Project
  ↓
Milestone
  ↓
Task
  ↓
Predecessor
  ↓
Predecessor
  ↓
Time
```

The system traverses the graph.

The user does not.

## Design rule

**Expose the shortest useful resolution path.**

The complete dependency graph remains available for deeper inspection but is not dumped into the first response.

The interaction model must not depend on a fixed depth.

---

# 7. PROGRESSIVE DISCLOSURE

The conversation should reveal complexity in this order:

1. Outcome
2. Current blocker
3. Why it is blocked
4. Shortest resolution path
5. Action available now
6. Result
7. What remains

The full dependency path can be expanded when confidence requires it.

Do not overwhelm the user with implementation detail.

Do not hide consequential state.

---

# 8. SAFE EXECUTION LOOP

Every consequential action follows:

PLAN
↓
PRECONDITION CHECK
↓
PERMISSION CHECK
↓
POLICY CHECK
↓
EXECUTE
↓
VERIFY
↓
UPDATE MISSION
↓
REVALIDATE NEXT ACTION

## Never

- claim success without verification
- execute a blocked action
- silently expand scope
- continue using stale state
- duplicate an action through an unsafe retry
- bypass authorization
- hide partial failure

---

## 8A. POLICY CONTRACT

The governance model must preserve the assignment's trigger → validation → allow/block structure.

Conceptual policy:

```text
Policy
  id
  name
  trigger
  validation[]
  severity
```

Conceptual evaluation:

```text
PolicyEvaluation
  policy_id
  target_id
  trigger_matched
  validations[]
  allowed
  blocking_reasons[]
  evidence[]
```

The model may explain a policy result but may not alter the evaluation.

## 8B. CONFLICT CONTRACT

Every user-facing blocker should contain enough structured information to resolve it without manually traversing the dependency graph.

```text
Blocker
  target
  policy
  reason
  evidence
  dependency_path
  required_change
  available_action
  required_input
  actor
  next_check
```

The conversation renders this progressively:

```text
Outcome
→ Blocker
→ Reason
→ Shortest useful path
→ Required action/input
→ Result
```

## 8C. BATCH EXECUTION

A single instruction may resolve to many actions. The execution engine must preserve dependency ordering and exact per-action outcomes.

```text
Resolve targets
↓
Build action set
↓
Dependency-aware ordering
↓
Execute independently where safe
↓
Revalidate
↓
Aggregate exact results
```

The system must explicitly handle:

- sequential vs independent actions
- dependency ordering
- cancellation during a batch
- partial failure
- bounded concurrency where relevant
- retry safety
- idempotency
- exact final-state aggregation

Do not collapse a batch to a single success/failure state.

## 8D. PERMISSION CONTRACT

Permissions are evaluated by the system, not inferred from conversational language.

```text
Permission Check
  actor
  action
  target
  permission_source
  allowed
  reason
  escalation_available
```

Do not invent Rocketlane's actual permission model. Implement an abstract permission boundary that can later connect to real authorization.

## 8E. FAILURE → RECOVERY CONTRACT

Failure taxonomy is paired with deterministic recovery behavior.

```text
Ambiguous intent       → clarify
Missing data            → request required input
Policy blocked          → explain blocker
Permission denied       → stop + explain boundary
Timeout                 → reconcile current state before retry
API failure             → retry only when safe
Duplicate request       → idempotency/reconciliation check
Concurrent change       → pause + revalidate
Cancellation            → stop execution
Partial execution       → reconcile exact final state
Wrong target            → do not write; resolve target again
```

A timeout must never be treated as proof that a write did not happen. Re-read current state before retrying a consequential action.

# 9. ACTION MODEL

Every action should have:

```text
action_id
mission_id
actor
intent
target
preconditions
permission_result
policy_result
execution_status
result
verification_status
timestamp
correlation_id
```

## Action classes

### READ
Inspect current state.

### SAFE WRITE
Execute when authorized and unambiguous.

### DECISION REQUIRED
Explain what is needed and wait for the user.

### BLOCKED
Do not execute. Explain the governing reason.

### HIGH IMPACT
Require explicit confirmation where appropriate.

Do not make the user confirm every trivial read or safe action.

---

# 10. REVALIDATION

A plan is not a fact.

The world can change while the agent works.

After every consequential action:

EXECUTE
↓
READ CURRENT STATE
↓
VERIFY
↓
CONTINUE / STOP / REPLAN

## Stale state

If the underlying project changes:

1. pause
2. identify what changed
3. identify what it affects
4. revalidate
5. replan
6. continue only if safe

User-facing copy:

> The project changed while I was working. I paused before making the next update.

Then show:

- what changed
- what it affects
- what happens next

Do not pretend the old plan is still valid.

---

# 11. USER INTERRUPTION

The user can change their mind at any time.

Example:

User:
> Complete Acme.

Agent is working.

User:
> Actually leave Go-Live open.

Required behavior:

STOP
↓
UPDATE MISSION
↓
REPLAN
↓
CONTINUE ONLY WITH NEW SCOPE

Do not finish the old plan and acknowledge the new instruction afterward.

---

# 12. PARTIAL SUCCESS

A multi-action request is not simply success/failure.

Example:

```text
12 completed
5 blocked
2 already complete
1 failed
```

The result must preserve the actual breakdown.

Never say:

> I couldn't complete your projects.

Instead:

> 12 completed.  
> 5 are blocked by governance.  
> 2 were already complete.  
> 1 could not be updated.

---

# 13. ROUTINE CHECKS + NOTIFICATIONS

This is an important extension of the conversational model.

A routine check is not a legacy notification-center workflow.

It is a mission.

Example:

> Check the project every morning. If the required condition is met, notify the owner and complete the next authorized action.

## Flow

SCHEDULE / TRIGGER
↓
CHECK CURRENT STATE
↓
POLICY / CONDITION EVALUATION
↓
IF NOT READY
→ update mission state
→ no unnecessary interruption

IF READY
→ perform authorized action
→ verify
→ notify owner in context
→ update mission
→ continue / land

## Critical distinction

A notification is not proof of completion.

If the system says:

> I notified the owner that the project is ready.

that does NOT mean:

> The project is complete.

The system only marks the project/task complete after the actual completion state is verified.

## Notification UX

Notifications should return the user to the relevant mission context.

Do not create a separate legacy notification workflow for the end user.

Example:

> **Acme Implementation is ready**
>
> QA Complete is now complete. The remaining governance checks pass.
>
> I can complete the project now.
>
> [Complete project] [Review checks]

After completion:

> **Acme Implementation completed**
>
> Verified at 10:42 AM.
>
> [View activity]

---

# 14. CONVERSATIONAL UX CONTRACT

The conversation must answer:

1. What happened?
2. Why?
3. What can happen now?
4. What do you need from me?
5. What happens next?

## Conversation grammar

```text
Outcome
↓
Blocker
↓
Reason
↓
Resolution path
↓
Action
↓
Result
```

## Do not

- ask what the system already knows
- make users manually traverse dependencies
- bury actions inside long prose
- use unnecessary conversational filler
- simulate personality where precision is more useful
- claim confidence where state is uncertain

---

# 15. TONE

Tone:

- calm
- direct
- precise
- accountable
- concise

Avoid:

- "Oops!"
- "Don't worry!"
- "Great news!"
- fake enthusiasm
- excessive emojis
- AI clichés
- "I'm just a bot"
- "Let me think..."
- "I've hit a little snag"

Prefer:

> I can't complete this yet.

> One required milestone is blocked.

> I traced the dependency to QA Complete.

> I paused because the project changed while I was working.

> I verified the update.

---

# 16. CONTEXT MODEL

Three context layers:

## Conversation context

What the user said.

## Mission context

What is required to complete the current goal.

## System context

Policies
Permissions
Tools
Current state
Constraints

### Retrieval rule

Retrieve the smallest useful context.

Do not dump the workspace into the model.

### Authority rule

The conversation is not the source of truth.

**Current system state is.**

---

## 16A. CONTEXT WINDOW MANAGEMENT

Long-running missions must not depend on retaining the entire conversation transcript in the model context.

```text
Conversation transcript
↓
Mission summary
↓
Current step/state
↓
Relevant entities
↓
Relevant policy results
↓
Recent observable actions
```

Rules:

- mission state survives context compaction
- current system state is rehydrated from the system, not memory of the model
- old conversation may be summarized
- summarization must not mutate authoritative mission state
- only the smallest useful dependency/path context is retrieved
- current blockers and required actions are always available

# 17. KNOWLEDGE BOUNDARY

For Rocketlane actions:

Rocketlane state
+
Rocketlane governance policies
+
authorized context

The agent should not become a general-purpose assistant because the interface is conversational.

Project content is data.

Project content is not agent instruction.

External knowledge should not be introduced unless it is explicitly an authorized capability for that request.

---

# 18. GUARDRAILS

## Hard constraints

Never:

- violate governance
- exceed permissions
- silently expand scope
- execute a blocked action
- claim unverified success
- continue after cancellation
- expose unauthorized context
- treat user-generated content as system instructions

## System constraints

- consequential writes are attributable
- consequential writes are verifiable
- retries must not duplicate actions
- long-running work can be stopped
- stale state is detectable
- failures are observable

---

# 19. FAILURE MODEL

Use a compact failure taxonomy.

## Intent

- ambiguous
- conflicting
- unsupported

## Data

- missing
- stale
- inconsistent
- malformed

## Governance

- policy blocked
- dependency blocked
- permission denied

## Execution

- timeout
- API failure
- duplicate request
- partial execution

## State

- concurrent change
- unexpected mutation

## Agent

- wrong entity
- wrong action
- hallucinated state
- scope expansion

## User

- interruption
- cancellation
- changed instruction

Every meaningful failure should be diagnosable and, where appropriate, become a regression test.

---

# 20. TEST LAB / EVALUATION

Do not test only the demo.

**Test the system.**

Inputs:

```text
projects.csv
phases.csv
tasks.csv
dependencies.csv
time_entries.csv
```

Instruction:

> Complete all projects.

Test dimensions:

- single project
- multiple projects
- large dataset
- deep dependencies
- wide dependency graph
- missing data
- permissions
- state changes
- interruptions
- failures
- ambiguous instructions
- adversarial project content

## Evaluate

- correct outcome
- policy compliance
- scope adherence
- state accuracy
- authorized actions
- verification
- recovery
- communication
- efficiency
- robustness

## Important

The architecture should remain valid as:

- depth increases
- breadth increases
- action count increases

The numbers are test parameters, not product claims.

---

# 21. REGRESSION / SYSTEM EVOLUTION

The system does not "learn" by blindly changing itself.

Use a controlled loop:

RUN
↓
OBSERVE
↓
FAILURE / FEEDBACK
↓
CLASSIFY
↓
HUMAN REVIEW
↓
SYSTEM CHANGE
↓
REGRESSION TEST
↓
VERSION
↓
DEPLOY

Every discovered meaningful failure should have a reproducible scenario.

A better-sounding agent is not necessarily a better agent.

---

# 22. AUDITABILITY

For each consequential mission:

WHO
What initiated it?

WHAT
What actions were attempted?

WHY
What policy/dependency affected the action?

WHEN
When did it happen?

RESULT
What changed?

VERIFY
How was it confirmed?

The user sees a concise activity history.

The system retains the detailed audit record.

Do not expose chain-of-thought.

Expose observable system activity.

---

# 23. VERSIONING

Track:

- agent version
- policy version
- dataset version
- evaluation version

A run should be explainable and, where practical, reproducible.

---

# 24. REUSABLE ARTIFACT SYSTEM

Build one reusable artifact primitive rather than one bespoke component per object.

Possible artifact types:

- project
- phase
- task
- milestone
- dependency
- policy check
- action
- test result
- activity event

Common contract:

```text
type
title
status
metadata
context
available actions
expanded detail
source
```

The artifact primitive should be composable inside conversation.

This is a developer efficiency and consistency decision.

Do not force every artifact into an identical visual shape when the semantics differ. Reuse the underlying interaction contract, not blindly identical presentation.

---

# 25. ROCKETSHIP METAPHOR

Use the metaphor as a system model, not decoration.

## Mission
What the user wants.

## Flight plan
What the agent intends to do.

## Navigation
Dependencies, policies and blockers.

## Flight status
What is happening now.

## Course correction
Reality changed.

## Abort
User stops the mission.

## Landing
Goal completed and verified.

## Black box
Activity and audit history.

## Ground control
Policies, permissions and evaluation.

Do not turn the UI into a space-themed toy.

Use the metaphor through language, state and motion.

---

# 26. MOTION / STREAMING

Motion should communicate system state, not decorate the interface.

## Streaming

When the agent is actively working:

- stream observable progress
- reveal checks as they complete
- animate the current mission state
- keep the user's original goal anchored
- never fake a long typing animation

Example:

```text
Checking project governance
✓

Tracing dependencies
→ Go-Live
→ Deploy API
→ QA Complete

Checking QA Complete
→ waiting for time requirement
```

## Dependency resolution

When a blocker is resolved:

- path contracts
- resolved node transitions to completed
- next dependency becomes active
- mission progress updates
- new blocker enters with a controlled transition

## Course correction

Use a subtle state transition:

Working
→ Paused
→ Rechecking
→ Replanned
→ Continuing

No dramatic animation.

## Landing

Completion should feel deliberate:

Verified
→ mission resolves
→ concise confirmation
→ activity becomes available

No confetti.

No cartoon rocket launch.

---

# 27. END-USER UI RULE

There is no legacy Rocketlane workflow inside this prototype.

If the user needs to:

- inspect a blocker
- resolve a supported action
- provide missing information
- approve a consequential action
- change scope
- cancel
- continue
- review what happened

the interaction should be available from the conversation.

Supporting detail can expand within the conversation.

A dedicated Test Lab is an evaluator/developer surface, not a replacement end-user workflow.

---

# 28. CORE JOURNEY

Hero scenario:

> Mark Acme Implementation as completed.

Sequence:

1. Understand project + scope.
2. Check governance.
3. Diagnose blocker.
4. Explain shortest useful path.
5. Let the user resolve the required action in conversation.
6. Revalidate.
7. Surface the next blocker.
8. Keep the original mission visible.
9. Handle a mid-flight state change.
10. Replan.
11. Continue.
12. Verify final state.
13. Land.
14. Show activity.

This is the primary Figma and coded demonstration.

---

# 29. EDGE JOURNEYS

Only four primary edge journeys need to be demonstrated:

## Normal
Blocked → Resolve → Complete

## Mid-flight change
Working → State changed → Pause → Replan

## User interruption
Working → Scope changes → Stop → Replan

## Partial success
Some complete → Some blocked → Report exact state

Do not build dozens of disconnected demos.

---

# 30. SOFTWARE ARCHITECTURE

Organize around system responsibilities, not screens.

Recommended structure:

```text
rocketlane-governance-agent/

src/
  domain/
    project/
    phase/
    task/
    dependency/
    policy/
    mission/
    action/

  agent/
    intent/
    context/
    planner/
    resolver/
    executor/
    verifier/
    conversation/

  governance/
    engine/
    rules/
    validators/
    permissions/

  execution/
    actions/
    retries/
    idempotency/
    state/

  evaluation/
    datasets/
    scenarios/
    assertions/
    runner/
    scoring/
    regression/

  ingestion/
    csv/
    normalization/
    validation/

  telemetry/
    events/
    activity/
    audit/

  ui/
    conversation/
    mission/
    artifacts/
    activity/
    test-lab/

  design-system/
    tokens/
      primitives/
      semantic/
      component/
    typography/
    motion/
    components/
    patterns/

  fixtures/
    happy-path/
    cascading-conflicts/
    failures/
    concurrency/
    adversarial/

tests/
  unit/
  integration/
  scenarios/
  regression/

docs/
  implementation-plan.md
  architecture/
  decisions/
  design-system/
  test-results/

```

Exact framework conventions can adapt to the existing project. Do not create unnecessary layers just to match this tree.

---

# 31. DOMAIN LAYER

The domain layer must be independent of UI and model behavior.

It should know:

- projects
- phases
- tasks
- subtasks
- predecessors
- time entries
- policies
- permissions
- mission state
- action state

The domain layer must not import UI components.

---

# 32. GOVERNANCE LAYER

The governance engine should return structured results.

Conceptually:

```text
allowed
policy
target
blockers
dependencies
reason
```

The conversational layer consumes these results.

The model does not override them.

---

# 33. DEPENDENCY RESOLUTION

Do not implement:

```text
if project === "Acme"
```

The resolver must traverse actual relationships in the supplied data.

It should be possible to replace the dataset without changing the resolver.

---

# 34. MISSION ENGINE

Mission state should survive conversation turns.

Conceptual model:

```text
Mission
  goal
  scope
  status
  plan
  actions[]
  blockers[]
  decisions[]
  currentStep
  outcome
```

Conversation rendering reads mission state.

It should not own the state.

---

# 35. EXECUTION ENGINE

Every write:

1. receives an action ID
2. checks preconditions
3. checks permission
4. checks policy
5. executes
6. verifies
7. updates mission
8. emits activity

If verification fails, the mission does not claim completion.

---

# 36. EVENT MODEL

Use explicit events for observable system changes.

Examples:

```text
MISSION_STARTED
PLAN_CREATED
POLICY_CHECKED
DEPENDENCY_FOUND
ACTION_REQUESTED
ACTION_APPROVED
ACTION_STARTED
ACTION_COMPLETED
ACTION_FAILED
STATE_CHANGED
MISSION_PAUSED
MISSION_REPLANNED
MISSION_COMPLETED
MISSION_CANCELLED
```

The activity UI and test harness can consume these events.

---

# 37. ROUTINE CHECK ENGINE

Routine checks should be represented as scheduled missions.

Conceptually:

```text
Routine
  trigger
  scope
  condition
  action
  notification
  completion rule
```

Example:

```text
Every morning
→ inspect project
→ check readiness
→ if ready, notify owner
→ execute authorized completion
→ verify
→ land mission
```

Do not create a separate notification-centric architecture.

Notification is an output of mission state.

---

# 38. DATA INGESTION

CSV ingestion must:

1. parse
2. validate schema
3. normalize IDs
4. validate references
5. construct domain graph
6. report invalid records
7. make dataset available to evaluation

Do not silently drop malformed records.

The evaluator needs to know what was rejected and why.

---

# 39. EVALUATION ARCHITECTURE

Conceptual flow:

```text
DATASET
↓
SCENARIO
↓
MISSION
↓
RUN
↓
EXPECTED RESULT
↓
ACTUAL RESULT
↓
ASSERTIONS
↓
SCORE
↓
REGRESSION RECORD
```

Assertions should be machine-checkable where possible.

Examples:

```text
policy_violation === false
unauthorized_write === false
unverified_completion === false
scope_expansion === false
expected_final_state === actual_final_state
```

---

# 40. CODING GATES

Do not move to the next layer until the current layer passes.

## Gate 1 — Domain

Can the same code represent multiple datasets?

## Gate 2 — Governance

Do the supplied policies evaluate deterministically?

## Gate 3 — Dependencies

Can arbitrary valid dependency chains be traversed?

## Gate 4 — Mission

Does mission state survive multiple conversation turns?

## Gate 5 — Execution

Are writes checked and verified?

## Gate 6 — Revalidation

Can state changes interrupt a plan?

## Gate 7 — Conversation

Can the user complete supported actions without leaving the conversation?

## Gate 8 — Evaluation

Can the system be tested from uploaded data?

## Gate 9 — Regression

Can a discovered failure be reproduced?

## Gate 10 — Polish

Only now optimize motion, typography, spacing and visual refinement.

---

# 41. TEST MATRIX

Before final presentation, run at minimum:

## Goal

- one project
- multiple projects

## Dependency

- no blocker
- one blocker
- nested blocker
- deeper valid chain

## Governance

- all pass
- each supplied policy blocks

## Execution

- success
- failure
- timeout
- retry

## State

- no change
- state changes during execution

## User

- continue
- cancel
- interrupt
- change scope

## Data

- valid
- missing reference
- malformed record

## Scale

- small dataset
- materially larger dataset

## Adversarial

- misleading task content
- out-of-scope request
- conflicting instruction

---

# 42. COPY RULES

Copy should be written from system state.

Never let the model invent a reason when a structured reason exists.

## Good

> I can't complete this yet.

> Go-Live is blocked by Deploy API.

> Deploy API is waiting on QA Complete.

> QA Complete has no logged time.

> I need you to provide the time entry before I can continue.

## Bad

> It looks like there might be an issue.

> Something seems to be blocking this.

> I'll try to figure it out.

> Don't worry, I've got this.

Precision over personality.

---

# 43. FINAL PRODUCT NAVIGATION

Keep the product surface small.

```text
Projects
Governance Agent
Policies
Activity
Test Lab
```

However, the end-user's operational workflow stays conversational.

The user does not leave the conversation to perform the governance work.

---

# 44. REUSABLE CONVERSATION COMPONENTS

Reuse proven Wati conversation primitives where useful.

Candidate primitives:

- message
- action
- confirmation
- status
- progress
- structured result
- expandable detail
- input
- activity
- error
- resolution block

Do not assume Wati's component API or styling can be copied directly.

First extract the interaction pattern.

Then implement the Rocketlane version.

---

# 45. WHAT NOT TO BUILD

Do not build:

- generic AI dashboard
- generic chat assistant
- fake "AI brain"
- giant dependency graph as default UI
- notification center as the primary interaction
- unnecessary agent settings
- decorative AI gradients
- excessive cards
- fake typing delays
- chain-of-thought UI
- hard-coded Acme logic
- one-off policy hacks
- dozens of disconnected screens
- feature breadth that is not required to prove the thesis

---

# 46. HUMAN-DESIGN TEST

Every important design decision should answer:

## Observation

What did we notice?

## Decision

What did we choose?

## Why

Why does it help the user?

## Tradeoff

What are we deliberately not doing?

## Proof

How does the prototype or test demonstrate it?

Example:

Observation:
A blocker can be several dependencies deep.

Decision:
Show the shortest actionable path.

Why:
The PM wants to complete the project, not learn the dependency graph.

Tradeoff:
Some system complexity stays hidden.

Proof:
The user can expand the full path when they need deeper confidence.

---

# 47. FINAL QUALITY BAR

The interviewer should not think:

> This is a polished chatbot.

They should think:

> This designer understands how an action-taking agent must behave when the underlying system is complex and the world changes while it works.

The Figma prototype proves the interaction model.

The coded prototype proves the operating model.

The Test Lab proves the system is not hard-coded to the demo.

The architecture proves the work can grow without becoming a collection of hacks.

---

# 48. FINAL DEMO STORY

Start with:

> Mark Acme Implementation as completed.

Then show:

1. Agent understands the request.
2. Agent checks governance.
3. Agent finds a blocker.
4. Agent traces the dependency.
5. Agent presents the shortest useful path.
6. User resolves the actionable issue inside the conversation.
7. Agent verifies it.
8. A deeper blocker surfaces.
9. Agent maintains mission context.
10. The underlying project changes mid-flight.
11. Agent pauses.
12. Agent explains the change.
13. Agent replans.
14. Agent continues.
15. Agent verifies completion.
16. Agent lands the mission.
17. Activity shows what happened.
18. Test Lab runs the same system against another dataset.
19. A failure is intentionally introduced.
20. The evaluator catches it.

End on:

> **The demo is one scenario. The system is the product.**

---

# 49. FIGJAM REFERENCE

The current FigJam board already has the intended conceptual structure visible in the supplied screenshots:

- Agent flow / architecture
- Results
- Rocketship mental model
- Safe execution
- Context + boundaries
- Evaluation & learning
- Core journey
- Edge cases
- Build model
- Appendix

Keep that structure. The coding work should implement it rather than create a second conceptual model.

FigJam's own current AI workflow reinforces a useful discipline: AI can accelerate organizing, summarizing and diagramming, but Figma explicitly warns that AI output may be misleading or wrong and recommends verification/cross-checking. That matches the project's core principle: use AI to accelerate work, but make the resulting system and design decisions independently verifiable. citeturn0search2turn0search4

---

# 50. BUILD ORDER — LOCKED

```text
01  Inspect existing code
02  Establish clean project boundaries
03  Domain model
04  Governance engine
05  Dependency resolver
06  Mission engine
07  Execution engine
08  Revalidation
09  Event / activity model
10  Conversational state layer
11  Reusable artifact system
12  Core conversation journey
13  Mid-flight change
14  User interruption
15  Partial success
16  Routine checks
17  Conversational notifications
18  CSV ingestion
19  Test Lab
20  Evaluation engine
21  Regression suite
22  Adversarial tests
23  Motion / streaming
24  Visual polish
25  Final verification
```

Do not reorder this to start with visual polish.

Do not build the chat UI before the underlying state model exists.

Do not use UI state as a substitute for domain state.

---

# 51. DEFINITION OF DONE

The build is not done when the hero conversation looks good.

It is done when:

- the supplied governance policies work deterministically
- dependency traversal is data-driven
- mission state persists
- actions are permission/policy checked
- actions are verified
- stale state is detected
- interruptions replan
- partial success is represented
- routine checks operate as missions
- notifications preserve mission context
- end-user work remains conversational
- artifacts are reusable
- CSV data can drive scenarios
- evaluation produces machine-checkable results
- failures can become regression tests
- the hero journey works
- the four edge journeys work
- the UI does not expose chain-of-thought
- the UI does not depend on hard-coded demo data
- the same operating model survives different valid datasets
- the final visual system is quiet, precise and native to Rocketlane
- every major design claim can be traced to either the supplied brief, an explicit design decision, or an explicit engineering requirement
- target resolution is explicit and testable
- policy evaluation preserves trigger and validation evidence
- blockers contain structured resolution information
- batch execution has deterministic ordering and exact aggregation
- permission checks are explicit and attributable
- failures have defined recovery behavior
- context can be compacted without losing mission state
- the pre-built application was audited before architectural changes
- design-token migration is documented rather than silently rewritten
- the repository is clean, reproducible and understandable when shared via Git

---

# 52. FINAL RULE FOR THE CODING AGENT

Before implementing anything, ask:

0. What exists already, and what evidence says it must change?
1. Which part of the operating model does this belong to?
2. What state does it represent?
3. What system owns that state?
4. Is this a domain rule, an agent behavior, or a UI representation?
5. Can this work with a different dataset?
6. What happens if the state changes during execution?
7. How is the result verified?
8. How will we test it?
9. Can the user complete the action conversationally?
10. Does this reduce complexity for the user without hiding consequences?

If the answer is unclear:

**stop and resolve the architecture before writing the UI.**

No drift.
No demo hacks.
No AI slop.
No invented Rocketlane behavior.
No legacy end-user workflow.

Build the system first.
Then make it beautiful.

Before handing off the repository:

- remove dead code and demo-only hacks
- verify clean build
- verify tests
- verify no secrets are committed
- verify README setup instructions
- verify implementation plan matches the final architecture
- verify design-token usage is coherent
- verify the demo still runs from the documented commands

The Git repository is a deliverable, not a dump of the working directory.
