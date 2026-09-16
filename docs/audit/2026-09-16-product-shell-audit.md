# Product shell audit (final product-direction brief)

Date 2026-09-16. Tree clean at the start; 395 tests in 26 files; Next 16 App Router; pnpm.

**CURRENT.** A 220px left sidebar ([AppShellNav](../../components/shared/AppShellNav.tsx), now removed) listed Governance Agent · Projects · Policies · Activity · Test Lab, with "Acting as" pinned at the bottom. The home read "What do you want done?" with a composer and a "Missions" list of `goal · Needs you · state · time`. The Test Lab was one page (upload, acting user, simulate the outside world, missions with evaluations). Routes `/projects` and `/policies` existed with no inbound links except the sidebar.

**PROBLEM.** The shell presented the architecture as product modules. The home was generic. The evaluator lived in a destination instead of in the agent. History rows exposed state, not outcome.

**EVIDENCE.** Screenshot of the landing page; `AppShellNav` surfaces array; `MissionHomeList` heading; `ArtifactMissionRow` rendering `progress` and a state chip; `/lab`, `/projects`, `/policies` pages; grep shows nothing links to `/projects` or `/policies` except the sidebar.

**ROOT CAUSE.** The shell was built bottom-up from the spec's navigation list (§43) before the agent-first thesis was settled.

**PROPOSED CHANGE.** Remove the sidebar and the module routes. One restrained header: a fabricated Acme mark and name on the left; on the right the acting user's name opening a small workspace dialog (acting as, project data, simulate the outside world). Home: "Your projects are already moving. I'll help keep them on course." · support line · composer · trust line · "Test with project data" affordance that expands the upload panel in place · "Previous missions" rows showing outcome buckets and relative time, each reopening the persisted mission. Landing block gains "{n} updates completed · {f} failed". Resume copy per brief §18.

**ARCHITECTURAL IMPACT.** None in `core/`. Runtime unchanged. Upload still goes through `runtime.loadCsv` and the same ingestion; the engine never learns which dataset it runs on.

**UI IMPACT.** New `AppHeader`, `WorkspaceMenu`, `AgentDataPanel`, `MissionHistoryRow`; rewritten `MissionHomeList`; deleted `AppShellNav`, `ArtifactMissionRow`, `components/lab/*`, `components/projects/*`, `components/policies/*`, `app/lab`, `app/projects`, `app/policies`. `/activity` stays as the deep audit behind "View activity"; `/m/[id]` unchanged.

**EVENT IMPACT.** None.

**TEST PLAN.** Full gate; renderer test for the landing count line; pause/resume copy assertion; browser: landing copy and header, mission from the composer, history row reopens the mission, upload from the home, second dataset through the same agent with evaluation, workspace menu changes the acting user and simulates a change.

**WHAT WILL NOT CHANGE.** Governance, resolver, mission model, execution, permissions, verification, revalidation, pause/resume/cancel, evaluation engine, ingestion contract, fixtures, scenario tests, tokens.
