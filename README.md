# Rocketlane Governance Agent

A project governance agent: a reliable action-taking system whose primary interface happens to be conversational. You state an outcome ("Mark Acme Implementation as completed"); the system resolves the target, checks the four governance policies, traces dependencies, shows the shortest useful path, lets you act inside the conversation, executes with verification, pauses when the world changes, and lands the mission with an auditable record.

> Make the complexity disappear. Never make the consequences disappear.

Built in one day against [the spec](docs/spec/ROCKETLANE_AGENT_BUILD_SPEC.md). What exists, where, and what is next: [state of the build](docs/state-of-the-build.md). Status per step: [build ledger](docs/agent-context/05-build-ledger.md). Interview walkthrough: [demo script](docs/demo-script.md). Independent testing: [QA handoff prompt](docs/qa-handoff-prompt.md). Product-shell audit: [docs/audit](docs/audit/2026-09-16-product-shell-audit.md).

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

Where the brief is silent (for example what the `NA` status means) the interpretation is a documented switch in [the data contract](docs/agent-context/07-data-contract.md), never a hidden constant.

## Run it

Prerequisites: Node 20+ and pnpm 10+.

```bash
pnpm install
cp .env.example .env.local        # optional: ANTHROPIC_API_KEY enables the model interpreter
pnpm dev                          # http://localhost:3000
```

Without a key the agent runs on the deterministic interpreter alone; with one, Claude reads the sentence and the grammar can still veto a guess. Live build: https://rocketlane-one.vercel.app (Rocketlane export, model interpreter on).

## Test it

```bash
pnpm test              # 398 tests in 28 files: unit, type-level, integration, scenarios, qa, regression
pnpm typecheck && pnpm lint && pnpm build
```

Results and the failures found along the way: [docs/test-results](docs/test-results/2026-09-16-build-day.md).

## Load a dataset

The workspace opens on the masked Rocketlane export (`fixtures/rocketlane-export`, 31 projects, 325 tasks). **Test any project files**, inside the composer, uploads your own two-file export (`projects.csv` + `tasks.csv`); the demo workspace (`fixtures/cascading-conflicts`) loads the same way. Files are parsed in the browser; nothing leaves your machine. The panel says what loaded and lists every rejected row, warning and finding. Name-based predecessors are resolved by longest match and fail closed. Then state an outcome: the same agent runs against whatever is loaded.

## Run the evaluation

Every finished mission ends with an **Evaluation** block: governance, authorization, verification, scope and final state, judged from the mission's audit log and a fresh read of the system, with exact execution buckets. Twelve deterministic scenarios (`pnpm exec vitest run tests/scenarios`) run through an isolated engine that is the same core the conversation uses, including a weakened-policy run the evaluator catches; committed regression records replay under `pnpm test`.

## Repository map

```
app/            routes (home, /m/[missionId]) and the one server action (model interpreter)
components/     agent/ (upload, workspace label) · conversation/ (thread, blocks, composer)
                mission/ (home, history, activity column, path) · shared/ (chips, icons, mark)
core/           framework-free engine: domain · governance · resolver · mission · agent
                execution · system · ingestion · telemetry · evaluation
hooks/          React bridges: runtime snapshot, paced reveal, hover card placement
lib/            runtime (client composition root), suggestions, motion tokens, labels
fixtures/       datasets as data: the Rocketlane export, the demo workspace, stress shapes
tests/          unit · integration · scenarios · qa · regression
docs/           spec · agent-context (read first) · adr · architecture · design · audit
```

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
- **No Test Lab, no module navigation.** The agent is the product: one header (workspace mark, chat history, the acting user and dataset as a label), the home with its composer and suggested outcomes, the mission thread with its activity column, and the upload dialog. The acting user is the owner of the deepest cascade in the loaded data. Outside-world simulation and fault injection live in the test suite and the scenario runner, not in the UI.
- **Not built:** replay cassettes for model answers, scenario authoring UI, dark-mode review. (The scale generator exists at `fixtures/stress/scale/generate.mjs`; committed regression records live in `tests/regression/` and replay under `pnpm test`.)
- **QA'd adversarially:** 398 tests across 28 files, including ten synthetic exports that stress every shape the real export can take (`fixtures/stress`) and 216 adversarial engine tests (`tests/qa`). Behaviour decisions taken during QA are listed in `docs/agent-context/03-decisions-locked.md` (Q-01..Q-08).

## Contributing

Conventional commits, one per build step. Read [CLAUDE.md](CLAUDE.md) and [docs/agent-context/README.md](docs/agent-context/README.md) before changing anything.
