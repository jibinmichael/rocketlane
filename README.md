# Rocketlane Governance Agent

A project governance agent: a reliable action-taking system whose primary interface happens to be conversational. You state an outcome ("Mark Acme Implementation as completed"); the system resolves the target, checks governance, traces dependencies, exposes the shortest useful path, lets you act inside the conversation, executes with verification, pauses when the world changes, and lands the mission with an auditable record.

> Make the complexity disappear. Never make the consequences disappear.

**Status:** build step 02 of 25. The engine and conversation surface are being built in a locked order; see [docs/agent-context/05-build-ledger.md](docs/agent-context/05-build-ledger.md) for what exists today.

## Operating model

```
USER GOAL → INTENT + SCOPE → CONTEXT → PLAN → GOVERNANCE → DEPENDENCY RESOLUTION → EXECUTION → REVALIDATION → RESULT
```

The model (Claude) is used for one thing: turning a sentence into a structured, span-grounded intent. Everything after that is deterministic code that owns state, enforces the four supplied governance policies, executes writes, verifies them by re-reading, and revalidates before every next step. The model is never the authority. A deterministic interpreter is the fallback and the oracle, so the app runs without an API key and evaluation stays reproducible.

The four governance policies (from the brief, the only ones that exist):

1. A project cannot be completed until all milestones are complete.
2. A milestone cannot be completed while it has open subtasks.
3. A task cannot be completed while a predecessor is incomplete.
4. A task cannot be completed without time logged.

## Run it

Prerequisites: Node 20+ and pnpm 10+.

```bash
pnpm install
cp .env.example .env.local        # optional: add ANTHROPIC_API_KEY for the model interpreter
pnpm dev                          # http://localhost:3000
```

Without a key the agent runs on the deterministic interpreter and says so in its flight status.

## Test it

```bash
pnpm test              # unit, integration, scenario and regression suites
pnpm typecheck && pnpm lint && pnpm build
```

## Load a dataset

Open **Test Lab** and upload either the two-file Rocketlane export (`projects.csv`, `tasks.csv`) or the brief's five-file shape (`projects, phases, tasks, dependencies, time_entries`). The ingestion report lists every rejected row, warning and finding. The supplied export lives in [fixtures/rocketlane-export](fixtures/rocketlane-export). *(Arrives at build step 18–19.)*

## Run the evaluation

In **Test Lab**, pick or author a scenario (dataset, actor, turns, scripted world changes, fault injection, expected outcome) and run it. Assertions are machine-checkable: no policy violation, no unauthorized write, no unverified completion, no scope expansion, no stale plan executed, final state equals expected. Failures become regression records under `tests/regression`. *(Arrives at build step 20–21.)*

## Where the logic lives

- `core/` — the framework-free engine (domain, governance, resolver, mission, agent, execution, system, ingestion, telemetry, routine, evaluation). See [core/README.md](core/README.md).
- `components/` and `app/` — React renders mission and system state; it owns no domain state.
- `fixtures/` — datasets and scenarios as data.
- `tests/` — vitest.

## Key decisions

- [ADR 0004](docs/adr/0004-framework-free-core-engine.md) — framework-free `core/` with an enforced import boundary
- [ADR 0005](docs/adr/0005-deterministic-intent-interpreter.md) — model for language, deterministic grounding and fallback, enforcement never swappable
- [ADR 0006](docs/adr/0006-in-memory-system-of-record.md) — in-memory, versioned, fault-injectable system of record behind a port
- The full decision log: [docs/agent-context/03-decisions-locked.md](docs/agent-context/03-decisions-locked.md)
- The build spec (source of truth): [docs/spec/ROCKETLANE_AGENT_BUILD_SPEC.md](docs/spec/ROCKETLANE_AGENT_BUILD_SPEC.md)

## Known limitations

- Single-browser truth: the system of record is in memory, persisted per browser. A second tab is the stand-in for an external change; there is no shared server.
- Routine checks run on a browser scheduler; "every morning" fires only while a tab is open, with one catch-up on reload.
- Permissions are an abstract role boundary (owner / member / viewer), not Rocketlane's real model.
- Interpretations the brief does not settle (for example how `NA` status counts) are switches, listed as assumptions in the decision log.

## Contributing

Conventional commits, one per build step. Read [CLAUDE.md](CLAUDE.md) and [docs/agent-context/README.md](docs/agent-context/README.md) before changing anything.
