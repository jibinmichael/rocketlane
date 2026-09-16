# Current-state report — read-only audit

**Date:** 2026-09-16
**Scope:** Phase 0 of the build spec (§0A). No source files were modified during this audit.
**Repository:** `rocketlane/` (package name still `vibe`, not a git repository yet)

---

## 1. Repository tree (excluding node_modules)

```
.cursor/rules/project.mdc      → @CLAUDE.md
.github/workflows/ci.yml        typecheck, lint, format:check, build
.husky/{pre-commit,commit-msg}  lint-staged, commitlint
AGENTS.md                       points to CLAUDE.md
CLAUDE.md                       project rules (source of truth for agents)
HANDOFF.md                      describes the *vibe* chat scaffold — stale for this project
README.md                       describes *vibe* — stale
app/layout.tsx                  loads Geist Sans/Mono (unused by CSS), title "vibe"
app/page.tsx                    "use client" home → Chatbox → router.push(/c/[id])
app/c/[id]/page.tsx             "use client" chat page, React-state messages, canvas aside
app/globals.css                 Tailwind v4 + shadcn neutral tokens + Linear-calibrated type scale
components/ui/{button,card}.tsx shadcn (Nova preset). Untouched. Keep.
components/chat/Chatbox.tsx     composer: autogrow, rotating placeholders, Tab-to-fill, mic, Skills
components/chat/ThinkingIndicator.tsx  time-phased "emotional" copy pools + eyes + timer card
components/shared/Typography.tsx  Display/H1/H2/H3/Body/Caption/Micro/Code
lib/motion.ts                   springEnter / easeExit transitions
lib/utils.ts                    cn()
hooks/, types/                  empty (READMEs only)
docs/adr/0001–0003              App Router, shadcn+Radix Nova, Tailwind v4
docs/_templates/                ADR + component-doc templates
public/*.svg                    Next.js starter assets (unused)
```

## 2. Package manager and framework

| Item | Value |
|---|---|
| Package manager | pnpm 10 (lockfile present, `node_modules` **not installed**) |
| Node | v22 installed locally; CI pins Node 20 |
| Framework | Next.js 16.2.4, App Router, Turbopack, React 19.2.4 |
| Styling | Tailwind CSS v4 (CSS-first config), `tw-animate-css`, shadcn Nova/neutral |
| Motion | `motion` 12.x (`motion/react`) |
| Icons | `lucide-react` |
| TS | strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` |
| Tests | **none** (no test runner installed) |

## 3. Build / dev / test commands

`pnpm dev · build · start · lint · typecheck · format · format:check`. No `test` script. CI runs typecheck, lint, format:check, build.

## 4. Routes and entry points

| Route | Behaviour today | Verdict |
|---|---|---|
| `/` | Chatbox only, navigates to `/c/<random>?initial=…` | Replace: becomes the Governance Agent home (mission start) |
| `/c/[id]` | Client-only transcript, no assistant, ThinkingIndicator after last user message | Replace: mission conversation reads mission state, not React message state |
| `?canvas=open` | Empty animated aside | Remove (no mapping to any system state) |

## 5. Component architecture

- Domain-folder convention is in place (`components/<domain>/`), enforced by CLAUDE.md §3.
- `components/chat/` is a **Wati-shaped** generic chat scaffold (mic, Skills, rotating "Find me the best agent for the week" suggestions). Interaction patterns worth extracting: autogrow textarea, Enter/Shift+Enter, Tab-to-fill suggestion, width-spring reveal of trailing controls, disabled state. Visual/product assumptions must not carry over (spec §0.18, §44).
- `ThinkingIndicator` conflicts directly with spec §5 ("Do not use a generic Thinking spinner"), §15 tone rules (playful copy pools) and §45 ("fake typing delays", "fake AI brain"). Its *mechanics* (time-phased state, animated copy swap, elapsed timer) are reusable for a state-driven flight status.
- `Typography` is a strong reusable base; scale is Linear-calibrated and documented.

## 6. State management

React `useState` only. Messages live in component state and are lost on reload. There is no domain state, no mission state, no persistence. This is the biggest conflict with the spec (§4, §34, Gate 4).

## 7. Domain / data model

None. No types in `types/`, no entities, no policies.

## 8. Mock / API / data layer

None. No route handlers, no server actions, no fetch.

## 9. Existing conversation implementation

Transcript = array of `{id, role, text}`; assistant never replies. Composer is functional. This is a shell, not a conversational operating model.

## 10. Design system and tokens

**Coherent:**
- shadcn neutral semantic colours in oklch (`--background`, `--foreground`, `--muted`, `--border`, `--ring`, `--destructive`, …) with `.dark` overrides.
- Typography roles: `display, h1, h2, h3, body, body-sm, caption, micro` with size/line-height/tracking/weight — good match for spec §0B "semantic text roles".
- Radius scale derived from `--radius: 0.625rem`.

**Gaps vs spec §0B:**
- No status tokens (`success / warning / info`; only `destructive`). No agent/governance **state tokens** (`ready, working, waiting, blocked, paused, error, completed`).
- No motion tokens (durations/easings live only in `lib/motion.ts` and inline in components).
- No spacing tokens beyond Tailwind defaults (acceptable; document the scale in use).
- Hard-coded one-offs: `body { background-color: #fefefe }`, canvas `#F8F8F7`, many `rgba(0,0,0,x)` text colours in `Chatbox`/`ThinkingIndicator`, `bg-black/5`, inline `boxShadow` strings. These need the §0B migration table before replacement.
- `layout.tsx` loads Geist Sans/Mono from Google Fonts but `--font-sans` uses the system stack, so the fonts are downloaded and never used (wasted request; inconsistency).

## 11. Styling architecture

Tailwind utilities in JSX, `cn()` for merging, a few inline `style` objects. `@apply` only in `globals.css` base layer. Consistent with CLAUDE.md §6.

## 12. Existing tests

None.

## 13. Environment / configuration

`.env.example` has placeholders only. No secrets found anywhere in the tree. `.gitignore` excludes `.env*` except `.env.example`.

## 14. Assets and fonts

Next.js starter SVGs in `public/` (unused). Fonts: see §10.

## 15. Current technical debt

1. Project identity is `vibe` (package name, README, HANDOFF, metadata title).
2. Two client-only pages; whole-page `"use client"` (violates CLAUDE.md boundary pattern).
3. Random ids via `Math.random()`; no persistence.
4. Unused Google Fonts request.
5. Inline colours/shadows instead of tokens.
6. No tests, no test runner.
7. Not a git repository — commit history cannot yet demonstrate process.

## 16. Reusable code (keep)

| Asset | Reuse |
|---|---|
| `components/ui/*` | as-is (sacred folder) |
| `components/shared/Typography.tsx` + doc | as-is, extend only via new tokens |
| `app/globals.css` token structure | extend with status/state/motion tokens |
| `lib/utils.ts`, `lib/motion.ts` | keep; motion values become tokens |
| `Chatbox` mechanics | extract into `ConversationComposer` (pattern reuse, not file reuse) |
| `ThinkingIndicator` mechanics | extract animated state-copy swap into `MissionFlightStatus` |
| Tooling: eslint, prettier, husky, commitlint, CI | keep; add `test` job |
| `docs/` structure + ADR templates | keep; add new sections |

## 17. Code that conflicts with the specification

| File | Conflict | Spec ref |
|---|---|---|
| `components/chat/ThinkingIndicator.tsx` | generic thinking spinner, playful copy, fake progress card | §5, §15, §45 |
| `components/chat/Chatbox.tsx` | Wati placeholders, fake mic/recording, Skills chrome | §0.18, §45 |
| `app/c/[id]/page.tsx` | transcript is the state; no mission; empty canvas aside | §4, §34, §45 |
| `app/page.tsx` | random ids, navigation-as-state | §34 |
| `HANDOFF.md`, `README.md` | describe a different product | §0C |
| `layout.tsx` metadata/fonts | wrong identity; unused font request | §0B |

## 18. Supplied data (attached exports)

The brief's Test Lab section assumes five CSVs (projects, phases, tasks, dependencies, time_entries). The **real masked export is two files** with the other concepts embedded:

| Concept | Where it lives in the export |
|---|---|
| Phase | `tasks.PhaseId`, `tasks.Phase` (per project) |
| Dependency (predecessor) | `tasks.Dependency` — **comma-separated task names**, resolved within the same project |
| Subtask | `tasks.ParentTaskId`, `tasks.ParentTask` |
| Milestone | `tasks."Is this a Billing Milestone?"` = `true` |
| Time logged | `tasks.HoursTracked` (aggregate, no entries) |
| Status vocabulary | `To do`, `In progress`, `Completed`, `Blocked`, `NA` |

Profile of the export: 31 projects, 325 tasks across 3 projects (PRJ-005, PRJ-013, PRJ-028); 48 tasks with dependencies (5 with multiple); 39 subtasks; 9 milestones; 0 unresolved dependency names; 1 duplicate task name within a project (`PRJ-028` "Project PS RAG Status" ×2 — a live ambiguity case for name-based resolution); 76 `Completed` tasks with `HoursTracked = 0` (historical states that would fail policy 4 if re-evaluated — see data contract for how the engine treats history vs transitions).

Ingestion must therefore accept the real two-file shape *and* the five-file shape from the brief, through the same normalizer. See `docs/agent-context/07-data-contract.md`.

## 19. Verdict

The scaffold's tooling, token structure, typography and shadcn base are sound and should be kept. Everything that expresses product behaviour (chat pages, Chatbox product chrome, ThinkingIndicator) conflicts with the operating model and must be replaced at the correct boundary: a pure domain/governance/mission core first, then conversation components that *render mission state*. No speculative changes were made.
