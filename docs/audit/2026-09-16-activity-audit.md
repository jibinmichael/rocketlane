# Activity audit (agent-first correction)

Date 2026-09-16. Inspected the repository and the running browser build before changing anything.

**Current.** A route `/activity` rendered `ActivityTimeline`: a page with a heading, one sentence, and a bordered list of every audit event across all missions (time · dot · label · refs · actor), optionally filtered to one mission by `?mission=`. It was not in the primary navigation (the sidebar was removed in the shell rework) but two things still navigated to it: the landing block's "View activity" action (`view_activity` → `router.push('/activity?mission=…')`) and the "View the full activity log" follow-up chip. Rows were a five-column grid, effectively a table.

**Problem.** Inspecting evidence pulled the user out of the mission into a second surface with its own mental model (a workspace-wide feed, a grid, "show all"). The information there was the same event log the conversation already renders as activity blocks, presented as implementation detail (event names, actor column, second-resolution timestamps) rather than as this mission's evidence. Landing said "View activity" and then left the conversation.

**Evidence.** `app/activity/page.tsx`; `components/activity/ActivityTimeline.tsx` (grid rows, `EVENT_LABEL` map, cross-mission default, "show all" link); `ConversationThread.onAction` pushing the route; the follow-up chip label; screenshots of the landed mission and the activity page.

**Root cause.** The page was built as the spec's "black box" surface when the shell still had modules. The shell became agent-first; the black box stayed a destination.

**Recommendation.** Audit data ≠ activity product. Keep the event log untouched and make "View activity" contextual: a side panel over the mission, chronological, human-readable first, with the audit evidence one toggle away. Remove the route.

**What to keep.** `EventLog`, every event type and its structured `detail`, persistence, the renderer's activity blocks, the evaluation block and its evidence, `view_activity` as a block action, the human-readable event labels.

**What to remove.** `app/activity/page.tsx`, `components/activity/ActivityTimeline.tsx` (dead once the panel exists), the route push, the "full activity log" wording.

**What to move.** The event label map and the ref-labelling helper into the new `MissionActivityPanel`, scoped to one mission.

**Architectural impact.** None in `core/`. The runtime's `act()` still accepts `view_activity` (a no-op there); the surface decides how to show it. One event model, two representations: the conversation's activity blocks (level 3) and the panel's audit detail (level 4).

**UI impact.** New `components/mission/MissionActivityPanel.tsx`: right-side panel, `role="dialog"`, Esc and backdrop close, focus returns to where it was. Header "Mission activity · {goal}"; a count line; a "Show audit detail" toggle; a timeline with square markers toned by event kind, each row label · refs → chain · reason · verified, and under the toggle a definition list with event type, actor, targets, every structured detail key, and the event id. Follow-up chip renamed "View activity". Routes drop from four to three.

**Data impact.** None. Events are read from `snapshot.events` filtered by mission id; nothing is hardcoded.

**Test plan.** Gate (typecheck, lint, format, 395 tests, build with `/activity` gone). Browser: start a mission, hit the hours blocker, answer, confirm, land; "View activity" opens the panel over the mission with this mission's events; "Show audit detail" reveals actor, targets, detail and ids; Esc closes and the conversation is exactly where it was; a previous mission reopens from the history dropdown with its own evidence; no Activity item exists anywhere in navigation.

**Design test.** "If I removed the Activity page, would the system become less auditable?" No. Every record it showed is still in the event log and now visible in context, with more detail than before.
