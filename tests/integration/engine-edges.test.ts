import { describe, expect, it } from "vitest"

import type { Mission } from "@/core/mission/mission"
import { harness } from "../helpers/engine"

const step = (m: Mission, label: string, transition: "COMPLETED" | "TIME_LOGGED" = "COMPLETED") =>
  m.plan.find((s) => s.label === label && s.transition === transition)!

describe("MissionEngine — execution safety", () => {
  it("a timed-out write that actually applied is reconciled by re-read: verified, no duplicate, no retry", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    h.sor.injectFault({
      kind: "timeout_once",
      match: { ref: h.task("Acme Implementation", "Deploy API") },
    })
    let mission = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    mission = await h.engine.provideHours(
      mission.id,
      step(mission, "QA Complete", "TIME_LOGGED").id,
      2,
    )

    const deploy = step(mission, "Deploy API")
    expect(deploy.status).toBe("succeeded")
    expect(deploy.verification).toBe("VERIFIED")
    expect(deploy.retries).toBe(0)
    const reconciled = h.events
      .forMission(mission.id)
      .find((e) => e.type === "WRITE_TIMEOUT_RECONCILED")!
    expect(reconciled.detail).toMatchObject({ applied: true, retried: false })
    // Exactly one completion of Deploy API on the ledger.
    const ledger = h.sor.serialize().ledger.filter(([key]) => key === deploy.id)
    expect(ledger).toHaveLength(1)
  })

  it("a transient API failure is retried once with the same idempotency key and then verified", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    h.sor.injectFault({
      kind: "fail_once",
      match: { ref: h.task("Acme Implementation", "Go-Live") },
    })
    let mission = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    mission = await h.engine.provideHours(
      mission.id,
      step(mission, "QA Complete", "TIME_LOGGED").id,
      2,
    )
    const goLive = step(mission, "Go-Live")
    expect(goLive.status).toBe("succeeded")
    expect(goLive.retries).toBe(1)
    expect(goLive.verification).toBe("VERIFIED")
  })

  it("a member without permission is stopped before any write, with escalation to the owner", async () => {
    const h = harness()
    const mei = h.actor("Mei Tanaka")
    const before = h.sor.serialize().changeCount
    const mission = await h.engine.start(
      h.propose(mei, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    // Permission is the first boundary: the mission ends before any input is requested or written.
    expect(mission.state).toBe("PERMISSION_DENIED")
    const projectStep = step(mission, "Acme Implementation")
    expect(projectStep.status).toBe("permission_denied")
    expect(mission.pending).toBeNull()
    expect(h.sor.serialize().changeCount).toBe(before)
    const denied = h.events.forMission(mission.id).filter((e) => e.type === "PERMISSION_DENIED")
    expect(denied.length).toBeGreaterThan(0)
  })
})

describe("MissionEngine — interruption (spec §11)", () => {
  it("cancel stops before the next action and reports exactly what was written", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let mission = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    mission = await h.engine.provideHours(
      mission.id,
      step(mission, "QA Complete", "TIME_LOGGED").id,
      2,
    )
    expect(mission.state).toBe("WAITING") // at the project confirmation
    mission = h.engine.cancel(mission.id)
    expect(mission.state).toBe("CANCELLED")
    expect(step(mission, "Acme Implementation").status).toBe("cancelled")
    expect(step(mission, "Go-Live").status).toBe("succeeded")
    expect(h.sor.current().project(h.project("Acme Implementation").id as never)?.status).toBe(
      "IN_PROGRESS",
    )
  })

  it("'actually leave Go-Live open' replans with the exclusion and never reverts verified state", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let mission = await h.engine.start(
      h.propose(priya, "Complete Beacon Rollout", [h.project("Beacon Rollout")]),
      { datasetId: "x" },
    )
    // Beacon: Load test (3h) → Go-Live (milestone); Handover (milestone). All have time; no input needed,
    // so the engine runs straight to the project confirmation.
    expect(mission.state).toBe("WAITING")
    expect(step(mission, "Go-Live").status).toBe("succeeded")

    mission = await h.engine.changeScope(mission.id, h.task("Beacon Rollout", "Go-Live"))
    // Go-Live was already completed: reported, not reverted (no reopen authority exists).
    expect(step(mission, "Go-Live").status).toBe("succeeded")
    expect(mission.excluded).toHaveLength(1)
    expect(mission.decisions.at(-1)?.kind).toBe("change_scope")
    expect(h.events.forMission(mission.id).some((e) => e.type === "MISSION_REPLANNED")).toBe(true)
  })

  it("excluding a still-open milestone drops its work and leaves the project blocked by policy 1", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let mission = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    mission = await h.engine.changeScope(
      mission.id,
      h.task("Acme Implementation", "Training Complete"),
    )
    expect(mission.plan.some((s) => s.label === "Train admins")).toBe(false)
    expect(mission.plan.some((s) => s.label === "Training Complete")).toBe(false)
    mission = await h.engine.provideHours(
      mission.id,
      step(mission, "QA Complete", "TIME_LOGGED").id,
      2,
    )
    // Go-Live chain completes; the project itself is blocked because Training Complete is still open.
    expect(step(mission, "Go-Live").status).toBe("succeeded")
    expect(mission.state).toBe("BLOCKED")
    expect(
      mission.blockers.some(
        (b) => b.reasonCode === "SUBTASKS_OPEN" || b.requiredChange.kind === "complete_task",
      ),
    ).toBe(true)
  })
})

describe("MissionEngine — course correction (spec §10)", () => {
  it("an external change inside the closure pauses the mission, explains it, replans and continues only when asked", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let mission = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    expect(mission.state).toBe("WAITING")

    // Someone else completes Train admins from another tab.
    const mei = h.actor("Mei Tanaka")
    await h.sor.externalWrite(
      {
        kind: "set_task_status",
        taskId: h.task("Acme Implementation", "Train admins").id as never,
        status: "COMPLETED",
      },
      mei.id,
      "completed Train admins",
    )
    await h.engine.idle()
    mission = h.engine.get(mission.id)!
    expect(mission.state).toBe("STALE")
    expect(mission.stateChanges).toHaveLength(1)
    expect(mission.stateChanges[0]?.summary).toBe("completed Train admins")
    const types = h.events.forMission(mission.id).map((e) => e.type)
    expect(types).toContain("STATE_CHANGED")
    expect(types).toContain("MISSION_PAUSED")
    expect(types).toContain("MISSION_REPLANNED")

    // Resume: the replanned closure no longer contains Train admins at all; the world did it.
    mission = await h.engine.resume(mission.id)
    expect(mission.state).toBe("WAITING")
    expect(mission.plan.some((s) => s.label === "Train admins")).toBe(false)
    expect(step(mission, "Training Complete").status).toBe("pending")
  })

  it("an external change that reopens a completed prerequisite is caught and the stale plan is not executed", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let mission = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    mission = await h.engine.provideHours(
      mission.id,
      step(mission, "QA Complete", "TIME_LOGGED").id,
      2,
    )
    expect(mission.pending?.kind).toBe("confirm_step")

    // World reopens Deploy API while we wait for confirmation.
    await h.sor.externalWrite(
      {
        kind: "set_task_status",
        taskId: h.task("Acme Implementation", "Deploy API").id as never,
        status: "IN_PROGRESS",
      },
      h.actor("Daniel Okafor").id,
      "reopened Deploy API",
    )
    await h.engine.idle()
    mission = h.engine.get(mission.id)!
    expect(mission.state).toBe("STALE")

    mission = await h.engine.resume(mission.id)
    // Go-Live now fails policy 3 again; the engine re-derives the plan and stops at the real blocker.
    expect(h.sor.current().project(h.project("Acme Implementation").id as never)?.status).toBe(
      "IN_PROGRESS",
    )
    expect(mission.state === "BLOCKED" || mission.state === "WAITING").toBe(true)
  })

  it("ignores its own writes and changes outside the closure", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let mission = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    await h.sor.externalWrite(
      {
        kind: "set_task_status",
        taskId: h.task("Beacon Rollout", "Load test").id as never,
        status: "COMPLETED",
      },
      priya.id,
    )
    await h.engine.idle()
    mission = h.engine.get(mission.id)!
    expect(mission.state).toBe("WAITING")
    expect(mission.stateChanges).toHaveLength(0)
  })
})

describe("MissionEngine — partial success (spec §12) on the real export", () => {
  it("'Complete all projects' produces an exact per-target breakdown and one upfront confirmation", async () => {
    const h = harness("rocketlane-export")
    const owner = h.graph.actor(h.graph.project("PRJ-028" as never)!.ownerId!)!
    let mission = await h.engine.start(
      h.propose(
        owner,
        "Complete all projects",
        h.graph.projects.map((p) => ({ kind: "project", id: p.id })),
      ),
      {
        datasetId: "rocketlane-export",
      },
    )
    expect(mission.pending).toEqual({ kind: "confirm_plan" })
    mission = await h.engine.approve(mission.id, null)

    const outcome = mission.outcome!
    expect(outcome.perTarget).toHaveLength(31)
    expect(
      outcome.completed +
        outcome.blocked +
        outcome.alreadyComplete +
        outcome.failed +
        outcome.permissionDenied +
        outcome.cancelled,
    ).toBe(31)
    // Erin Warner owns one project; the other 30 are denied or blocked, never silently completed.
    expect(outcome.permissionDenied).toBeGreaterThanOrEqual(27)
    expect(outcome.completed).toBeLessThanOrEqual(1)
    expect(
      mission.state === "PARTIALLY_COMPLETED" ||
        mission.state === "BLOCKED" ||
        mission.state === "PERMISSION_DENIED",
    ).toBe(true)
  })
})
