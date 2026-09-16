# ADR 0002: shadcn/ui with Radix primitives and Nova preset

**Date:** 2026-04-17
**Status:** Accepted
**Deciders:** jibinmichael

## Context

The project needs a component library that supports a professional, designer-led aesthetic (Linear, Vercel, Notion benchmarks) without locking us into a heavy runtime dependency. Components must be owned by us so designers and devs can modify them directly.

## Options considered

1. **shadcn/ui (Radix primitives, Nova preset)** — copies component source into the repo. We own every component file. No runtime library, no npm updates breaking things.
2. **Material UI (MUI)** — mature, feature-rich, but opinionated aesthetic that fights our Linear/Vercel direction. Theming is constrained.
3. **Chakra UI** — simpler than MUI, but still a runtime dependency with their own design decisions baked in.
4. **Headless UI / Radix UI directly** — full control but much more work; we'd rebuild what shadcn already does on top of Radix.
5. **shadcn with Base UI (not Radix)** — newer primitives layer by the MUI team. Less ecosystem support.

## Decision

We chose **shadcn/ui with Radix as the primitives layer and the Nova preset** (successor to "New York" style). Radix is the ecosystem default — every shadcn tutorial and AI-generated code example assumes it. Nova matches the minimal, neutral aesthetic we want.

Base color defaults to `neutral` (Nova preset default) rather than the originally-planned `zinc`. The new shadcn CLI does not expose a zinc flag; neutral is functionally near-identical. Tunable later via CSS variables if needed.

## Consequences

- **Positive:** We own every component. Can modify primitives directly without fighting a library. No runtime surprises from third-party upgrades.
- **Positive:** AI assistants (Cursor, Claude Code) generate correct shadcn code out of the box because it's what they're trained on.
- **Negative:** We are responsible for maintaining our own copies. Pulling shadcn upstream updates requires manual CLI runs (`shadcn diff`).
- **Negative:** Components live in `components/ui/` and must follow shadcn's kebab-case naming — this is the one exception to our usecase-based naming convention.

## Revisit trigger

- If shadcn stops being maintained or Radix direction shifts significantly
- If the receiving dev team has a strong existing component library they want to standardize on

