# ADR 0004: Framework-free `core/` engine with an enforced dependency boundary

**Date:** 2026-09-16
**Status:** Accepted (2026-09-16)
**Deciders:** jibinmichael

## Context

The product is an action-taking governance agent whose correctness depends on deterministic state, policy evaluation, dependency traversal, verified execution and revalidation (spec §3, §8, §10). These behaviours must be testable without a browser, must survive dataset replacement (spec §33) and must be reusable behind a real system of record later. The existing scaffold keeps all behaviour in React components.

## Options considered

1. **`core/` at repo root, pure TypeScript, ESLint-enforced import boundary** — the engine has no React/Next/motion imports; UI reads it through stores.
2. **Domain logic in `lib/`** — fits the existing folder list but mixes utilities with the product's core and has no boundary enforcement.
3. **`src/` reorganisation per the spec's recommended tree** — clean, but reorganises the working Next.js layout for its own sake (spec §0C warns against this).
4. **Server-side engine behind route handlers** — closer to production shape, but adds a network hop, hosting, and secrets to a demo that must run offline and deterministically.

## Decision

We chose **Option 1**. `core/` is the product; `app/`, `components/`, `hooks/` render it. The boundary is enforced with `no-restricted-imports` on `core/**` so it cannot erode silently.

## Consequences

- **Positive:** vitest drives the same engine as the UI and the Test Lab; scenarios are reproducible; the `SystemOfRecord` port is the seam to Rocketlane's API.
- **Negative:** one new top-level folder outside `CLAUDE.md` §1's list; requires a `CLAUDE.md` addendum.
- **Neutral:** React state is limited to view concerns; domain state lives in stores exposed via `useSyncExternalStore`.

## Revisit trigger

- A real backend appears: move `core/` behind server actions without changing its API.
