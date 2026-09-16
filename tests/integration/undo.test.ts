import { describe, expect, it } from "vitest"

import { hoursTracked } from "@/core/domain/entities"
import { evaluateMission } from "@/core/evaluation/mission-evaluation"
import type { Mission, PlanStep } from "@/core/mission/mission"
import { harness } from "../helpers/engine"

const step = (m: Mission, label: string, transition: PlanStep["transition"] = "COMPLETED") =>
  m.plan.find((s) => s.label === label && s.transition === transition)!

describe("MissionEngine — undo: a landed mission reverses in a new mission (D-30)", () => {
  it("restores every status and removes the logged time, newest first, each verified", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const project = h.project("Acme Implementation")
    const chain = ["QA Complete", "Deploy API", "Go-Live", "Train admins", "Training Complete"]
    const initial = h.sor.current()
    const statusBefore = (name: string) =>
      initial.task(h.task("Acme Implementation", name).id as never)!.status

    let mission = await h.engine.start(
      h.propose(priya, "Mark Acme Implementation as completed", [project]),
      { datasetId: "cascading-conflicts" },
    )
    mission = await h.engine.provideHours(
      mission.id,
      step(mission, "QA Complete", "TIME_LOGGED").id,
      2,
    )
    mission = await h.engine.approve(mission.id, step(mission, "Acme Implementation").id)
    expect(mission.state).toBe("COMPLETED")
    // Every forward write recorded the status it replaced.
    for (const s of mission.plan.filter((s) => s.transition === "COMPLETED")) {
      expect(s.status).toBe("succeeded")
      expect(s.before).not.toBeNull()
    }

    let undo = await h.engine.undo(mission.id, "u-1", priya, { datasetId: "cascading-conflicts" })
    expect(undo.origin).toBe("undo")
    expect(undo.reverts).toBe(mission.id)
    // Newest first: the project reopens before its tasks, and reopening a project is high impact.
    expect(undo.plan[0]!.ref).toEqual(project)
    expect(undo.plan[0]!.transition).toBe("REVERTED")
    expect(undo.plan.map((s) => s.transition)).toEqual([
      "REVERTED",
      "REVERTED",
      "REVERTED",
      "REVERTED",
      "REVERTED",
      "REVERTED",
      "TIME_REMOVED",
    ])
    expect(undo.state).toBe("WAITING")
    expect(undo.pending).toEqual({
      kind: "confirm_step",
      stepId: step(undo, "Acme Implementation", "REVERTED").id,
    })

    undo = await h.engine.approve(undo.id, step(undo, "Acme Implementation", "REVERTED").id)
    expect(undo.state).toBe("COMPLETED")
    expect(undo.landedAt).not.toBeNull()
    const graph = h.sor.current()
    expect(graph.project(project.id as never)?.status).toBe("IN_PROGRESS")
    for (const name of chain) {
      expect(graph.task(h.task("Acme Implementation", name).id as never)!.status).toBe(
        statusBefore(name),
      )
    }
    expect(
      hoursTracked(graph.task(h.task("Acme Implementation", "QA Complete").id as never)!),
    ).toBe(0)

    // Nothing was claimed unverified, and the evaluator agrees on a fresh read.
    expect(undo.plan.every((s) => s.status === "succeeded" && s.verification === "VERIFIED")).toBe(
      true,
    )
    const evaluation = evaluateMission(undo, h.events.forMission(undo.id), graph)
    expect(evaluation.passed).toBe(true)

    // Governance was consulted before every reverse write; the four policies do not govern it.
    const checks = h.events
      .forMission(undo.id)
      .filter((e) => e.type === "POLICY_CHECKED" && e.detail["phase"] !== "plan")
    // The reopen step is checked before it asks and again when it runs, so at least one per step.
    expect(checks.length).toBeGreaterThanOrEqual(undo.plan.length)
    expect(checks.every((e) => e.detail["allowed"] === true && e.detail["policies"] === "")).toBe(
      true,
    )
    // The forward mission is untouched: its record still says it landed.
    expect(h.store.load(mission.id)?.state).toBe("COMPLETED")
  })

  it("an undo needs the authority the forward write needed", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const project = h.project("Acme Implementation")
    let mission = await h.engine.start(
      h.propose(priya, "Mark Acme Implementation as completed", [project]),
      { datasetId: "cascading-conflicts" },
    )
    mission = await h.engine.provideHours(
      mission.id,
      step(mission, "QA Complete", "TIME_LOGGED").id,
      2,
    )
    mission = await h.engine.approve(mission.id, step(mission, "Acme Implementation").id)
    expect(mission.state).toBe("COMPLETED")

    const outsider = h.graph.actors.find((a) => a.id !== priya.id && a.role !== "owner")!
    const undo = await h.engine.undo(mission.id, "u-2", outsider, {
      datasetId: "cascading-conflicts",
    })
    expect(undo.state).toBe("PERMISSION_DENIED")
    // Nothing moved.
    expect(h.sor.current().project(project.id as never)?.status).toBe("COMPLETED")
  })
})
