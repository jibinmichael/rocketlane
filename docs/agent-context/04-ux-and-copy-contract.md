# 04 — UX and copy contract

Revised 2026-09-16 after adversarial design review.

## The conversation must answer (spec §14)

1. What happened? 2. Why? 3. What can happen now? 4. What do you need from me? 5. What happens next?

Grammar: **Outcome → Blocker → Reason → Resolution path → Action → Result.** Progressive disclosure (spec §7): outcome, current blocker, why, shortest path, action available now, result, what remains. Full dependency path is an expandable detail, in place.

## Rule zero: nothing leaves the thread

Every end-user action is a block with inline actions or an inline input. There are no modals for confirmation, inspection or input. Entity and policy references inside the thread expand **in place**; left-nav routes exist for cross-mission browsing only. Pending decisions are mission state (`WAITING`) rendered as blocks, so they survive reload.

## Canonical block list (single source; glossary mirrors this)

Templates carry `EntityRef` slots rendered as chips (shown here as **bold**). Policy references render as a metadata chip ("Policy 3"), never inside prose. Pluralisation happens in the renderer.

| Block | Copy |
|---|---|
| `outcome.blocked` | "I can't complete **{target}** yet." Chosen from mission state (`BLOCKED`), a pending time request, or a non-empty blocker list; never from the blocker list alone. |
| `outcome.ready` | "**{target}** can be completed. {n} updates required." + flight plan artifact list |
| `already_complete` | "**{target}** is already complete. Nothing to do." (the export carries no reliable completion date for projects, so none is claimed) |
| `blocker` | "**{node}** can't complete: {policy.rule} — {evidence}." e.g. "Go-Live can't complete: predecessor Deploy API is incomplete." / "QA Complete can't complete: no time logged." |
| `resolution_path` | "{n} updates to complete **{target}**. First: {action.label} on **{node}**." + expandable full path |
| `action_request.input` | "I need hours for **{node}**." · "Logged as {actor}." · inline numeric field · `[Log time]`. Hours are never prefilled. |
| `action_request.confirm` | "Complete **{target}**? {milestonesDone} milestones complete. {openTasks} tasks remain open (does not block under current policies). Status → Completed." `[Complete project] [Not now]` — the block becomes the decision record: "Confirmed by {actor} at {time}". |
| `action_request.batch_confirm` | "{n} updates across {projects} projects." list with per-item opt-out `[Run {n} updates] [Not now]` |
| `declined` | "Not done. **{node}** stays {state}." then "Nothing was written." or "The {n} earlier updates stand; nothing further was written." The mission lands **Cancelled** (the user said no; nothing blocks it) and this block is the only stop line. |
| `consequence` | "{n} tasks remain open in **{project}**. This does not block completion under current policies." expandable list |
| `result.verified` | "Verified: **{node}** is {state}." |
| `result.mismatch` | "The update did not verify. **{node}** is still {actual}. I have not marked it complete." |
| `timeout_reconciled` | "The write to **{node}** timed out. I re-read it: {actual}. Retrying once with the same request." → then `result.verified` with "1 retry, no duplicate write." |
| `state_change` | "**{project}** changed while I was working. I paused before the next update." · What changed: "**{node}** {change} by {actor} at {time}." · What it affects: "{affected}." · Next: "{next}." |
| `replanned` | "Replanned. {kept} of {planned} updates still apply. Next: {action.label} on **{node}**." |
| `stale_on_resume` | "**{project}** changed since this mission was planned." + diff, then `replanned` |
| `scope_change` | "Stopped. **{node}** stays open. Continuing with {newScope}." + if any: "{n} updates completed before the change: {list}." |
| `cancelled` | "Stopped. Nothing was written." or "Stopped. {n} updates completed before you cancelled; nothing further was written." |
| `partial_summary` | Non-zero buckets only, each expandable: "{completed} completed." · "{blocked} blocked by governance." · "{already} already complete." · "{failed} failed — {failureClass}, state reconciled, not completed." · "{denied} not permitted." · "{cancelled} cancelled." |
| `permission_denied` | "Only the project owner can complete **{target}**. {owner} owns it." · "Ask {owner} to complete it, or switch the acting user in the Test Lab." No button until the notification primitive exists (R3/R4): a receipt for a no-op is worse than a sentence. |
| `clarification` | "Which project do you mean?" + candidate artifacts (row density) |
| `boundary` | "I can only act on projects, tasks and governance in this workspace." |
| `routine.created` | "Every morning I'll check **{target}**. If all milestones are complete I'll notify you and complete it." + routine artifact (`Run now · Pause · Stop`) |
| `routine.check.not_ready` | collapsed by default: "Checked {time}. Not ready — {blocker}." |
| `notification.ready` | "**{target}** is ready. {what changed}. The remaining governance checks pass. I can complete it now." `[Complete project] [Review checks]` |
| `landing` | "**{project}** completed. Verified at {time}." `[View activity]` |

## Tone (spec §15, §42)

Calm, direct, precise, accountable, concise. First person for the agent's own actions ("I paused", "I verified", "I have not marked it complete"). No exclamation marks. No apology theatre. Explicit uncertainty only where state is genuinely unknown (a timed-out write), and it is resolved in the same block.

**Banned:** Oops · Don't worry · Great news · snag · Let me think · Thinking… · I'm just a bot · emojis in agent copy · "AI" · resolver jargon ("shortest path", "closure", "resolving target") in user-facing copy.

## Flight status (session state) → visual

| Session state | Token | Motion | Label |
|---|---|---|---|
| READY | `state.ready` | none | "Ready" |
| UNDERSTANDING | `state.working` | 1px indeterminate hairline | "Finding the target" |
| PLANNING | `state.working` | hairline | "Planning" |
| CHECKING | `state.working` | checks reveal (see cadence rule) | "Checking governance" / "Tracing dependencies" |
| WAITING_FOR_USER | `state.waiting` | still | "Waiting for you" |
| EXECUTING | `state.working` | **determinate** hairline when total known: "{done} of {total}" | "Updating **{node}**" + `[Stop]` (Esc) |
| VERIFYING | `state.working` | hairline | "Verifying" |
| RECHECKING | `state.paused` colour retained, hairline resumes | 180ms | "Rechecking" |
| REPLANNED | crossfade to `state.working` 180ms, holds 1.2s | | "Replanned — continuing" |
| COMPLETED | `state.completed` | landing sequence | "Landed" |
| ERROR | `state.error` | none | "Could not continue" |
| CANCELLED | `state.paused` | none | "Stopped" |

## Mission header (mission state) → chip

`ACTIVE · WAITING · EXECUTING · VERIFYING · COMPLETED · BLOCKED · FAILED · STALE · PERMISSION_DENIED · CANCELLED · PARTIALLY_COMPLETED` map to `state.*` tokens. `STALE` = `state.paused` with label "Paused — project changed".

## Motion tokens and rules

`--motion-fast: 120ms` · `--motion-normal: 180ms` · `--motion-slow: 260ms` · `--ease-out: cubic-bezier(0.32, 0.72, 0, 1)` · `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`. Spring only for composer trailing controls. `prefers-reduced-motion` disables all non-essential transitions.

- **Reveal cadence is a legibility aid, not simulated latency:** max 6 staggered items at 60ms; beyond 6, reveal as one group. Block ids are content-derived so a block never re-animates because state changed elsewhere.
- **Path contraction (blocker resolved):** node status crossfade 180ms ease-out → row collapse 260ms ease-in-out → next blocker enters after 60ms with 120ms fade.
- **Course correction:** working → paused (180ms colour crossfade) → rechecking → replanned (holds 1.2s) → continuing. No bounce.
- **Landing:** three beats, total under 600ms: block settles 2px **down** + opacity (260ms) → header chip crossfades to "Landed" (180ms) → activity row reveals after 120ms. No confetti, no rocket.

## Aesthetic (Linear + Notion, product-native)

- **Type:** system stack. UI 13px, body 14–15px, headings tight tracking, tabular numerals for counts and times.
- **Colour:** existing neutral oklch scale. One restrained accent chosen at Gate 10 from two candidates. Status colours desaturated (~60% chroma of defaults).
- **Surfaces:** hairline `--border`, radius 6–10px, shadows only on floating layers. Rows and dividers by default; a bounded surface only when the artifact needs one (`density: "block"`).
- **Density:** 32–36px rows, 8px grid, 720px thread column, 220px left nav.
- **Chrome:** left nav (Projects · Governance Agent · Policies · Activity · Test Lab). One 52px mission band: goal left · current activity while working · "{done} of {total} updates" · state chip right · hairline bottom border. Composer pinned bottom. No third pinned region.
- **Scroll rule:** stick to bottom only if the user is within 80px of it; otherwise a pill in the band labelled with the mission state, e.g. "Paused — project changed ↓".
- **Agent home:** composer at the **top** ("What do you want done?"), missions listed below as `mission` artifacts, needs-input first. The home is the inbox; there is no notification center. Starting a mission routes to `/m/[id]`.
- **Post-landing rule:** read intents stay in the thread; write intents start a new mission with "from mission {id}" in its band.
- **Empty states:** one sentence + one action. No illustrations.

## Artifact contract (spec §24, revised)

```
type · title · status { primary, secondary? } · metadata[] · context · actions[] { label, class: READ|SAFE_WRITE|DECISION_REQUIRED|HIGH_IMPACT, disabledReason? } · expandedDetail · source · density: "row"|"block"
```
Button hierarchy derives from `class`. Types: project, phase, task, milestone, policy check (validation list with evidence), action (execution × verification status), test result, activity event, routine, mission, blocker. **Compositions:** `ArtifactPathList` (ordered task artifacts), `ArtifactList`. Dependency is a relationship rendered by the path composition, not a standalone artifact.

Components: `ArtifactShell` (primitive) · `ArtifactProjectRow` · `ArtifactTaskRow` · `ArtifactPolicyCheckList` · `ArtifactActionRow` · `ArtifactTestResultRow` · `ArtifactActivityRow` · `ArtifactRoutineRow` · `ArtifactMissionRow` · `ArtifactPathList`.

## What not to build (spec §45)

Generic AI dashboard · generic chat assistant · fake "AI brain" · dependency graph as default view · notification center · agent settings · gradients · excessive cards · fake typing delays · chain-of-thought UI · hard-coded Acme logic · one-off policy hacks · disconnected screens · modals for decisions.

## Reference imagery held by the human

Zapier Agents (agents list, "Needs action" table, trigger + instructions composer) and a Linear agent demo. Extract: list density, status chips, needs-action surfacing, quiet tables. Do not extract: purple CTA, template gallery, third-party app chips.
