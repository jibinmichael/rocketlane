import { describe, expect, it } from "vitest"

import type { Block, Inline } from "@/core/agent/conversation/blocks"
import { renderMission } from "@/core/agent/conversation/renderer"
import { harness } from "../helpers/engine"

const flat = (lines: readonly (readonly Inline[])[]) =>
  lines
    .map((line) =>
      line
        .map((i) =>
          i.kind === "text"
            ? i.text
            : i.kind === "entity"
              ? `[${i.label}]`
              : i.kind === "policy"
                ? `(${i.label})`
                : i.kind === "count"
                  ? String(i.value)
                  : "{time}",
        )
        .join(""),
    )
    .join("\n")

const types = (blocks: Block[]) => blocks.map((b) => b.type)

describe("renderMission — copy from state, in progressive-disclosure order", () => {
  it("hero, first turn: outcome → blocker chain → shortest path → input request", async () => {
    const h = harness()
    const mission = await h.engine.start(
      h.propose(h.actor("Priya Raman"), "Mark Acme Implementation as completed", [
        h.project("Acme Implementation"),
      ]),
      { datasetId: "x" },
    )
    const blocks = renderMission(mission, h.sor.current(), h.events.forMission(mission.id))
    expect(types(blocks)).toEqual([
      "acknowledgement",
      "activity",
      "outcome.blocked",
      "blocker",
      "resolution_path",
      "action_request.input",
    ])
    expect(flat(blocks[0]!.lines)).toBe(
      "Got it. I'll get [Acme Implementation] to completed.\nI'll check its governance requirements and resolve anything blocking it.",
    )
    expect(blocks[1]!.collapsed).toBe(false)
    expect(blocks[1]!.activity?.map((i) => i.label)).toEqual([
      "Checking project",
      "Checking milestones",
      "Checking governance",
      "Tracing dependencies",
    ])
    const [, , outcome, chain, path, ask] = blocks
    expect(flat(outcome!.lines)).toBe("I can't complete [Acme Implementation] yet.")
    expect(flat(chain!.lines)).toBe(
      [
        "[Acme Implementation] can't complete: milestone [Go-Live] is incomplete. (Policy 1)",
        "[Go-Live] can't complete: predecessor [Deploy API] is incomplete. (Policy 3)",
        "[Deploy API] can't complete: predecessor [QA Complete] is incomplete. (Policy 3)",
        "[QA Complete] can't complete: no time is logged. (Policy 4)",
      ].join("\n"),
    )
    expect(chain!.path?.map((n) => `${n.label}:${n.state}`)).toEqual([
      "Acme Implementation:target",
      "Go-Live:open",
      "Deploy API:open",
      "QA Complete:actionable",
    ])
    expect(flat(path!.lines)).toBe(
      "6 updates to complete [Acme Implementation]. First: log time on [QA Complete].",
    )
    expect(flat(ask!.lines)).toBe(
      [
        "[QA Complete] has no logged time. Policy 4 requires hours before completion.",
        "How many hours should I log for [QA Complete]?",
        "QA Complete is assigned to Mei Tanaka; I'll record the hours as yours, Priya Raman.",
      ].join("\n"),
    )
    // The composer is the input: the ask carries no form and no button.
    expect(ask!.actions).toEqual([])
    // No banned words anywhere.
    const all = blocks.map((b) => flat(b.lines)).join(" ")
    expect(all).not.toMatch(/thinking|oops|great news|snag|AI\b/i)
  })

  it("after time is logged: verified results, then the high-impact confirmation with its consequence", async () => {
    const h = harness()
    let mission = await h.engine.start(
      h.propose(h.actor("Priya Raman"), "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    mission = await h.engine.provideHours(mission.id, mission.plan[0]!.id, 2)
    const blocks = renderMission(mission, h.sor.current(), h.events.forMission(mission.id))
    const t = types(blocks)
    expect(t[0]).toBe("acknowledgement")
    // Verified updates are observable work in the current phase, not one block each.
    const work = blocks.filter((b) => b.type === "activity")
    expect(work).toHaveLength(2)
    expect(work[1]!.activity?.filter((i) => i.icon === "check")).toHaveLength(6)
    expect(t[t.length - 1]).toBe("action_request.confirm")
    const confirm = blocks[blocks.length - 1]!
    expect(flat(confirm.lines)).toBe(
      [
        "Complete [Acme Implementation]? 2 of 2 milestones complete.",
        "1 task remains open. This does not block completion under current policies.",
        "Status → Completed.",
      ].join("\n"),
    )
    expect(confirm.detail).toEqual([
      [
        {
          kind: "entity",
          ref: h.task("Acme Implementation", "Documentation"),
          label: "Documentation",
        },
      ],
    ])
    expect(confirm.actions.map((a) => a.label)).toEqual(["Complete project", "Not now"])
  })

  it("landing and the timeout reconciliation beat", async () => {
    const h = harness()
    h.sor.injectFault({
      kind: "timeout_once",
      match: { ref: h.task("Acme Implementation", "Deploy API") },
    })
    let mission = await h.engine.start(
      h.propose(h.actor("Priya Raman"), "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    mission = await h.engine.provideHours(mission.id, mission.plan[0]!.id, 2)
    mission = await h.engine.approve(
      mission.id,
      mission.plan.find((s) => s.ref.kind === "project")!.id,
    )
    const blocks = renderMission(mission, h.sor.current(), h.events.forMission(mission.id))
    const t = types(blocks)
    expect(t).toContain("timeout_reconciled")
    expect(t[t.length - 2]).toBe("landing")
    expect(t[t.length - 1]).toBe("evaluation")
    const landing = blocks[blocks.length - 2]!
    expect(flat(landing.lines)).toBe(
      [
        "All set, Priya Raman. [Acme Implementation] is complete and verified.",
        "5 updates completed, 0 failed. Final state checked at {time}.",
      ].join("\n"),
    )
    expect(landing.activity?.map((i) => i.label)).toContain("Deploy API")
    expect(flat(blocks.find((b) => b.type === "timeout_reconciled")!.lines)).toBe(
      "The write to [Deploy API] timed out. I re-read it: it had applied.",
    )
  })

  it("course correction renders what changed, what it affects, and offers continue/stop", async () => {
    const h = harness()
    let mission = await h.engine.start(
      h.propose(h.actor("Priya Raman"), "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    await h.sor.externalWrite(
      {
        kind: "set_task_status",
        taskId: h.task("Acme Implementation", "Train admins").id as never,
        status: "COMPLETED",
      },
      h.actor("Mei Tanaka").id,
      "was completed",
    )
    await h.engine.idle()
    mission = h.engine.get(mission.id)!
    const blocks = renderMission(mission, h.sor.current(), h.events.forMission(mission.id))
    const change = blocks.find((b) => b.type === "state_change")!
    expect(flat(change.lines).split("\n")[0]).toBe(
      "[Acme Implementation] changed while I was working. I paused before the next update.",
    )
    expect(flat(change.lines).split("\n")[1]).toBe(
      "What changed: [Train admins] was completed by Mei Tanaka at {time}.",
    )
    expect(change.actions.map((a) => a.kind)).toEqual(["continue", "cancel"])
  })

  it("batch on the real export renders one confirmation, then an exact non-zero-bucket summary", async () => {
    const h = harness("rocketlane-export")
    const owner = h.graph.actor(h.graph.project("PRJ-028" as never)!.ownerId!)!
    let mission = await h.engine.start(
      h.propose(
        owner,
        "Complete all projects",
        h.graph.projects.map((p) => ({ kind: "project", id: p.id })),
      ),
      { datasetId: "x" },
    )
    let blocks = renderMission(mission, h.sor.current(), h.events.forMission(mission.id))
    expect(types(blocks)).toEqual(["acknowledgement", "activity", "action_request.batch_confirm"])
    mission = await h.engine.approve(mission.id, null)
    blocks = renderMission(mission, h.sor.current(), h.events.forMission(mission.id))
    expect(types(blocks)).toEqual([
      // Erin Warner owns one blocked project; the rest are not hers. No write, so no second phase.
      "acknowledgement",
      "activity",
      "partial_summary",
      "evaluation",
    ])
    const result = blocks.find((b) => b.type === "partial_summary")!
    const summary = flat(result.lines)
    expect(summary).toMatch(/not permitted\./)
    expect(summary).not.toMatch(/\b0 /)
    expect(result.detail).toHaveLength(31)
  })
})
