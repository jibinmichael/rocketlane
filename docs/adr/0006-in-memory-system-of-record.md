# ADR 0006: In-memory, versioned, fault-injectable system of record behind a port

**Date:** 2026-09-16
**Status:** Accepted (2026-09-16)
**Deciders:** jibinmichael

## Context

The agent must demonstrate verified writes, idempotent retries after timeouts, optimistic concurrency, stale-state detection and course correction (spec §8, §8E, §10). There is no Rocketlane API available to the prototype. The demo must be self-contained, and the Test Lab must inject failures and concurrent changes deterministically.

## Options considered

1. **`SystemOfRecord` port + `InMemorySystemOfRecord` with entity versions, idempotency keys, change events and fault injection (latency, timeout, fail-once, conflict).**
2. **Mock API routes in Next.js** — adds a network layer and server state to a demo that gains nothing from it; harder to drive from vitest.
3. **Static JSON with direct mutation** — cannot express versions, conflicts, or timeouts; verification would be theatre.

## Decision

We chose **Option 1**. All reads and writes go through the async port; the executor cannot inspect internal state. The system carries a persisted idempotency ledger and a **virtual clock** (no real timers in `core/`). Dataset persistence uses `BroadcastChannel`/`storage` events so a write from a second browser tab arrives as an ordinary external `StateChange`: the tab boundary is the prototype's stand-in for the network boundary. **The prototype proves the operating model, not the transport.** A `RocketlaneApiSystemOfRecord` (or a `WorkerSystemOfRecord`) would implement the same interface.

## Consequences

- **Positive:** verification is a real re-read against versioned state; timeouts are genuinely ambiguous ("write may or may not have applied") and are reconciled, not assumed; the Lab can script world changes at exact event indices.
- **Negative:** single-browser truth; no multi-user demo beyond scripted mutations.
- **Neutral:** the dataset is persisted to `localStorage` so a reload keeps the demo mid-mission; the Lab can reset it.

## Revisit trigger

- Access to a sandbox Rocketlane API or a shared backend.
