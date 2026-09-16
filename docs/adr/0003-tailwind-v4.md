# ADR 0003: Tailwind CSS v4

**Date:** 2026-04-17
**Status:** Accepted
**Deciders:** jibinmichael

## Context

The project needs a styling solution that supports rapid UI iteration, composes well with shadcn/ui, and produces small production CSS bundles. The choice was between Tailwind CSS v3 (widely deployed, battle-tested) and Tailwind CSS v4 (newly released, CSS-native config).

## Options considered

1. **Tailwind CSS v4** — new CSS-based config via `@theme` directives in `app/globals.css`. No `tailwind.config.ts` file. Faster builds (Oxide engine). Simpler mental model.
2. **Tailwind CSS v3** — mature, ubiquitous. Config in `tailwind.config.ts`.
3. **CSS Modules + vanilla CSS** — no framework. More verbose, slower iteration.
4. **CSS-in-JS (styled-components, Emotion)** — runtime cost, server-component friction.

## Decision

We chose **Tailwind CSS v4**. It pairs naturally with shadcn/ui's CSS-variables approach, produces a smaller config surface (no JS config file to maintain), and is the direction Tailwind itself is moving. The "greenfield" nature of this project means we have no v3 migration cost to weigh against.

## Consequences

- **Positive:** Configuration lives in CSS where it's used, not in a separate JS file. Fewer moving parts.
- **Positive:** Faster builds; Turbopack + Tailwind v4 is a fast dev-loop combination.
- **Negative:** v4 is newer; some plugins and Stack Overflow answers still assume v3. Occasional friction when copying tutorials.
- **Neutral:** No `tailwind.config.ts` file exists in the repo — theme tokens live in `app/globals.css` under `@theme` blocks. This is correct, not missing.

## Revisit trigger

- If v4 has sustained stability issues or the Tailwind team deprecates it
- If we need a feature that is v3-only and not being ported

