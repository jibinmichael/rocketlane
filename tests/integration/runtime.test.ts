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

describe("Runtime — the conversation surface end to end, headless", () => {
  it("boots the demo workspace and picks an owner as the acting user", async () => {
    const rt = makeRuntime()
    await rt.boot()
    const snap = rt.getSnapshot()
    expect(snap.status).toBe("ready")
    expect(snap.datasetId).toBe("cascading-conflicts")
    expect(snap.actors.find((a) => a.id === snap.actorId)?.role).toBe("owner")
    expect(snap.interpreterMode).toBe("deterministic")
  })

  it("runs the hero journey through send/act: blocked → log time → confirm → landed", async () => {
    const rt = makeRuntime()
    await rt.boot()
    const priya = rt.getSnapshot().actors.find((a) => a.name === "Priya Raman")!
    rt.setActor(priya.id)

    const id = (await rt.send("Mark Acme Implementation as completed", null))!
    expect(id).toMatch(/^m-/)
    let live = rt.liveBlocks(id)
    expect(live.map((b) => b.type)).toEqual([
      "outcome.blocked",
      "blocker",
      "resolution_path",
      "action_request.input",
    ])
    expect(rt.thread(id).map((e) => e.kind)).toEqual(["user"])

    const input = live.find((b) => b.type === "action_request.input")!
    await rt.act(id, input.actions[0]!, { hours: 2 })
    // The input block froze into the thread with the decision recorded; live shows only what is new.
    const frozen = rt.thread(id).filter((e) => e.kind === "agent")
    expect(frozen).toHaveLength(1)
    expect(frozen[0]!.kind === "agent" && frozen[0]!.actionTaken).toBe("Logged 2h by Priya Raman")
    live = rt.liveBlocks(id)
    expect(live.map((b) => b.type).filter((t) => t === "result.verified")).toHaveLength(6)
    expect(live[live.length - 1]!.type).toBe("action_request.confirm")

    const confirm = live[live.length - 1]!
    await rt.act(id, confirm.actions[0]!)
    live = rt.liveBlocks(id)
    expect(live[live.length - 1]!.type).toBe("landing")
    expect(rt.mission(id)?.state).toBe("COMPLETED")
    expect(rt.session(id)).toBe("COMPLETED")
  })

  it("typed replies inside a mission are interpreted in context: hours, then yes", async () => {
    const rt = makeRuntime()
    await rt.boot()
    const id = (await rt.send("complete acme", null))!
    expect(rt.mission(id)?.pending?.kind).toBe("input_hours")
    await rt.send("2h", id)
    expect(rt.mission(id)?.pending?.kind).toBe("confirm_step")
    await rt.send("yes", id)
    expect(rt.mission(id)?.state).toBe("COMPLETED")
    const kinds = rt.thread(id).map((e) => e.kind)
    expect(kinds.filter((k) => k === "user")).toHaveLength(3)
  })

  it("interruption by language: 'actually leave Go-Live open' replans and reports", async () => {
    const rt = makeRuntime()
    await rt.boot()
    const id = (await rt.send("complete Beacon Rollout", null))!
    expect(rt.mission(id)?.pending?.kind).toBe("confirm_step")
    await rt.send("Actually leave Handover open", id)
    const mission = rt.mission(id)!
    expect(mission.excluded).toHaveLength(1)
    // Handover had already been verified complete before the user spoke: reported, never reverted.
    const handover = mission.plan.find((s) => s.label === "Handover")!
    expect(handover.status).toBe("succeeded")
    expect(handover.note).toBe("completed before scope change")
    const agentEntries = rt.thread(id).filter((e) => e.kind === "agent")
    const hasScopeBlock = agentEntries.some(
      (e) => e.kind === "agent" && e.blocks.some((b) => b.type === "scope_change"),
    )
    expect(hasScopeBlock).toBe(true)
  })

  it("out-of-scope and unknown targets get a boundary reply and no mission", async () => {
    const rt = makeRuntime()
    await rt.boot()
    const before = rt.getSnapshot().missions.length
    const id = (await rt.send("what's the weather like", null))!
    expect(id).toMatch(/^reply-/)
    expect(rt.getSnapshot().missions.length).toBe(before)
    const reply = rt.thread(id).find((e) => e.kind === "agent")
    expect(reply?.kind === "agent" && reply.blocks[0]?.type).toBe("boundary")
  })

  it("a world change from outside pauses the live mission and shows continue/stop", async () => {
    const rt = makeRuntime()
    await rt.boot()
    const id = (await rt.send("complete acme", null))!
    const graph = rt.getSnapshot().graph!
    const acme = graph.projects.find((p) => p.name === "Acme Implementation")!
    const train = graph.tasksOf(acme.id).find((t) => t.name === "Train admins")!
    const mei = graph.actors.find((a) => a.name === "Mei Tanaka")!
    await rt.worldWrite(
      { kind: "set_task_status", taskId: train.id, status: "COMPLETED" },
      mei.id,
      "was completed",
    )
    expect(rt.mission(id)?.state).toBe("STALE")
    expect(rt.session(id)).toBe("WAITING_FOR_USER")
    const live = rt.liveBlocks(id)
    const change = live.find((b) => b.type === "state_change")!
    expect(change.actions.map((a) => a.kind)).toEqual(["continue", "cancel"])
    await rt.act(id, change.actions[0]!)
    expect(rt.mission(id)?.state).toBe("WAITING")
  })

  it("loads the real export and keeps working on it", async () => {
    const rt = makeRuntime()
    await rt.boot()
    const report = rt.loadCsv(
      "rocketlane-export",
      readFixture("rocketlane-export", "projects.csv"),
      readFixture("rocketlane-export", "tasks.csv"),
    )
    expect(report.counts.projects).toBe(31)
    expect(rt.getSnapshot().datasetId).toBe("rocketlane-export")
    const owner = rt.getSnapshot().actors.find((a) => a.name === "Erin Warner")!
    rt.setActor(owner.id)
    const id = (await rt.send("complete all projects", null))!
    expect(rt.mission(id)?.pending).toEqual({ kind: "confirm_plan" })
  })
})

describe("Runtime — a typed question never strands a pending decision", () => {
  it("the confirmation's buttons stay live after 'why is it blocked?'", async () => {
    const rt = makeRuntime()
    await rt.boot()
    const priya = rt.getSnapshot().actors.find((a) => a.name === "Priya Raman")!
    rt.setActor(priya.id)
    const id = (await rt.send("complete Beacon Rollout", null))!
    const before = rt.liveBlocks(id).find((b) => b.type === "action_request.confirm")!
    expect(before.actions.length).toBeGreaterThan(0)

    await rt.send("why is it blocked?", id)
    const after = rt.liveBlocks(id).find((b) => b.type === "action_request.confirm")
    expect(after?.actions.length).toBeGreaterThan(0)
    // The answer landed in the thread; the decision did not.
    const frozenTypes = rt
      .thread(id)
      .flatMap((e) => (e.kind === "agent" ? e.blocks.map((b) => b.type) : []))
    expect(frozenTypes).not.toContain("action_request.confirm")
  })
})
