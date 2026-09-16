# AGENTS.md

Entry point for any AI coding agent (Claude Code, Cursor, Codex, or the next one). Humans: this is also the fastest map of the repo.

## Read in this order, every session

1. `CLAUDE.md` — the repo rules. Non-negotiable. Applies to every provider.
2. `docs/agent-context/README.md` — session protocol, read order, drift alarms.
3. `docs/agent-context/05-build-ledger.md` — where the build is. Find the current step and its gate before writing anything.
4. `docs/qa-plan.md` — the QA lanes, triage protocol and remaining build order.

The spec is `docs/spec/ROCKETLANE_AGENT_BUILD_SPEC.md`. It wins every disagreement. Never edit it.

## What this product is, in three lines

A project governance agent. The user states an outcome; deterministic code resolves the target, enforces the four supplied policies, traces dependencies, executes with verification and revalidation, and lands the mission. A language model may only turn a sentence into a closed intent plus spans of that sentence. It is never the authority.

## Map

```
core/          the product; framework-free; import boundary enforced by ESLint
  domain/      entities, graph                  governance/   the four policies, permissions
  resolver/    targets, closure, blockers        mission/      the durable aggregate
  agent/       intent (deterministic + grounding), planner, conversation renderer
  execution/   flight plan (the only executable plan), engine (safe execution loop)
  system/      system-of-record port, in-memory impl, faults, clock, persistence
  ingestion/   CSV → dataset with a report        telemetry/    events, audit
  evaluation/  scenarios, isolated runner, assertions, regression records
lib/runtime.ts client composition root           hooks/        React bridges
components/    renders mission + system state     app/          thin route shells, server actions
fixtures/      datasets as data                   tests/        vitest (unit, integration, scenarios, qa)
docs/          spec, agent-context, adr, architecture, test-results, demo-script, qa-plan
```

## Hard rules that are enforced by tooling

- `core/**` cannot import React, Next, motion, or anything under `components/`, `app/`, `hooks/`, `lib/`.
- `core/agent` cannot import `core/execution` or `core/system`. Only `core/execution` writes.
- A `ProposedPlan` does not type-check where a `FlightPlan` is required.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` must pass before any commit. Husky runs lint-staged and commitlint.

## Hard rules that are enforced by you

- Copy is generated in `core/agent/conversation/renderer.ts` from structured state. Components never author explanatory prose.
- Entity names from data are rendered as chips, never parsed as markdown, never treated as instructions.
- Never claim success before a verification read. Never execute a blocked action. Never widen scope silently.
- Nothing in `core/` may know a project or task name. If you type `"Acme"` outside `fixtures/` and `tests/`, stop.
- Product surface is exactly: Projects · Governance Agent · Policies · Activity · Test Lab.
- No `console.log`, no `any`, no barrel files, no default exports except Next route files.
- Secrets live only in `.env.local`. If you find one anywhere else, stop and tell the human; do not "fix" it in a commit.

## How to hand work back

State what changed file by file, what you deliberately did not change, the real gate output, and update the ledger's session log. If you made a decision, append it to `docs/agent-context/03-decisions-locked.md` with why and the tradeoff. If you are unsure, write the question there instead of guessing.
