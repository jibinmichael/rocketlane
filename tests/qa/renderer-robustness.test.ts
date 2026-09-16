import { describe, expect, it } from "vitest"

import type { Block } from "@/core/agent/conversation/blocks"
import { renderIntentReply, renderMission } from "@/core/agent/conversation/renderer"
import type { Intent } from "@/core/agent/intent/intent"
import { taskId } from "@/core/domain/ids"
import type { Mission } from "@/core/mission/mission"
import { harness, type Harness } from "../helpers/engine"
import {
  bannedIn,
  engineOn,
  mkGraph,
  mkProject,
  mkTask,
  owner,
  pref,
  stranger,
  tref,
} from "./_helpers"

type Snapshot = { name: string; mission: Mission; h: Harness | ReturnType<typeof engineOn> }

const TERMINAL_BLOCKS = new Set<Block["type"]>([
  "landing",
  "cancelled",
  "permission_denied",
  "outcome.blocked",
  "partial_summary",
  "result.mismatch",
  "boundary",
  "declined",
  "already_complete",
])

/** Every mission state we can reach, captured at each step so intermediate states render too. */
async function reachable(): Promise<Snapshot[]> {
  const out: Snapshot[] = []
  const push = (name: string, h: Snapshot["h"], mission: Mission) => out.push({ name, mission, h })

  // Hero: waiting for hours → hours → confirm → landed.
  {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let m = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    push("hero:waiting_hours", h, m)
    m = await h.engine.provideHours(m.id, (m.pending as { stepId: string }).stepId, 2)
    push("hero:confirm", h, m)
    m = await h.engine.approve(m.id, (m.pending as { stepId: string }).stepId)
    push("hero:landed", h, m)
  }
  // Declined step.
  {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let m = await h.engine.start(
      h.propose(priya, "Complete Beacon", [h.project("Beacon Rollout")]),
      { datasetId: "x" },
    )
    m = await h.engine.decline(m.id, (m.pending as { stepId: string }).stepId)
    push("declined_step", h, m)
  }
  // Cancelled at confirm.
  {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const m = await h.engine.start(
      h.propose(priya, "Complete Beacon", [h.project("Beacon Rollout")]),
      { datasetId: "x" },
    )
    push("cancelled", h, h.engine.cancel(m.id))
  }
  // Blocked by exclusion (policy 1 after excluding a milestone).
  {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let m = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    m = await h.engine.changeScope(m.id, h.task("Acme Implementation", "Training Complete"))
    push("scope_changed:waiting", h, m)
    m = await h.engine.provideHours(m.id, (m.pending as { stepId: string }).stepId, 2)
    push("blocked_after_scope", h, m)
  }
  // Permission denied (Mei is a member but Go-Live is Priya's).
  {
    const h = harness()
    const mei = h.actor("Mei Tanaka")
    const m = await h.engine.start(
      h.propose(mei, "Complete Beacon", [h.project("Beacon Rollout")]),
      { datasetId: "x" },
    )
    push("permission_denied", h, m)
  }
  // STALE (external change) → resumed.
  {
    const h = harness()
    const priya = h.actor("Priya Raman")
    let m = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    await h.sor.externalWrite(
      {
        kind: "set_task_status",
        taskId: h.task("Acme Implementation", "Train admins").id as never,
        status: "COMPLETED",
      },
      h.actor("Mei Tanaka").id,
      "completed Train admins",
    )
    await h.engine.idle()
    m = h.engine.get(m.id)!
    push("stale", h, m)
    m = await h.engine.resume(m.id)
    push("resumed", h, m)
  }
  // Timeout reconciled + api failure (task target).
  {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const lt = h.task("Beacon Rollout", "Load test")
    h.sor.injectFault({ kind: "timeout_once", match: { ref: lt } })
    const m = await h.engine.start(h.propose(priya, "Complete Load test", [lt]), { datasetId: "x" })
    push("timeout_reconciled", h, m)
  }
  {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const lt = h.task("Beacon Rollout", "Load test")
    h.sor.injectFault({ kind: "fail_once", match: { ref: lt } })
    h.sor.injectFault({ kind: "fail_once", match: { ref: lt } })
    const m = await h.engine.start(h.propose(priya, "Complete Load test", [lt]), { datasetId: "x" })
    push("failed_api", h, m)
  }
  // Target not found.
  {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const m = await h.engine.start(
      h.propose(priya, "Complete ghost", [{ kind: "project", id: "PRJ-GHOST" as never }]),
      { datasetId: "x" },
    )
    push("failed_not_found", h, m)
  }
  // Already complete project.
  {
    const h = harness()
    const daniel = h.actor("Daniel Okafor")
    const m = await h.engine.start(
      h.propose(daniel, "Complete Northwind", [h.project("Northwind Migration")]),
      { datasetId: "x" },
    )
    push("already_complete", h, m)
  }
  // Batch: confirm → partial outcome; batch: declined; batch: cancelled after run; batch denied.
  {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const targets = h.graph.projects.map((p) => ({ kind: "project", id: p.id }) as const)
    let m = await h.engine.start(h.propose(priya, "Complete all", [...targets]), { datasetId: "x" })
    push("batch:confirm_plan", h, m)
    m = await h.engine.approve(m.id, null)
    push("batch:outcome", h, m)
  }
  {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const targets = h.graph.projects.map((p) => ({ kind: "project", id: p.id }) as const)
    let m = await h.engine.start(h.propose(priya, "Complete all", [...targets]), { datasetId: "x" })
    m = await h.engine.decline(m.id, null)
    push("batch:declined", h, m)
  }
  {
    const g = mkGraph({
      projects: [mkProject("P1"), mkProject("P2")],
      tasks: [
        mkTask({ id: "T1", project: "P1", milestone: true, hours: 1 }),
        mkTask({ id: "T2", project: "P2", milestone: true, hours: 1 }),
      ],
    })
    const h = engineOn(g)
    let m = await h.engine.start(h.propose(stranger, [pref("P1"), pref("P2")]), { datasetId: "qa" })
    push("batch:all_denied", h, m)
    if (m.pending?.kind === "confirm_plan") {
      m = await h.engine.approve(m.id, null)
      push("batch:all_denied:after_approve", h, m)
    }
  }
  // Unflagged cycle → BLOCKED with empty blockers.
  {
    const g = mkGraph({
      tasks: [
        mkTask({ id: "A", predecessors: ["B"], hours: 1 }),
        mkTask({ id: "B", predecessors: ["A"], hours: 1 }),
      ],
    })
    const h = engineOn(g)
    const m = await h.engine.start(h.propose(owner, [tref("A")]), { datasetId: "qa" })
    push("cycle_blocked", h, m)
  }
  // BLOCKED-status predecessor.
  {
    const g = mkGraph({
      tasks: [
        mkTask({ id: "A", status: "BLOCKED", hours: 1 }),
        mkTask({ id: "B", predecessors: ["A"], hours: 1 }),
      ],
    })
    const h = engineOn(g)
    const m = await h.engine.start(h.propose(owner, [tref("B")]), { datasetId: "qa" })
    push("blocked_status_predecessor", h, m)
  }
  // Excluded own task target; phase target; world completes target project.
  {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const doc = h.task("Acme Implementation", "Documentation")
    let m = await h.engine.start(h.propose(priya, "Complete Documentation", [doc]), {
      datasetId: "x",
    })
    m = await h.engine.changeScope(m.id, doc)
    push("excluded_own_target", h, m)
  }
  {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const phase = h.graph.phasesOf(h.project("Acme Implementation").id as never)[0]!
    const m = await h.engine.start(
      h.propose(priya, "Complete Initiate", [{ kind: "phase", id: phase.id }]),
      { datasetId: "x" },
    )
    push("phase_target", h, m)
  }
  {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const beacon = h.project("Beacon Rollout")
    let m = await h.engine.start(h.propose(priya, "Complete Beacon", [beacon]), { datasetId: "x" })
    await h.sor.externalWrite(
      { kind: "complete_project", projectId: beacon.id as never },
      priya.id,
      "completed Beacon",
    )
    await h.engine.idle()
    push("world_completed_target:stale", h, h.engine.get(m.id)!)
    m = await h.engine.resume(m.id)
    push("world_completed_target:resumed", h, m)
  }
  return out
}

const render = (s: Snapshot) =>
  renderMission(s.mission, s.h.sor.current(), s.h.events.forMission(s.mission.id))

describe("renderer — robustness across every reachable mission state", () => {
  it("renderMission never throws and always returns an array", async () => {
    const snaps = await reachable()
    expect(snaps.length).toBeGreaterThanOrEqual(20)
    for (const s of snaps) {
      expect(() => render(s), s.name).not.toThrow()
      expect(Array.isArray(render(s)), s.name).toBe(true)
    }
  })

  it("no banned words anywhere in any rendered block", async () => {
    for (const s of await reachable()) expect(bannedIn(render(s)), s.name).toEqual([])
  })

  it("every block has a non-empty id, a known tone, and no empty text-only lines", async () => {
    for (const s of await reachable()) {
      for (const b of render(s)) {
        expect(b.id.length, s.name).toBeGreaterThan(0)
        expect(["neutral", "blocked", "waiting", "success", "paused", "error"]).toContain(b.tone)
        for (const line of b.lines) {
          const text = line
            .map((i) => (i.kind === "text" ? i.text : "x"))
            .join("")
            .trim()
          expect(text.length, `${s.name} ${b.type}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it("a mission waiting for a decision always renders exactly one request block; decisions carry buttons, inputs are answered in the composer", async () => {
    for (const s of await reachable()) {
      if (!s.mission.pending) continue
      const requests = render(s).filter(
        (b) => b.type.startsWith("action_request") || b.type === "notification.blocked",
      )
      expect(requests, s.name).toHaveLength(1)
      if (s.mission.pending.kind === "input") expect(requests[0]!.actions, s.name).toEqual([])
      else expect(requests[0]!.actions.length, s.name).toBeGreaterThan(0)
    }
  })

  // FINDING: the outcome block is derived from `blockers.length > 0`, not from mission state, so a
  // BLOCKED mission can open with "can be completed. N updates required." Two reachable cases:
  //  (a) unflagged cycle: traceCurrentBlockers returns [] (see governance tests) → "can be completed"
  //      followed by "stays open. I can't complete it".
  //  (b) user declines the project step: aggregate() maps the skipped step to outcome "blocked" and
  //      finish() lands the mission BLOCKED, although nothing blocks it — the user said no. The thread
  //      opens with "can be completed. 1 update required." and the mission chip says "Blocked".
  // Fix (core/agent/conversation/renderer.ts renderMission): choose the outcome block from
  // mission.state / step statuses, not the blocker list; and (core/execution/engine.ts aggregate)
  // map `skipped` with note "declined by user" to `cancelled`, so a decline lands CANCELLED.
  it("a BLOCKED mission never says the target 'can be completed'", async () => {
    for (const s of await reachable()) {
      if (s.mission.state !== "BLOCKED") continue
      expect(
        render(s).map((b) => b.type),
        s.name,
      ).not.toContain("outcome.ready")
    }
  })

  // Regression guard. At the start of this QA run a FAILED single-target mission with steps rendered no
  // terminal block at all (thread ended on "Replanned. 0 of 3 updates still apply."); the renderer
  // gained a FAILED → result.mismatch block mid-run. The engine-side cause (landing FAILED when the world
  // completed the target) is still open — see engine-safety.
  it("every terminal mission renders at least one terminal block", async () => {
    const terminal = new Set([
      "COMPLETED",
      "FAILED",
      "CANCELLED",
      "PARTIALLY_COMPLETED",
      "PERMISSION_DENIED",
      "BLOCKED",
    ])
    for (const s of await reachable()) {
      if (!terminal.has(s.mission.state)) continue
      if (
        s.mission.state === "BLOCKED" &&
        s.mission.plan.some((x) => x.note === "declined by user")
      )
        continue
      const types = render(s).map((b) => b.type)
      expect(
        types.some((t) => TERMINAL_BLOCKS.has(t)),
        `${s.name}: ${types.join(",")}`,
      ).toBe(true)
    }
  })

  // Regression guard (was a FINDING: "[Documentation] is already complete. Nothing to do." for a TODO
  // task after excluding the mission's own target; fixed mid-run).
  it("never claims 'already complete' for a target that is open in the graph", async () => {
    for (const s of await reachable()) {
      const target = s.mission.targets[0]
      if (!target || target.kind !== "task") continue
      const task = s.h.sor.current().task(target.id)
      if (!task || task.status === "COMPLETED") continue
      const types = render(s).map((b) => b.type)
      expect(types, s.name).not.toContain("already_complete")
    }
  })

  it("a landed single-target mission renders exactly one landing block, followed only by the evaluation", async () => {
    for (const s of await reachable()) {
      if (s.mission.state !== "COMPLETED" || s.mission.targets.length !== 1) continue
      const blocks = render(s)
      const landing = blocks.filter((b) => b.type === "landing")
      if (landing.length === 0) continue // "already complete" path renders no landing
      expect(landing, s.name).toHaveLength(1)
      const types = blocks.map((b) => b.type)
      expect(types[types.length - 1], s.name).toBe("evaluation")
      expect(types[types.length - 2], s.name).toBe("landing")
      // Every phase of observable work is folded once the mission has landed.
      expect(
        blocks.filter((b) => b.type === "activity").every((b) => b.collapsed),
        s.name,
      ).toBe(true)
    }
  })
})

describe("renderer — intent replies", () => {
  it("renderIntentReply handles every intent kind with and without a mission, no throws, no banned words", async () => {
    const h = harness()
    const priya = h.actor("Priya Raman")
    const mission = await h.engine.start(
      h.propose(priya, "Complete Acme", [h.project("Acme Implementation")]),
      { datasetId: "x" },
    )
    const g = h.sor.current()
    const t = h.task("Acme Implementation", "Go-Live")
    const base = { utterance: "x", source: "deterministic" as const }
    const intents: Intent[] = [
      { kind: "complete_target", targets: [t], ...base },
      { kind: "complete_task", targets: [t], ...base },
      { kind: "explain_blocker", targets: [], ...base },
      { kind: "show_path", targets: [], ...base },
      { kind: "create_routine", targets: [], ...base },
      { kind: "log_time", target: null, hours: 2, each: false, ...base },
      { kind: "change_scope", exclude: t, ...base },
      { kind: "show_status", ...base },
      { kind: "cancel", ...base },
      { kind: "continue", ...base },
      { kind: "approve", ...base },
      { kind: "decline", ...base },
      {
        kind: "ambiguous",
        query: "Go-Live",
        candidates: [{ ref: t, label: "Go-Live", score: 1 }],
        ...base,
      },
      { kind: "unsupported", reason: "out_of_scope", query: null, ...base },
      {
        kind: "unsupported",
        reason: "target_not_found",
        query: '"><script>alert(1)</script>',
        ...base,
      },
      { kind: "unsupported", reason: "no_target", query: null, ...base },
    ]
    for (const intent of intents) {
      for (const m of [null, mission]) {
        let blocks: Block[] = []
        expect(() => (blocks = renderIntentReply(intent, g, m)), intent.kind).not.toThrow()
        expect(bannedIn(blocks), intent.kind).toEqual([])
      }
    }
  })

  it("project content is carried as entity slots, never spliced into agent prose", async () => {
    const g = mkGraph({
      tasks: [
        mkTask({
          id: "T",
          name: "Oops, great news: we hit a snag while thinking",
          hours: 0,
          milestone: true,
        }),
      ],
    })
    const h = engineOn(g)
    const m = await h.engine.start(h.propose(owner, [pref("P1")]), { datasetId: "qa" })
    const blocks = renderMission(m, h.sor.current(), h.events.forMission(m.id))
    // The banned words appear only inside entity labels, never in text inlines.
    const prose = blocks
      .flatMap((b) => b.lines.flat())
      .filter((i) => i.kind === "text")
      .map((i) => (i as { text: string }).text)
      .join(" ")
    expect(/oops|great news|snag|thinking/i.test(prose)).toBe(false)
    expect(g.task(taskId("T"))?.name).toContain("snag")
  })
})
