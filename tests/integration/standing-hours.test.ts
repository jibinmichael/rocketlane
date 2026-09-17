import { describe, expect, it } from "vitest"

import { Runtime } from "@/lib/runtime"
import { readFixture } from "../helpers/fixtures"

function makeRuntime() {
  return new Runtime({
    loadFixture: async (id) => ({
      id,
      projectsCsv: readFixture(id, "projects.csv"),
      tasksCsv: readFixture(id, "tasks.csv"),
    }),
  })
}

describe('Runtime — "2 hours each" answers every later hours ask in the mission', () => {
  it("logs the same hours per task, one verified input at a time, with a receipt each", async () => {
    const rt = makeRuntime()
    await rt.boot()
    rt.loadCsv(
      "rocketlane-export",
      readFixture("rocketlane-export", "projects.csv"),
      readFixture("rocketlane-export", "tasks.csv"),
    )
    const snap = rt.getSnapshot()
    const jordan = snap.actors.find((a) => a.name === "Jordan Henderson")!
    rt.setActor(jordan.id)

    const id = (await rt.send("Complete Bowen-Chapman", null))!
    let mission = rt.mission(id)!
    expect(mission.pending?.kind).toBe("input")
    const needHours = mission.plan.filter((s) => s.transition === "TIME_LOGGED").length
    expect(needHours).toBeGreaterThan(1)

    await rt.send("2 hours each", id)
    mission = rt.mission(id)!
    // No hours ask is left: every TIME_LOGGED step got the same answer, each written and verified.
    expect(mission.pending?.kind === "input").toBe(false)
    const logged = mission.plan.filter((s) => s.transition === "TIME_LOGGED")
    expect(logged.every((s) => s.status === "succeeded" && s.verification === "VERIFIED")).toBe(
      true,
    )
    const graph = rt.getSnapshot().graph!
    for (const s of logged) {
      const task = s.ref.kind === "task" ? graph.task(s.ref.id) : null
      expect(task?.timeEntries.some((e) => e.hours === 2 && e.actorId === jordan.id)).toBe(true)
    }
    // One decision, one receipt on the ask that was answered, one acknowledgement, one phase.
    const receipts = rt
      .thread(id)
      .filter((e) => e.kind === "agent" && e.actionTaken?.includes("same for each"))
    expect(receipts.length).toBe(1)
    const live = rt.liveBlocks(id)
    const acks = live.filter((b) => b.type === "acknowledgement")
    expect(acks.length).toBe(1)
    expect(JSON.stringify(acks[0]!.lines)).toContain("2 hours each")
    expect(live.filter((b) => b.type === "activity").length).toBe(1)
    expect(live.filter((b) => b.type === "action_request.input").length).toBe(0)
  })
})
