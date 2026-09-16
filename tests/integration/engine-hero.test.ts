import { describe, expect, it } from "vitest"

import { hoursTracked } from "@/core/domain/entities"
import type { Mission, PlanStep } from "@/core/mission/mission"
import { harness } from "../helpers/engine"

const stepByLabel = (m: Mission, label: string, transition: PlanStep["transition"] = "COMPLETED") =>
  m.plan.find((s) => s.label === label && s.transition === transition)!

describe("MissionEngine — hero journey: Mark Acme Implementation as completed", () => {
  it("resolves, plans, blocks on the deepest dependency, and waits for the one input it cannot invent", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const mission = await h.engine.start(
      h.propose(priya, "Mark Acme Implementation as completed", [h.project("Acme Implementation")]),
      {
        datasetId: "cascading-conflicts",
      },
    )

    expect(mission.state).toBe("WAITING")
    expect(mission.pending).toMatchObject({
      kind: "input",
      stepId: stepByLabel(mission, "QA Complete", "TIME_LOGGED").id,
      input: { field: "hours", policyId: "P4_TASK_TIME", reasonCode: "NO_TIME_LOGGED" },
    })
    // Every step is derived from the closure; the model never supplied any of them.
    expect(mission.plan.map((s) => `${s.label}:${s.transition}`)).toEqual([
      "QA Complete:TIME_LOGGED",
      "QA Complete:COMPLETED",
      "Deploy API:COMPLETED",
      "Go-Live:COMPLETED",
      "Train admins:COMPLETED",
      "Training Complete:COMPLETED",
      "Acme Implementation:COMPLETED",
    ])
    expect(mission.openButNotRequired.map((t) => t.label)).toEqual(["Documentation"])
    // Nothing has been written yet.
    expect(
      h.sor.current().task(h.task("Acme Implementation", "QA Complete").id as never)?.status,
    ).toBe("IN_PROGRESS")
  })

  it("completes the whole chain after time is logged, pauses for the high-impact project completion, verifies and lands", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let mission = await h.engine.start(
      h.propose(priya, "Mark Acme Implementation as completed", [h.project("Acme Implementation")]),
      {
        datasetId: "cascading-conflicts",
      },
    )

    mission = await h.engine.provideHours(
      mission.id,
      stepByLabel(mission, "QA Complete", "TIME_LOGGED").id,
      2,
    )

    // Tasks all completed in dependency order; project completion waits for confirmation (A-05).
    expect(mission.state).toBe("WAITING")
    expect(mission.pending).toEqual({
      kind: "confirm_step",
      stepId: stepByLabel(mission, "Acme Implementation").id,
    })
    for (const label of [
      "QA Complete",
      "Deploy API",
      "Go-Live",
      "Train admins",
      "Training Complete",
    ]) {
      const step = stepByLabel(mission, label)
      expect(step.status).toBe("succeeded")
      expect(step.verification).toBe("VERIFIED")
    }
    const graph = h.sor.current()
    expect(
      hoursTracked(graph.task(h.task("Acme Implementation", "QA Complete").id as never)!),
    ).toBe(2)
    expect(graph.project(h.project("Acme Implementation").id as never)?.status).toBe("IN_PROGRESS")

    mission = await h.engine.approve(mission.id, stepByLabel(mission, "Acme Implementation").id)
    expect(mission.state).toBe("COMPLETED")
    expect(mission.landedAt).not.toBeNull()
    expect(h.sor.current().project(h.project("Acme Implementation").id as never)?.status).toBe(
      "COMPLETED",
    )
    expect(mission.outcome).toMatchObject({ completed: 1, blocked: 0, failed: 0 })

    // Black box: verified completion is on record, and no success was claimed unverified.
    const types = h.events.forMission(mission.id).map((e) => e.type)
    expect(types).toContain("ACTION_COMPLETED")
    expect(types[types.length - 1]).toBe("MISSION_COMPLETED")
    const completions = h.events.forMission(mission.id).filter((e) => e.type === "ACTION_COMPLETED")
    expect(completions.every((e) => e.detail["verified"] === true)).toBe(true)
  })

  it("declining the high-impact step leaves the project open and reports honestly", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let mission = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    mission = await h.engine.provideHours(
      mission.id,
      stepByLabel(mission, "QA Complete", "TIME_LOGGED").id,
      1,
    )
    mission = await h.engine.decline(mission.id, stepByLabel(mission, "Acme Implementation").id)
    // The user said no: that is a cancellation, not a governance block.
    expect(mission.state).toBe("CANCELLED")
    expect(mission.outcome?.perTarget[0]?.outcome).toBe("cancelled")
    expect(h.sor.current().project(h.project("Acme Implementation").id as never)?.status).toBe(
      "IN_PROGRESS",
    )
  })

  it("reports an already complete project without writing anything", async () => {
    const h = harness()
    const daniel = h.actor("Daniel Okafor")
    const before = h.sor.serialize().changeCount
    const mission = await h.engine.start(
      h.propose(daniel, "Complete Northwind", [h.project("Northwind Migration")]),
      { datasetId: "x" },
    )
    expect(mission.state).toBe("COMPLETED")
    expect(mission.outcome?.alreadyComplete).toBe(1)
    expect(h.sor.serialize().changeCount).toBe(before)
  })
})
