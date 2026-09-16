# ADR 0001: Next.js App Router

**Date:** 2026-04-17
**Status:** Accepted
**Deciders:** jibinmichael

## Context

The project needs a React framework that supports production-grade routing, server-side rendering, and data fetching with minimal custom infrastructure. The app is intended to be handed off to a dev team and must be ready for real users.

## Options considered

1. **Next.js with App Router (React Server Components)** — current recommended default from Vercel. Built-in routing, layouts, server actions, streaming, image optimization.
2. **Next.js with Pages Router** — mature, battle-tested, but Vercel has marked it as maintenance-mode. No new features.
3. **Vite + React Router** — lighter, pure client SPA. No SSR, no built-in data fetching patterns.
4. **Remix** — competent alternative, smaller ecosystem, acquired by Shopify (uncertain direction).

## Decision

We chose **Next.js with App Router**. It is the current canonical choice for production React apps, is actively developed, and provides the right abstractions (Server Components, Server Actions, file-based routing) without us building them ourselves.

## Consequences

- **Positive:** SSR, image optimization, and routing come for free. Hiring pool is large — most React devs know Next.js. Ecosystem (deployments on Vercel, shadcn/ui, etc.) is aligned with this choice.
- **Negative:** Server Components are new and have a learning curve. Some patterns (useEffect-based data fetching) are anti-patterns here but familiar to devs coming from Pages Router or SPAs.
- **Neutral:** Locks us into Node.js runtime by default (Edge runtime available if needed).

## Revisit trigger

- If App Router development stalls or Vercel signals a new direction
- If we outgrow Next.js's constraints (extreme custom SSR logic, non-React UI)

