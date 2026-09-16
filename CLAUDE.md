# CLAUDE.md — Rules for AI Assistants on This Project

> This file is the source of truth for how AI coding assistants (Cursor, Claude Code, and any future agent) should behave in this repository. It is read automatically on every session. Do not treat it as optional.
>
> If you are a human reading this: these rules apply to AI-generated code only, but following them yourself will keep your PRs consistent with AI-generated ones and keep the codebase coherent.

---

## 1. Project context

**What this is:** A Next.js 16 web application built with React 19, Tailwind CSS v4, and shadcn/ui. Currently in initial setup phase.

**Stack (as of 2026-04-17):**
- Next.js 16.2.x (App Router, Turbopack)
- React 19.2.x
- TypeScript 5.x (strict mode)
- Tailwind CSS v4 (CSS-based config, no `tailwind.config.ts`)
- shadcn/ui (Radix primitives, Nova preset, neutral base color)
- pnpm as the package manager
- Node.js 20 LTS

**Key folders:**
- `app/` — Next.js App Router pages, layouts, route handlers
- `components/ui/` — shadcn primitives (vendored, see §4)
- `components/<domain>/` — usecase-specific components (see §3)
- `lib/` — utilities, shared logic, non-React code
- `hooks/` — custom React hooks
- `types/` — shared TypeScript types
- `docs/` — project documentation (see §8)
- `public/` — static assets
- `core/` — framework-free domain, governance, mission, execution, ingestion and evaluation engine. No React/Next imports (lint-enforced). See docs/agent-context/02-architecture-contract.md
- `fixtures/` — datasets and scenarios as data. Never imported by core logic.
- `tests/` — vitest unit/integration/scenario/regression suites.

---

## 2. Non-negotiables — the "no assumptions" clause

**This is the most important section of this file.**

If a function, type, prop, endpoint, env var, file path, package, pattern, API shape, or user intent is not confirmed by the codebase or by the human you are talking to — **stop and ask**. Do not guess. Do not say "probably." Do not invent.

Specifically:

- **Never invent imports.** If unsure whether a module or export exists, grep for it first. If it doesn't exist, ask.
- **Never invent props or types.** Read the actual TypeScript definition before using or extending it.
- **Never invent API endpoints or data shapes.** If you don't see the API in the codebase or documented in `docs/`, ask what it looks like before writing code that calls it.
- **Never assume environment variables exist.** Check `.env.example` or ask.
- **Never refactor code you weren't asked to modify.** Even if it looks wrong, even if you "see an opportunity to improve it." Scope creep is a bug, not a feature.
- **Never install dependencies without explicit approval.** Propose the dependency, explain why, wait for approval, then install.
- **Never disable linting, typechecking, or tests to make something pass.** If you can't solve the problem without bypassing checks, stop and ask.

If the human says "just do it" or "it's fine, assume X" — that's explicit permission and you should proceed. Absent that, assume nothing.

---

## 3. Component naming — usecase-based, not appearance-based

**Pattern:** `[Domain][Thing][ComponentType].tsx`

- **Domain** = product area (`Pricing`, `Checkout`, `Dashboard`, `Auth`, `Settings`)
- **Thing** = specific concern (`Summary`, `Plan`, `Invoice`, `Password`)
- **ComponentType** = UI primitive type (`Card`, `Dialog`, `Form`, `Table`, `Sheet`, `Banner`)

**Good:** `PricingPlanCard.tsx`, `CheckoutSummary.tsx`, `DashboardTopBar.tsx`, `DeleteAccountDialog.tsx`, `InvoiceHistoryTable.tsx`

**Bad:** `Card.tsx`, `BlueBox.tsx`, `Header.tsx`, `Modal.tsx`, `Table.tsx` (describes appearance or is too generic to find later)

**Folder structure:**

    components/
    ├── ui/                          ← shadcn primitives, see §4
    ├── pricing/                     ← all pricing-domain components here
    │   ├── PricingPlanCard.tsx
    │   └── PricingComparisonTable.tsx
    ├── checkout/
    │   └── CheckoutSummary.tsx
    └── shared/                      ← only used in 2+ domains
        └── EmptyState.tsx

**Rules:**
1. **One domain per file's location.** If a component is used in exactly one domain, it lives in that domain's folder. If and only if it gets used in a second domain, move it to `shared/`. Never pre-emptively put something in `shared/`.
2. **File name must equal exported component name.** `PricingPlanCard.tsx` exports `PricingPlanCard`. No default exports. No barrel files. No `index.tsx` re-exports.
3. **One component per file** (plus its sub-components if they're only used internally). If a sub-component is used elsewhere, it gets its own file.

---

## 4. shadcn/ui — the sacred folder

`components/ui/` contains shadcn primitives. These rules override §3:

- **Never rename files in `components/ui/`.** They use kebab-case (`button.tsx`, `card.tsx`) because that's what the shadcn CLI expects. Renaming breaks `pnpm dlx shadcn add` and update commands.
- **Modify them only when genuinely customizing the primitive.** If you need a variant, first try extending via props or composition. Only edit the primitive source itself if absolutely necessary.
- **Never add your own domain components here.** `components/ui/` is for shadcn primitives only. Your components live in `components/<domain>/`.
- **To add a new shadcn primitive:** use `pnpm dlx shadcn@latest add <name>`. Do not hand-write shadcn components. Do not copy-paste from their website.

---

## 5. Secrets and environment variables — never in the repo

**Absolute rules — no exceptions, ever:**

- **Never commit a `.env`, `.env.local`, `.env.production`, or any other `.env*` file** (except `.env.example`, which contains placeholder keys with no real values).
- **Never hardcode API keys, tokens, passwords, database URLs, webhook secrets, or any credentials** anywhere in the codebase — not in source files, not in config files, not in tests, not in comments, not in commit messages.
- **Never log secrets.** `console.log(process.env)` or similar is a security incident. If you need to verify an env var is loaded, log `Boolean(process.env.X)` instead.
- **Never put secrets in client-accessible code.** Any variable prefixed with `NEXT_PUBLIC_` is shipped to the browser in plaintext. Only non-secret values (public API URLs, feature flag names, analytics IDs that are designed to be public) may use that prefix.

**If you need a new secret:**
1. Ask the user to add it to their local `.env.local`
2. Add a placeholder entry to `.env.example` (e.g. `STRIPE_SECRET_KEY=`)
3. Reference it in code via `process.env.STRIPE_SECRET_KEY`
4. Add a runtime check that throws a clear error if the env var is missing at startup, so misconfiguration fails loudly instead of silently.

**If you notice a secret has been committed by mistake:**
Stop immediately. Do not try to "fix it" by deleting the line in a new commit — git history preserves it forever. Tell the user. The secret must be rotated at the source (regenerate the key) AND purged from git history. That is a human decision, not an AI decision.

---

## 6. Code conventions

**TypeScript:**
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- Never use `any`. If you genuinely need to escape the type system, use `unknown` + narrowing, and add a comment explaining why.
- Never use `@ts-ignore` or `@ts-expect-error` without a justifying comment that references a specific reason (external library issue, etc.).

**React (general):**
- Functional components only, no classes.
- Named exports only. No default exports.
- Props are typed via an inline `type` or a named `type` above the component. No `interface` unless genuinely extending.

**Next.js — Server Components vs Client Components:**

Server Components are the default in the App Router. Client Components are the exception, used only when genuinely needed.

**Add `"use client"` only when the component needs one of:**
- React hooks (`useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`, etc.)
- Event handlers (`onClick`, `onChange`, `onSubmit`, etc.)
- Browser-only APIs (`window`, `document`, `localStorage`, `navigator`, etc.)
- Third-party libraries that require client-side rendering (certain chart libraries, animation libraries, editors, etc.)

**Do NOT add `"use client"` if:**
- The component just renders JSX from props
- The component uses Server-only features (direct database calls, server env vars, server actions as the form action)
- You're unsure — default to Server, move to Client only when forced to

**Boundary pattern:**
When a page needs interactivity, keep the page itself a Server Component and push `"use client"` down to the smallest leaf component that needs it. For example: a `DashboardPage.tsx` (Server) that renders a `DashboardStatsCard.tsx` (Server) that contains a `DashboardFilterDropdown.tsx` (Client). Do not mark the whole page Client just because one button needs it.

**Never mix Server and Client logic in the same file.** If you find yourself wanting to, split the file.

**Next.js — data fetching:**

There are three valid ways to fetch data. Pick the right one for the situation.

1. **Fetch directly in a Server Component** — the default for read-only data on a page. Use `async` components and `await` the fetch directly. Cache via Next's `fetch` extensions.

2. **Server Actions (for mutations)** — when the user is submitting a form, clicking a button that changes server state, or performing any write. Use a function marked `"use server"` and wire it up as `action={...}` on a form or called from a Client Component.

3. **Route Handlers (`app/api/*/route.ts`)** — only when you need a traditional HTTP endpoint: webhooks from third parties (Stripe, Clerk, etc.), public APIs consumed by non-Next clients, or endpoints that need HTTP-specific features.

**Do NOT:**
- Create an API route handler just to call it from your own Next.js client code. Use a Server Action or direct Server Component fetch instead.
- Use `useEffect` + `fetch` to load data on mount if the data could have been fetched on the server. This defeats the purpose of the App Router.
- Mix data-fetching patterns within a single feature without a clear reason.

**When in doubt about data fetching:** ask. Data flow decisions compound quickly — getting one wrong early can force awkward patterns across a whole feature.

**File conventions:**
- Component files: `PascalCase.tsx` (matching the component name)
- Non-component files: `kebab-case.ts` (`user-preferences.ts`, `api-client.ts`)
- Route files (Next.js): follow Next's conventions (`page.tsx`, `layout.tsx`, `route.ts`)

**Imports — in this order, separated by blank lines:**
1. React and Next.js
2. Third-party libraries
3. Absolute imports (`@/...`)
4. Relative imports (`./...`, `../...`)
5. Type-only imports (if separated)

**Tailwind:**
- Use utility classes directly in JSX. No `@apply` except inside `app/globals.css` for base layer styling.
- Class lists longer than ~5 utilities get passed through `cn()` from `@/lib/utils` for readability and merging.

---

## 7. Process rules

**Before writing code:**
0. Read docs/agent-context/README.md and follow its session protocol. Check docs/agent-context/05-build-ledger.md for the current step and gate.
1. Propose a plan. Name the files you'll create or modify. Name the approach. Wait for approval on the plan.
2. If the plan touches files the user did not mention, flag them explicitly — "I'll also need to modify X because Y."

**While writing code:**
1. **Surgical edits.** Modify only what's needed. Do not "clean up" unrelated code you happen to see.
2. **One file at a time when possible.** For multi-file changes, show each file's edit before moving to the next.
3. **No placeholders or TODOs without a reason.** If you're stubbing something, say so explicitly and explain what it's stubbing.
4. **No explanatory comments unless the code genuinely cannot self-explain.** Code should self-document through naming. Functional directives are always allowed (e.g. `// eslint-disable-next-line ...`, `// @ts-expect-error ...`). Everything else — no.

**After writing code:**
1. State what you changed, file by file.
2. State what you did NOT change that the user might expect you to have changed.
3. Do not mark a task complete until the user has confirmed it works.

**Never do, without explicit permission:**
- Run `git commit` or `git push`. The user commits.
- Run `rm -rf` or any destructive delete.
- Modify `.gitignore`, `package.json` scripts, or any config file in `.github/`.
- Add, remove, or upgrade dependencies.
- Modify files under `components/ui/` (see §4).
- Touch `CLAUDE.md`, `AGENTS.md`, or anything under `.cursor/`.

---

## 8. Documentation — written when components stabilize

Documentation in `docs/components/` is NOT created during active iteration on a component. It is written only when a component has stabilized — i.e., it's used in production, not being reshaped week-over-week, and a future maintainer would benefit from having its gotchas captured.

When asked to create or modify a component during active development, do NOT automatically generate a matching `.md` file in `docs/components/`. Create docs only when explicitly asked.

ADRs in `docs/adr/` still follow the original policy: written for non-trivial decisions (framework choices, library picks, pattern shifts), regardless of whether the related components are stable.

---

## 9. Definition of done

A task is not done until all of the following are true:

- [ ] Code compiles (`pnpm build` succeeds)
- [ ] Typecheck passes (`pnpm typecheck` — coming in Phase 5)
- [ ] Lint passes with zero warnings (`pnpm lint`)
- [ ] Happy path tested manually in the browser
- [ ] At least one failure case considered and handled (bad input, network error, empty state)
- [ ] No `console.log`, no commented-out code, no dead code
- [ ] No hardcoded secrets, URLs, or environment-specific values
- [ ] No new dependencies that weren't explicitly approved
- [ ] Diff is reviewable — a human can understand it by reading it

---

## 10. When in doubt

If you are uncertain about anything — a pattern, a design decision, a library choice, the user's intent, whether a refactor is in scope — **stop and ask**.

Asking a question costs 30 seconds. Making the wrong assumption costs an hour of debugging, a revert, and a conversation about why the rules exist.

The user has explicitly asked for this rule to be enforced. Respect it.
