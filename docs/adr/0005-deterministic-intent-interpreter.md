# ADR 0005: Model interpreter for language, deterministic grounding and fallback; enforcement never swappable

**Date:** 2026-09-16
**Status:** Accepted (2026-09-16)
**Deciders:** jibinmichael

## Context

The spec separates what the model may do (understand language, propose plans, explain) from what the system owns (state, governance, execution, verification) (§3). It also locks external world knowledge (§17), demands reproducible evaluation (§20, §39) and treats project content as data, never instruction (§18). The prototype must run offline, without secrets, with near-zero latency, and the Test Lab must produce identical results on identical inputs.

## Options considered

1. **Model interpreter (Claude, server action) for language, returning spans + a closed intent; deterministic grounding, fallback and oracle.** Both adapters behind one port.
1b. **Deterministic interpreter only** — reproducible and secret-free, but limited phrasing and reads as avoiding the AI question.
2. **LLM interpreter from day one (Claude via server action)** — more linguistic range, but introduces an API key, network latency, non-determinism in evaluation, and a prompt-injection surface through task names.
3. **LLM for everything including planning** — violates the plan authority boundary (§3) outright.

## Decision

We chose **Option 1** (the human's decision after review): the interpreter port returns an `IntentProposal` whose entity arguments are **spans of the user's utterance**, never free text. A deterministic grounding step resolves spans to entity ids within the mission's scope; anything ungrounded becomes `ambiguous` or `unsupported`. The model interpreter is the primary path for the live demo; the deterministic interpreter is the fallback (visible in flight status), the oracle, and the reason evaluation stays reproducible. Both are held to the same contract; the Test Lab runs both, records `interpreter_disagreement`, and recording/replay cassettes pin model answers per scenario. Framing: *the model proposes under a typed contract; the system grounds, validates and executes; the deterministic interpreter proves the model was never the authority.*

## Consequences

- **Positive:** natural phrasing in the demo; prompt-injection resistance by construction (spans only, no free-text output field); reproducible Test Lab via cassettes; the production pattern (model for language, system for authority) demonstrated rather than described.
- **Negative:** one dependency and one server-side secret; sub-second network latency on the language step; two adapters to keep in agreement (measured, not assumed).
- **Neutral:** a `ModelInterpreter` adapter can be added behind the same port; it returns spans over the utterance (never entity text), and grounding stays deterministic.

## Revisit trigger

- The human requests a model-backed interpreter for the interview (open question 1 in `docs/agent-context/03-decisions-locked.md`).
