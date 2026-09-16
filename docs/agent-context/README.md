# Agent context — read this before touching code

This folder exists so that any coding agent (or human) can pick up the build in a fresh context window and continue **without drifting** from the operating model. It is the working memory of the project. `CLAUDE.md` governs *how* to work in this repo; these files govern *what* we are building and *why*.

## Read order (every session, in this order)

1. `CLAUDE.md` — repo rules. Non-negotiable.
2. `docs/agent-context/01-north-star-and-non-negotiables.md` — the thesis and the hard rules, condensed.
3. `docs/agent-context/02-architecture-contract.md` — module boundaries, ownership, interfaces.
4. `docs/agent-context/03-decisions-locked.md` — decisions already made. Do not re-litigate.
5. `docs/agent-context/04-ux-and-copy-contract.md` — tone, grammar, states, aesthetics, what not to build.
6. `docs/agent-context/05-build-ledger.md` — where we are. Find the current step and its gate.
7. `docs/agent-context/07-data-contract.md` — if the step touches data, ingestion, policies or the resolver.
8. `docs/spec/ROCKETLANE_AGENT_BUILD_SPEC.md` — the full spec. Consult the referenced section when a doc above cites `§N`.

The spec is the source of truth. These docs summarise it and record decisions; if they ever disagree with the spec, the spec wins and the doc gets fixed.

## Session protocol

**Before writing code**
- Locate the current step in `05-build-ledger.md`. Confirm the previous step's gate is marked passed. If it is not, run the gate. Do not skip ahead (spec §40, §50).
- Answer the ten questions in spec §52 for the change you are about to make. If any answer is unclear, stop and write the question into `03-decisions-locked.md` under "Open questions" instead of guessing.
- Propose the plan (files, approach) and wait for approval, per `CLAUDE.md` §7.

**While writing code**
- `core/**` never imports React, Next, `motion`, or anything under `components/`, `app/`, `hooks/`. The lint rule enforces it; do not disable it.
- UI components render **mission state and system state**. They never own domain state.
- Copy is generated from structured reasons (`core/agent/conversation`). Never write a user-facing sentence in a component that explains *why* something is blocked.
- Nothing is hard-coded to a project name, task name, or dataset. If you type `"Acme"` outside `fixtures/`, you are drifting.

**After writing code**
- Run `pnpm typecheck && pnpm lint && pnpm test`. Report the real output.
- Update `05-build-ledger.md`: step status, gate result, files touched, what was deliberately left out.
- If a decision was made, append it to `03-decisions-locked.md` with rationale. If an assumption was made, record it under "Assumptions awaiting confirmation".
- Never edit `docs/spec/`. Never edit `CLAUDE.md` without explicit permission.

## Drift alarms — stop if you notice any of these

- You are building a UI before the state it renders exists in `core/`.
- The model (or a mock of it) is deciding whether an action is allowed.
- A success message appears before a verification read.
- A component has a "Thinking…" spinner, a playful copy pool, or a fake delay.
- A new screen does not map to one of: `Projects · Governance Agent · Policies · Activity · Test Lab`.
- A feature is justified as "it sounds like an AI feature".
- You are about to describe how Rocketlane *actually* behaves beyond the four supplied policies.
- The Test Lab only works for the hero fixture.

## Vocabulary

Use the glossary in `06-glossary.md`. One word per concept. `Mission`, `Flight plan`, `Navigation`, `Flight status`, `Course correction`, `Abort`, `Landing`, `Black box`, `Ground control` are system concepts, not decoration (spec §25).
