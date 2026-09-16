import { describe, expect, it } from "vitest"

import { activityPhases } from "@/core/agent/conversation/activity"
import type { Inline } from "@/core/agent/conversation/blocks"
import { renderMission } from "@/core/agent/conversation/renderer"
import { evaluateMission } from "@/core/evaluation/mission-evaluation"
import type { Mission } from "@/core/mission/mission"
import { harness } from "../helpers/engine"

const flat = (line: readonly Inline[] | null) =>
  (line ?? [])
    .map((i) => (i.kind === "text" ? i.text : i.kind === "entity" ? i.label : ""))
    .join("")

const stepByLabel = (mission: Mission, label: string, transition = "COMPLETED") =>
  mission.plan.find((s) => s.label === label && s.transition === transition)!

/**
 * Observable work is derived from the audit log, phase by phase; nothing is scripted. The hero is
 * the fixture, the derivation is the product.
 */
describe("activity: observable work from real events", () => {
  it("phase 0: checks the project, milestones, governance and traces the chain to the blocker", async () => {
    const h = harness()
    const mission = await h.engine.start(
      h.propose(h.actor("Priya Raman"), "Mark Acme Implementation as completed", [
        h.project("Acme Implementation"),
      ]),
      { datasetId: "x" },
    )
    const phases = activityPhases(mission, h.sor.current(), h.events.forMission(mission.id))
    expect(phases).toHaveLength(1)
    const items = phases[0]!.items
    expect(items.map((i) => `${i.icon}:${i.label}`)).toEqual([
      "project:Checking project",
      "milestone:Checking milestones",
      "policy:Checking governance",
      "dependency:Tracing dependencies",
    ])
    expect(flat(items[0]!.detail)).toBe("Acme Implementation")
    expect(flat(items[1]!.detail)).toBe("2 milestones")
    expect(flat(items[2]!.detail)).toBe("4 policies checked")
    expect(flat(items[3]!.detail)).toBe("Go-Live → Deploy API → QA Complete")
    expect(flat(phases[0]!.summary)).toBe(
      "Checked the project, checked milestones, checked governance and traced dependencies.",
    )
  })

  it("after the answer: a new phase logs time, rechecks, and verifies each update; the earlier phase folds", async () => {
    const h = harness()
    let mission = await h.engine.start(
      h.propose(h.actor("Priya Raman"), "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    mission = await h.engine.provideInput(
      mission.id,
      stepByLabel(mission, "QA Complete", "TIME_LOGGED").id,
      2,
    )
    const events = h.events.forMission(mission.id)
    const phases = activityPhases(mission, h.sor.current(), events)
    expect(phases).toHaveLength(2)
    const labels = phases[1]!.items.map((i) => `${i.icon}:${i.label}`)
    expect(labels.slice(0, 3)).toEqual([
      "time:Logging time",
      "check:Time verified",
      "refresh:Rechecking dependencies",
    ])
    expect(labels.filter((l) => l.startsWith("check:") && l !== "check:Time verified")).toEqual([
      "check:QA Complete",
      "check:Deploy API",
      "check:Go-Live",
      "check:Train admins",
      "check:Training Complete",
    ])
    expect(flat(phases[1]!.items[0]!.detail)).toBe("2h")

    // Rendered: acknowledgement → folded phase 0 → blocker chain → acknowledgement of the answer →
    // open phase 1 → the one genuine decision.
    const blocks = renderMission(mission, h.sor.current(), events)
    // The blocker itself is resolved by now, so no chain is re-stated; the outcome line records
    // that the mission started blocked.
    expect(blocks.map((b) => b.type)).toEqual([
      "acknowledgement",
      "activity",
      "outcome.blocked",
      "acknowledgement",
      "activity",
      "action_request.confirm",
    ])
    expect(blocks[1]!.collapsed).toBe(true)
    expect(blocks[4]!.collapsed).toBe(false)
    expect(blocks[3]!.lines.map(flat)).toEqual([
      "Got it — 2 hours for QA Complete.",
      "I'll log that, verify it, and continue with the original goal.",
    ])
    expect(blocks[0]!.lines.map(flat)).toEqual([
      "Got it. I'll get Acme Implementation to completed.",
      "I'll check its governance requirements and resolve anything blocking it.",
    ])
  })

  it("landed: every phase folds, the landing carries compact evidence, the evaluation follows", async () => {
    const h = harness()
    let mission = await h.engine.start(
      h.propose(h.actor("Priya Raman"), "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    mission = await h.engine.provideInput(
      mission.id,
      stepByLabel(mission, "QA Complete", "TIME_LOGGED").id,
      2,
    )
    mission = await h.engine.approve(mission.id, stepByLabel(mission, "Acme Implementation").id)
    const events = h.events.forMission(mission.id)
    const blocks = renderMission(mission, h.sor.current(), events)
    const types = blocks.map((b) => b.type)
    expect(types.filter((t) => t === "activity").length).toBe(3)
    expect(blocks.filter((b) => b.type === "activity").every((b) => b.collapsed)).toBe(true)
    expect(types[types.length - 2]).toBe("landing")
    expect(types[types.length - 1]).toBe("evaluation")
    const landing = blocks[types.length - 2]!
    expect(flat(landing.lines[0]!)).toBe("Acme Implementation completed.")
    expect(landing.activity?.map((i) => i.label)).toEqual([
      "QA Complete",
      "Deploy API",
      "Go-Live",
      "Train admins",
      "Training Complete",
    ])
    expect(types).not.toContain("result.verified")

    const evaluation = evaluateMission(mission, events, h.sor.current())
    expect(evaluation.passed).toBe(true)
    expect(evaluation.checks.map((c) => c.id)).toEqual([
      "policy_violation",
      "unauthorized_write",
      "unverified_completion",
      "scope_expansion",
      "expected_final_state",
    ])
    expect(evaluation.writes).toBe(7)
  })

  it("evaluation fails honestly when the plan and the world disagree", async () => {
    const h = harness()
    let mission = await h.engine.start(
      h.propose(h.actor("Priya Raman"), "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    mission = await h.engine.provideInput(
      mission.id,
      stepByLabel(mission, "QA Complete", "TIME_LOGGED").id,
      2,
    )
    mission = await h.engine.approve(mission.id, stepByLabel(mission, "Acme Implementation").id)
    // Someone reopens a task the mission verified as complete: the fresh read no longer matches.
    const mei = h.actor("Mei Tanaka")
    await h.sor.externalWrite(
      {
        kind: "set_task_status",
        taskId: h.task("Acme Implementation", "Go-Live").id as never,
        status: "IN_PROGRESS",
      },
      mei.id,
      "reopened",
    )
    const evaluation = evaluateMission(mission, h.events.forMission(mission.id), h.sor.current())
    const finalState = evaluation.checks.find((c) => c.id === "expected_final_state")!
    expect(finalState.passed).toBe(false)
    expect(evaluation.checks.find((c) => c.id === "policy_violation")!.passed).toBe(true)
  })

  it("a routine-origin mission gets no acknowledgement; a person's mission does", async () => {
    const h = harness()
    const routine = await h.engine.start(
      h.propose(h.actor("Priya Raman"), "Check Acme", [h.project("Acme Implementation")]),
      { datasetId: "x", origin: "routine" },
    )
    const blocks = renderMission(routine, h.sor.current(), h.events.forMission(routine.id))
    expect(blocks[0]!.type).toBe("activity")
    expect(blocks.some((b) => b.type === "acknowledgement")).toBe(false)
    expect(blocks.some((b) => b.type === "notification.blocked")).toBe(true)
  })
})
