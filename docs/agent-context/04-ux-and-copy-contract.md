# 04 — UX and copy contract

Revised 2026-09-16 after adversarial design review.

## The conversation must answer (spec §14)

1. What happened? 2. Why? 3. What can happen now? 4. What do you need from me? 5. What happens next?

Grammar: **Outcome → Blocker → Reason → Resolution path → Action → Result.** Progressive disclosure (spec §7): outcome, current blocker, why, shortest path, action available now, result, what remains. Full dependency path is an expandable detail, in place.

## Rule zero: nothing leaves the thread

A block that carries a pending decision (hours input, confirmation, batch confirmation, clarification) is never frozen by a typed turn. The reply lands above it and the block re-anchors below, so a question never costs the user the decision.

Every end-user action is a block with inline actions or an inline input. There are no modals for confirmation, inspection or input. Entity and policy references inside the thread expand **in place**; left-nav routes exist for cross-mission browsing only. Pending decisions are mission state (`WAITING`) rendered as blocks, so they survive reload.

## Canonical block list (single source; glossary mirrors this)

Templates carry `EntityRef` slots rendered as chips (shown here as **bold**). Policy references render as a metadata chip ("Policy 3"), never inside prose, with one exception: the missing-input reason line quotes the rule the person must satisfy ("Policy 4 requires hours before completion"). Pluralisation happens in the renderer.

| Block | Copy |
|---|---|
| `acknowledgement` (goal) | "Got it. I'll get **{target}** to completed." · "I'll check its governance requirements and resolve anything blocking it." Batch: "Got it. I'll work through {n} projects." · "I'll check each one's governance and report exactly what happened." A routine-origin mission asked nobody and gets none. No "Sure", "Absolutely", "Happy to help". |
| `acknowledgement` (answer) | "Got it — {value} for **{node}**." · "I'll log that, verify it, and continue with the original goal." Emitted from `INPUT_RECEIVED`, never before validation. |
| `activity` | Observable work from the audit log, one block per phase (phases end at an input, an approval, a decline or a replan). Items: icon · label · context: "Checking project **{target}**", "Checking milestones · {n} milestones", "Checking governance · {n} policies checked", "Tracing dependencies · **A** → **B** → **C**", "Logging time · {n}h", "Time verified", "Rechecking dependencies", "**{task}** · Verified", "Verifying project". The current phase is open; finished phases fold to one past-tense sentence ("Logged time, rechecked dependencies and verified 5 updates.") with "Show activity". Never "Thinking…", never an internal name. |
| `evaluation` | After any finished mission: "Evaluation" · "Governance held, every write was authorized and verified, scope was kept, and the final state matches." (or "{n} checks failed."). Evidence on demand: Governance · Authorization · Verification · Scope · Final state, each with the sentence behind the verdict; versions and write count in the detail. No score. |
| `outcome.blocked` | "I can't complete **{target}** yet." Chosen from mission state (`BLOCKED`), a pending time request, or a non-empty blocker list; never from the blocker list alone. |
| `outcome.ready` | "**{target}** can be completed. {n} updates required." + flight plan artifact list |
| `already_complete` | "**{target}** is already complete. Nothing to do." (the export carries no reliable completion date for projects, so none is claimed) |
| `blocker` | "**{node}** can't complete: {policy.rule} — {evidence}." e.g. "Go-Live can't complete: predecessor Deploy API is incomplete." / "QA Complete can't complete: no time logged." |
| `resolution_path` | "{n} updates to complete **{target}**. First: {action.label} on **{node}**." + expandable full path |
| `action_request.input` | Three lines, from the step's `RequiredInput`: reason from policy evidence "**{node}** has no logged time. {Policy} requires {field} before completion." · the question "How many hours should I log for **{node}**?" · the authorized actor "{node} is assigned to {assignees}; I'll record the hours as yours, {actor}." (or "I'll record them as your hours, {actor}."). **No field, no button: the composer is the input.** Values arrive as "2 hours", "2h", "2"; once answered, the ask freezes into the thread above the answer with the receipt "Logged 2 hours by {actor}", exactly like a button decision. Invalid values re-state the ask: "I need a number of hours for **{node}**, for example 2 or 1.5. Nothing has been logged." Empty input is not a turn. |
| `notification.blocked` | Routine origin only: "**{target}** is blocked because **{node}** has no logged time. {Policy} requires {field} before completion. I need the number of hours from the authorized actor." then the same question and actor lines. The mission stays WAITING; a person answers in the same thread. |
| `action_request.confirm` | "Complete **{target}**? {milestonesDone} milestones complete. {openTasks} tasks remain open (does not block under current policies). Status → Completed." `[Complete project] [Not now]` — the block becomes the decision record: "Confirmed by {actor} at {time}". |
| `action_request.batch_confirm` | "{n} updates across {projects} projects. One confirmation covers the set." + expandable list of the projects (the scope the user asked for: "my projects" lists only owned projects) `[Run {n} updates] [Not now]` |
| `declined` | "Not done. **{node}** stays {state}." then "Nothing was written." or "The {n} earlier updates stand; nothing further was written." The mission lands **Cancelled** (the user said no; nothing blocks it) and this block is the only stop line. |
| `consequence` | "{n} tasks remain open in **{project}**. This does not block completion under current policies." expandable list |
| `result.mismatch` | "The update did not verify. **{node}** is still {actual}. I have not marked it complete." |
| `timeout_reconciled` | "The write to **{node}** timed out. I re-read it: {actual}. Retrying once with the same request." → then `result.verified` with "1 retry, no duplicate write." |
| `state_change` | "**{project}** changed while I was working. I paused before the next update." · What changed: "**{node}** {change} by {actor} at {time}." · What it affects: "{affected}." · Next: "{next}." |
| `pause_requested` | Only when an update was in flight: "Pause requested." · "I'm finishing the update already in progress, then I'll pause. I won't start the next update." |
| `paused` | "Got it. I've paused the mission." · in flight: "The update to **{node}** was already in progress; it completed before the pause took effect and was verified." (or "did not verify, so it is not marked complete and the state was reconciled.") / otherwise "I stopped before starting the next update." · "The last verified update was **{node}**." or "No updates had been made yet." · "No further updates were started. Nothing else will change until you resume; I'll recheck the current state first." `[Resume] [Stop]` while paused. |
| `resumed` | "Got it. I'll recheck the current state before continuing." · "Resuming from the current verified state." or "Resuming requires a course correction. The project changed while this mission was paused; I rechecked the current state and updated the plan before continuing." Withdrawn before it took effect: "Got it. The pause was withdrawn before it took effect; I'm continuing." No "Would you like me to continue?" |
| `course_correction` | "Course correction. The previous plan is no longer valid; I've updated the remaining steps." Detail: "{kept} of {planned} updates still apply. Next: {action.label} on **{node}**." |
| `stale_on_resume` | "**{project}** changed since this mission was planned." + diff, then `replanned` |
| `scope_change` | "Stopped. **{node}** stays open. Continuing with {newScope}." + if any: "{n} updates completed before the change: {list}." |
| `cancelled` | "Got it. I've stopped the mission. Completed and verified work remains unchanged." · if an update was in flight: "The update to **{node}** was already in progress; it completed and was verified." · "Nothing was written." or "{n} updates completed and verified before you stopped; nothing further was started." Never a rollback claim. |
| `partial_summary` | Non-zero buckets only, each expandable: "{completed} completed." · "{blocked} blocked by governance." · "{already} already complete." · "{failed} failed — {failureClass}, state reconciled, not completed." · "{denied} not permitted." · "{cancelled} cancelled." |
| `permission_denied` | "Only the project owner can complete **{target}**. {owner} owns it." · "Ask {owner} to complete it, or switch the acting user in the Test Lab." No button until the notification primitive exists (R3/R4): a receipt for a no-op is worse than a sentence. |
| `clarification` | "Which project do you mean?" + candidate artifacts (row density) |
| `boundary` | "I can only act on projects, tasks and governance in this workspace." · unsupported scope: "I can't scope by assignee or date yet. Name a project or task and I'll take it from there." · nothing owned: "You don't own a project in this workspace. Name one and I'll check what I'm allowed to do." |
| `routine.created` | "Every morning I'll check **{target}**. If all milestones are complete I'll notify you and complete it." + routine artifact (`Run now · Pause · Stop`) |
| `routine.check.not_ready` | collapsed by default: "Checked {time}. Not ready — {blocker}." |
| `notification.ready` | "**{target}** is ready. {what changed}. The remaining governance checks pass. I can complete it now." `[Complete project] [Review checks]` |
| `landing` | "**{project}** completed." · "All required updates were completed and verified. Final state verified at {time}." + compact evidence (one check row per verified update) `[View activity]`. Per-step "Verified:" lines are not blocks; they are activity items while the mission runs. |

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
| EXECUTING | `state.working` | indeterminate hairline | "In flight · Updating **{node}**" + `[Pause]` (Esc). **Esc pauses; it never cancels.** |
| PAUSING | `state.working` | hairline continues | "Pausing · finishing the current update" |
| PAUSED | `state.paused` | still | "Paused" |
| VERIFYING | `state.working` | hairline | "Verifying" |
| RECHECKING | `state.paused` colour retained, hairline resumes | 180ms | "Rechecking" |
| REPLANNED | crossfade to `state.working` 180ms, holds 1.2s | | "Replanned — continuing" |
| COMPLETED | `state.completed` | landing sequence | "Landed" |
| ERROR | `state.error` | none | "Could not continue" |
| CANCELLED | `state.paused` | none | "Stopped" |

## Mission header (mission state) → chip

`ACTIVE · WAITING · EXECUTING · VERIFYING · PAUSED · COMPLETED · BLOCKED · FAILED · STALE · PERMISSION_DENIED · CANCELLED · PARTIALLY_COMPLETED` map to `state.*` tokens. `STALE` = `state.paused` with label "Paused — project changed" (the world paused it); `PAUSED` = `state.paused` with label "Paused" (the user did). Both resume through the same revalidating replan.

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
- **Chrome:** left nav (Projects · Governance Agent · Policies · Activity · Test Lab). One 52px mission band: goal left · current activity while working ("Preparing mission", "Checking governance", "In flight · Updating **{node}**", "Verifying", "Course correction") · state chip right · indeterminate hairline while working, solid on landing. **No operation counts anywhere in the chrome.** Composer pinned bottom. No third pinned region.
- **Icons:** every block and activity item carries a `SemanticIcon` from the contract (project, milestone, task, time, dependency, policy, blocker, person, action, execution, check, refresh, change, course, pause, error, cancel, landing), rendered with lucide at 14px, tone-coloured, subordinate to the text. Plain agent speech carries none. Never emoji, never decorative.
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
