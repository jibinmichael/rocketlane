# Rocketlane Governance Agent

A project governance agent: a reliable action-taking system whose primary interface happens to be conversational. You state an outcome ("Mark Acme Implementation as completed"); the system resolves the target, checks the four governance policies, traces dependencies, shows the shortest useful path, lets you act inside the conversation, executes with verification, pauses when the world changes, and lands the mission with an auditable record.

> Make the complexity disappear. Never make the consequences disappear.

Built in one day against [the spec](docs/spec/ROCKETLANE_AGENT_BUILD_SPEC.md). Status per step: [build ledger](docs/agent-context/05-build-ledger.md). Interview walkthrough: [demo script](docs/demo-script.md).

## Operating model

```
USER GOAL → INTENT + SCOPE → CONTEXT → PLAN → GOVERNANCE → DEPENDENCY RESOLUTION → EXECUTION → REVALIDATION → RESULT
```

The model (Claude, optional) does one thing: it turns a sentence into a closed intent plus spans of that sentence. It never names entities, never sees project content as instructions, and nothing it returns is executable. Deterministic code grounds spans to ids, derives every step from the dependency closure, enforces the policies, writes, verifies by re-reading, and revalidates before each next step. A deterministic interpreter is the fallback and the oracle, so the app runs without a key and evaluation stays reproducible.

The four governance policies (from the brief; the only ones that exist):

1. A project cannot be completed until all milestones are complete.
2. A milestone cannot be completed while it has open subtasks.
3. A task cannot be completed while a predecessor is incomplete.
4. A task cannot be completed without time logged.

Where the brief is silent (for example what the `NA` status means) the interpretation is a documented switch, shown on the Policies page, never a hidden constant.

## Run it

Prerequisites: Node 20+ and pnpm 10+.

```bash
pnpm install
cp .env.example .env.local        # optional: ANTHROPIC_API_KEY enables the model interpreter
pnpm dev                          # http://localhost:3000
```

Without a key the agent runs on the deterministic interpreter and the mission band says so.

## Test it

```bash
pnpm test              # 91 tests: unit, type-level, integration, scenarios
pnpm typecheck && pnpm lint && pnpm build
```

Results and the failures found along the way: [docs/test-results](docs/test-results/2026-09-16-build-day.md).

## Load a dataset

**Test Lab → Dataset.** Load the demo workspace, the real masked Rocketlane export (`fixtures/rocketlane-export`), or upload your own two-file export (`projects.csv` + `tasks.csv`). Files are parsed in the browser; nothing leaves your machine. The ingestion report lists every rejected row, warning and finding. Name-based predecessors are resolved by longest match and fail closed.

## Run the evaluation

**Test Lab → Scenarios.** Eleven built-in scenarios run through an isolated engine (fresh system of record, virtual clock) that is the same core the conversation uses. Assertions are machine-checkable: no policy violation, no unauthorized write, no unverified completion, no scope expansion, no stale plan executed, final states, outcome. Weaken any policy in the engine and the evaluator, which judges every write against the reference policies, flags it and produces a regression record. **Play** runs a scenario through the live conversation; `/lab?run=<scenarioId>` does the same by URL.

## Where the logic lives

- `core/` — the framework-free engine. [Architecture overview](docs/architecture/overview.md) and [module contract](docs/agent-context/02-architecture-contract.md).
- `components/`, `app/`, `hooks/`, `lib/runtime.ts` — React renders mission and system state; it owns no domain state.
- `fixtures/` — datasets as data. `tests/` — vitest.
- `docs/agent-context/` — the anti-drift docs any contributor (human or agent) reads first.

## Key decisions

- [ADR 0004](docs/adr/0004-framework-free-core-engine.md) framework-free `core/` with an enforced import boundary
- [ADR 0005](docs/adr/0005-deterministic-intent-interpreter.md) model for language only, deterministic grounding and fallback, enforcement never swappable
- [ADR 0006](docs/adr/0006-in-memory-system-of-record.md) in-memory, versioned, fault-injectable system of record behind a port
- The full decision log with assumptions: [docs/agent-context/03-decisions-locked.md](docs/agent-context/03-decisions-locked.md)

## Known limitations

- **Routine checks and notifications** are designed (D-24) but not built. The home inbox orders missions that need you first; scheduled missions do not exist yet.
- **Single-browser truth.** The system of record is in memory, persisted per browser. A second tab is a real external actor via `BroadcastChannel`; there is no shared server.
- **Permissions** are an abstract role boundary (owner / member / viewer), ours, not Rocketlane's.
- **Ingestion** accepts the two-file Rocketlane export. The brief's five-file shape is designed, not built.
- **Model interpreter** verified live with Claude Haiku 4.5: eleven natural phrasings classified correctly (including adversarial and out-of-scope), 0.7–3 s per call. Its character spans are approximate; grounding snaps them to word boundaries and tolerates leading noise words, and everything downstream is deterministic. Organization-level keys need `ANTHROPIC_WORKSPACE_ID` in `.env.local`.
- **Not built:** scale dataset generator, replay cassettes for model answers, scenario authoring UI, dark-mode review.

## Contributing

Conventional commits, one per build step. Read [CLAUDE.md](CLAUDE.md) and [docs/agent-context/README.md](docs/agent-context/README.md) before changing anything.
