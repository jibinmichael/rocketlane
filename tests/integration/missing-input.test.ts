import { describe, expect, it } from "vitest"

import { renderMission } from "@/core/agent/conversation/renderer"
import { hoursTracked } from "@/core/domain/entities"
import type { Mission } from "@/core/mission/mission"
import { MissionSchema } from "@/core/mission/schema"
import { Runtime } from "@/lib/runtime"
import { harness } from "../helpers/engine"
import { readFixture } from "../helpers/fixtures"

/**
 * The missing-time blocker as a generic mission capability:
 * BLOCKER → required_input → schema → conversational collection → validation → authorized action
 * → verification → revalidation → continue. Thirteen cases from the review, one each.
 */

function makeRuntime() {
  return new Runtime({
    loadFixture: async (id) => ({
      id,
      projectsCsv: readFixture(id, "projects.csv"),
      tasksCsv: readFixture(id, "tasks.csv"),
    }),
  })
}

async function waitingForHours() {
  const rt = makeRuntime()
  await rt.boot()
  const priya = rt.getSnapshot().actors.find((a) => a.name === "Priya Raman")!
  rt.setActor(priya.id)
  const id = (await rt.send("Mark Acme Implementation as completed", null))!
  const mission = rt.mission(id)!
  expect(mission.state).toBe("WAITING")
  expect(mission.pending?.kind).toBe("input")
  return { rt, id }
}

function qaHours(rt: Runtime): number {
  const graph = rt.getSnapshot().graph!
  const qa = graph.tasks.find((t) => t.name === "QA Complete")!
  return hoursTracked(qa)
}

const stepByLabel = (mission: Mission, label: string, transition = "COMPLETED") =>
  mission.plan.find((s) => s.label === label && s.transition === transition)!

describe("missing input: the ask", () => {
  it("explains the stop from policy evidence, asks for the one value, names the actor; no form", async () => {
    const { rt, id } = await waitingForHours()
    const ask = rt.liveBlocks(id).find((b) => b.type === "action_request.input")!
    const lines = ask.lines.map((l) =>
      l.map((i) => ("text" in i ? i.text : "label" in i ? i.label : "")).join(""),
    )
    expect(lines[0]).toBe(
      "QA Complete has no logged time. Policy 4 requires hours before completion.",
    )
    expect(lines[1]).toBe("How many hours should I log for QA Complete?")
    expect(lines[2]).toBe(
      "QA Complete is assigned to Mei Tanaka; I'll record the hours as yours, Priya Raman.",
    )
    expect(ask.actions).toEqual([])
    const pending = rt.mission(id)!.pending
    expect(pending?.kind === "input" && pending.input).toMatchObject({
      field: "hours",
      policyId: "P4_TASK_TIME",
      reasonCode: "NO_TIME_LOGGED",
      permission: "log_time",
      schema: { type: "number", exclusiveMinimum: 0 },
    })
  })
})

describe("missing input: conversational values", () => {
  it("1. '2 hours' → validated, written, verified, downstream continues to the one real decision", async () => {
    const { rt, id } = await waitingForHours()
    await rt.send("2 hours", id)
    const mission = rt.mission(id)!
    expect(qaHours(rt)).toBe(2)
    expect(mission.pending?.kind).toBe("confirm_step")
    const verified = mission.plan.filter((s) => s.status === "succeeded")
    expect(verified.map((s) => s.label)).toEqual([
      "QA Complete",
      "QA Complete",
      "Deploy API",
      "Go-Live",
      "Train admins",
      "Training Complete",
    ])
    for (const s of verified) expect(s.verification).toBe("VERIFIED")
    // The ask stays in the record, above the answer, with the same receipt a button would leave.
    const thread = rt.thread(id)
    const askIndex = thread.findIndex(
      (e) => e.kind === "agent" && e.blocks.some((b) => b.type === "action_request.input"),
    )
    const answerIndex = thread.findIndex((e) => e.kind === "user" && e.text === "2 hours")
    expect(askIndex).toBeGreaterThanOrEqual(0)
    expect(askIndex).toBeLessThan(answerIndex)
    const ask = thread[askIndex]!
    expect(ask.kind === "agent" && ask.actionTaken).toBe("Logged 2 hours by Priya Raman")
    // 12. exactly one input request and one confirmation; nothing else was asked.
    const requests = rt
      .getSnapshot()
      .events.filter((e) => e.missionId === id && e.type === "ACTION_REQUESTED")
    expect(requests.map((e) => e.detail["input"] ?? e.detail["confirm"])).toEqual(["hours", true])
  })

  it("2. '2h' is a valid value", async () => {
    const { rt, id } = await waitingForHours()
    await rt.send("2h", id)
    expect(qaHours(rt)).toBe(2)
    expect(rt.mission(id)!.pending?.kind).toBe("confirm_step")
  })

  it("3. 'two hours' is not guessed: the ask is re-stated, nothing is logged", async () => {
    const { rt, id } = await waitingForHours()
    await rt.send("two hours", id)
    expect(qaHours(rt)).toBe(0)
    expect(rt.mission(id)!.pending?.kind).toBe("input")
    const replies = rt
      .thread(id)
      .flatMap((e) => (e.kind === "agent" ? e.blocks : []))
      .filter((b) => b.type === "boundary")
    const last = replies[replies.length - 1]!
    const flat = last.lines[0]!.map((i) =>
      "text" in i ? i.text : "label" in i ? i.label : "",
    ).join("")
    expect(flat).toBe(
      "I need a number of hours for QA Complete, for example 2 or 1.5. Nothing has been logged.",
    )
    // The ask itself stays live with the mission.
    expect(rt.liveBlocks(id).some((b) => b.type === "action_request.input")).toBe(true)
  })

  it("4. empty input is not a turn: still waiting, thread unchanged", async () => {
    const { rt, id } = await waitingForHours()
    const before = rt.thread(id).length
    await rt.send("   ", id)
    expect(rt.mission(id)!.pending?.kind).toBe("input")
    expect(rt.thread(id).length).toBe(before)
  })

  it("5. negative hours are rejected", async () => {
    const { rt, id } = await waitingForHours()
    await rt.send("-2 hours", id)
    expect(qaHours(rt)).toBe(0)
    expect(rt.mission(id)!.pending?.kind).toBe("input")
  })

  it("6. zero hours are rejected: the domain requires positive logged time", async () => {
    const { rt, id } = await waitingForHours()
    await rt.send("0", id)
    expect(qaHours(rt)).toBe(0)
    expect(rt.mission(id)!.pending?.kind).toBe("input")
  })
})

describe("missing input: authorization", () => {
  it("7. an actor who may not log time is stopped before the ask, and nothing is written", async () => {
    const h = harness()
    const daniel = h.actor("Daniel Okafor") // member of Acme, not assigned to QA Complete
    const qa = h.task("Acme Implementation", "QA Complete")
    const mission = await h.engine.start(h.propose(daniel, "Complete QA Complete", [qa]), {
      datasetId: "x",
    })
    expect(mission.state).toBe("PERMISSION_DENIED")
    expect(mission.pending).toBeNull()
    const events = h.events.forMission(mission.id)
    expect(events.some((e) => e.type === "ACTION_REQUESTED")).toBe(false)
    expect(events.some((e) => e.type === "PERMISSION_DENIED")).toBe(true)
    expect(h.sor.serialize().changeCount).toBe(0)
  })

  it("the assigned team member may log time on her own task", async () => {
    const h = harness()
    const mei = h.actor("Mei Tanaka")
    const qa = h.task("Acme Implementation", "QA Complete")
    let mission = await h.engine.start(h.propose(mei, "Complete QA Complete", [qa]), {
      datasetId: "x",
    })
    expect(mission.pending?.kind).toBe("input")
    const pending = mission.pending
    mission = await h.engine.provideInput(
      mission.id,
      pending?.kind === "input" ? pending.stepId : "",
      2,
    )
    expect(mission.state).toBe("COMPLETED")
    const events = h.events.forMission(mission.id)
    const permissionChecks = events.filter((e) => e.type === "PERMISSION_CHECKED")
    // Checked before the ask, and again at execution time.
    expect(permissionChecks.length).toBeGreaterThanOrEqual(2)
  })
})

describe("missing input: execution safety", () => {
  it("8. a timeout on the time-entry write is reconciled by re-read, never duplicated", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const qa = h.task("Acme Implementation", "QA Complete")
    h.sor.injectFault({ kind: "timeout_once", match: { ref: qa } })
    let mission = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    mission = await h.engine.provideInput(
      mission.id,
      stepByLabel(mission, "QA Complete", "TIME_LOGGED").id,
      2,
    )
    const events = h.events.forMission(mission.id)
    const reconciled = events.find((e) => e.type === "WRITE_TIMEOUT_RECONCILED")!
    expect(reconciled.detail["applied"]).toBe(true)
    expect(hoursTracked(h.sor.current().task(qa.id as never)!)).toBe(2)
    expect(stepByLabel(mission, "QA Complete", "TIME_LOGGED").retries).toBe(0)
  })

  it("9. the world logs the time while the mission waits: pause, revalidate, no second entry", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const mei = h.actor("Mei Tanaka")
    const qa = h.task("Acme Implementation", "QA Complete")
    let mission = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    expect(mission.pending?.kind).toBe("input")
    await h.sor.externalWrite(
      { kind: "add_time_entry", taskId: qa.id as never, hours: 3, actorId: mei.id },
      mei.id,
      "logged 3h",
    )
    await h.engine.idle()
    mission = h.engine.get(mission.id)!
    expect(mission.state).toBe("STALE")
    mission = await h.engine.resume(mission.id)
    expect(hoursTracked(h.sor.current().task(qa.id as never)!)).toBe(3)
    // The requirement vanished with the world's write: the step is gone or satisfied, never re-asked.
    const timeStep = mission.plan.find(
      (s) => s.label === "QA Complete" && s.transition === "TIME_LOGGED",
    )
    expect(timeStep === undefined || timeStep.status === "already_complete").toBe(true)
    expect(mission.pending?.kind).toBe("confirm_step")
  })

  it("10. a scope change while waiting drops the ask; a later value is never applied to the old target", async () => {
    const { rt, id } = await waitingForHours()
    await rt.send("actually leave QA Complete open", id)
    const mission = rt.mission(id)!
    expect(mission.pending?.kind).not.toBe("input")
    await rt.send("2 hours", id)
    expect(qaHours(rt)).toBe(0)
  })

  it("11. a reloaded mission is still WAITING and knows exactly which input it needs", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const mission = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    const restored = MissionSchema.parse(JSON.parse(JSON.stringify(mission)))
    expect(restored.state).toBe("WAITING")
    expect(restored.pending).toMatchObject({
      kind: "input",
      stepId: stepByLabel(mission, "QA Complete", "TIME_LOGGED").id,
      input: { field: "hours", policyId: "P4_TASK_TIME" },
    })
    const blocks = renderMission(restored, h.sor.current())
    expect(blocks.map((b) => b.type)).toContain("action_request.input")
  })
})

describe("missing input: routine boundary", () => {
  it("13. a routine that meets missing time leaves a waiting mission and notifies; it never invents hours", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let mission = await h.engine.start(
      h.propose(priya, "Check Acme Implementation", [h.project("Acme Implementation")]),
      { datasetId: "x", origin: "routine" },
    )
    expect(mission.state).toBe("WAITING")
    expect(mission.pending?.kind).toBe("input")
    expect(h.sor.serialize().changeCount).toBe(0)
    const blocks = renderMission(mission, h.sor.current(), h.events.forMission(mission.id))
    const notice = blocks.find((b) => b.type === "notification.blocked")!
    const flat = notice.lines[0]!.map((i) =>
      "text" in i ? i.text : "label" in i ? i.label : "",
    ).join("")
    expect(flat).toBe(
      "Acme Implementation is blocked because QA Complete has no logged time. Policy 4 requires hours before completion. I need the number of hours from the authorized actor.",
    )
    // The same durable mission continues once a person supplies the value.
    const missionId = mission.id
    mission = await h.engine.provideInput(
      missionId,
      stepByLabel(mission, "QA Complete", "TIME_LOGGED").id,
      2,
    )
    expect(mission.id).toBe(missionId)
    expect(mission.pending?.kind).toBe("confirm_step")
    mission = await h.engine.approve(mission.id, stepByLabel(mission, "Acme Implementation").id)
    expect(mission.state).toBe("COMPLETED")
    expect(mission.landedAt).not.toBeNull()
  })
})
