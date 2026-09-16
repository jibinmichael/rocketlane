import { describe, expect, it } from "vitest"

import { renderMission } from "@/core/agent/conversation/renderer"
import { WorkspaceGraph } from "@/core/domain/graph"
import { projectId, taskId } from "@/core/domain/ids"
import { RoleBasedPermissions } from "@/core/governance/permissions"
import {
  bannedIn,
  engineOn,
  ingestRows,
  mkGraph,
  mkProject,
  mkTask,
  owner,
  pref,
  projectRow,
  stranger,
  taskRow,
} from "./_helpers"

/** Three independent projects, each with one milestone task that already has time logged. */
function threeProjects(): WorkspaceGraph {
  return mkGraph({
    projects: [mkProject("P1"), mkProject("P2"), mkProject("P3")],
    tasks: [
      mkTask({ id: "T1", project: "P1", milestone: true, hours: 1 }),
      mkTask({ id: "T2", project: "P2", milestone: true, hours: 1 }),
      mkTask({ id: "T3", project: "P3", milestone: true, hours: 1 }),
    ],
  })
}

const ALL = [pref("P1"), pref("P2"), pref("P3")]

describe("batch — permissions", () => {
  it("an actor who owns none of the projects: every target is permission_denied, zero writes, one terminal state", async () => {
    const h = engineOn(threeProjects())
    let mission = await h.engine.start(h.propose(stranger, ALL), { datasetId: "qa" })
    if (mission.pending?.kind === "confirm_plan") mission = await h.engine.approve(mission.id, null)
    expect(mission.state).toBe("PERMISSION_DENIED")
    expect(mission.outcome?.permissionDenied).toBe(3)
    expect(mission.outcome?.completed).toBe(0)
    expect(h.sor.serialize().changeCount).toBe(0)
    expect(mission.plan.every((s) => s.status === "permission_denied")).toBe(true)
    const denied = h.events.forMission(mission.id).filter((e) => e.type === "PERMISSION_DENIED")
    expect(denied.length).toBeGreaterThanOrEqual(3)
  })

  // FINDING (low): `requiresPlanConfirmation` counts HIGH_IMPACT steps that are already
  // permission_denied, so a batch in which the actor can run nothing still asks "Run 6 updates?".
  // Approving runs nothing. Fix (core/execution/flight-plan.ts): compute requiresPlanConfirmation
  // over steps with status "pending" only.
  it("a batch in which nothing is runnable does not ask for a batch confirmation", async () => {
    const h = engineOn(threeProjects())
    const mission = await h.engine.start(h.propose(stranger, ALL), { datasetId: "qa" })
    expect(mission.pending?.kind).not.toBe("confirm_plan")
    expect(mission.state).toBe("PERMISSION_DENIED")
  })

  it("mixed ownership: owned projects complete, the rest are denied, nothing leaks across", async () => {
    const graph = mkGraph({
      projects: [
        mkProject("P1"),
        mkProject("P2", { ownerId: stranger.id, ownerName: stranger.name }),
      ],
      tasks: [
        mkTask({ id: "T1", project: "P1", milestone: true, hours: 1 }),
        mkTask({ id: "T2", project: "P2", milestone: true, hours: 1 }),
      ],
      actors: [
        { ...owner, projectIds: [projectId("P1")] },
        { ...stranger, projectIds: [projectId("P2")] },
      ],
    })
    const h = engineOn(graph)
    let mission = await h.engine.start(h.propose(owner, [pref("P1"), pref("P2")]), {
      datasetId: "qa",
    })
    expect(mission.pending?.kind).toBe("confirm_plan")
    mission = await h.engine.approve(mission.id, null)
    expect(mission.state).toBe("PARTIALLY_COMPLETED")
    expect(mission.outcome).toMatchObject({ completed: 1, permissionDenied: 1 })
    expect(h.sor.current().project(projectId("P2"))?.status).toBe("IN_PROGRESS")
    expect(h.sor.current().task(taskId("T2"))?.status).toBe("TODO")
    expect(h.sor.serialize().changeCount).toBe(2)
  })
})

describe("batch — cancel mid-way", () => {
  // FINDING (high): cancel() during a running batch is overwritten. `run()` re-reads the mission
  // after each step but only honours STALE; the CANCELLED mission committed by cancel() is replaced by
  // the step result and the loop keeps writing until the batch is exhausted. Here cancel is issued
  // while the first step is suspended at `await sor.snapshot()` — before any write — yet all 6
  // writes land. Fix (core/execution/engine.ts run()): after `execute` returns, if the stored mission
  // is terminal, merge the step result into it and stop; and in execute(), re-check
  // `isTerminal(this.require(mission.id))` immediately before `sor.write`.
  it("cancel issued during the batch run stops before the next write", async () => {
    const h = engineOn(threeProjects())
    h.sor.injectFault({ kind: "latency", ms: 10 })
    const mission = await h.engine.start(h.propose(owner, ALL), { datasetId: "qa" })
    expect(mission.pending?.kind).toBe("confirm_plan")
    const approving = h.engine.approve(mission.id, null)
    const cancelled = h.engine.cancel(mission.id)
    expect(cancelled.state).toBe("CANCELLED")
    const after = await approving
    await h.engine.idle()
    expect(h.engine.get(mission.id)?.state).toBe("CANCELLED")
    expect(after.state).toBe("CANCELLED")
    // At most the single in-flight write may land; nothing new starts (spec §11).
    expect(h.sor.serialize().changeCount).toBeLessThanOrEqual(1)
    expect(after.outcome!.cancelled).toBeGreaterThanOrEqual(2)
  })

  it("cancel via a listener the moment the first write is verified: later projects untouched", async () => {
    const h = engineOn(threeProjects())
    let cancelledAt = -1
    h.engine.subscribe((m) => {
      if (cancelledAt === -1 && m.plan.some((s) => s.status === "succeeded")) {
        cancelledAt = h.sor.serialize().changeCount
        h.engine.cancel(m.id)
      }
    })
    let mission = await h.engine.start(h.propose(owner, ALL), { datasetId: "qa" })
    mission = await h.engine.approve(mission.id, null)
    await h.engine.idle()
    const final = h.engine.get(mission.id)!
    expect(cancelledAt).toBeGreaterThan(0)
    expect(final.state).toBe("CANCELLED")
    expect(h.sor.serialize().changeCount).toBe(cancelledAt)
    expect(final.outcome!.completed + final.outcome!.cancelled).toBe(3)
    void mission
  })

  it("declining the batch plan cancels with zero writes and an exact outcome", async () => {
    const h = engineOn(threeProjects())
    let mission = await h.engine.start(h.propose(owner, ALL), { datasetId: "qa" })
    mission = await h.engine.decline(mission.id, null)
    expect(mission.state).toBe("CANCELLED")
    expect(h.sor.serialize().changeCount).toBe(0)
    expect(
      mission.outcome?.perTarget.every((t) => t.outcome === "pending" || t.outcome === "cancelled"),
    ).toBe(true)
  })
})

describe("batch — data flags and honest aggregation", () => {
  it("a project with a DEPENDENCY_UNRESOLVED milestone is reported blocked; the clean project completes", async () => {
    const { graph } = ingestRows(
      [
        projectRow({ ProjectId: "PRJ-1", ProjectName: "Clean" }),
        projectRow({ ProjectId: "PRJ-2", ProjectName: "Flagged" }),
      ],
      [
        taskRow({
          ProjectId: "PRJ-1",
          TaskId: "TSK-1",
          TaskName: "Ship",
          "Is this a Billing Milestone?": "true",
        }),
        taskRow({
          ProjectId: "PRJ-2",
          TaskId: "TSK-2",
          TaskName: "Launch",
          "Is this a Billing Milestone?": "true",
          Dependency: "Nonexistent upstream",
        }),
      ],
    )
    expect(graph.task(taskId("TSK-2"))?.flags).toContain("DEPENDENCY_UNRESOLVED")
    const h = engineOn(graph)
    const actor = graph.actor(graph.project(projectId("PRJ-1"))!.ownerId!)!
    let mission = await h.engine.start(h.propose(actor, [pref("PRJ-1"), pref("PRJ-2")]), {
      datasetId: "qa",
    })
    expect(mission.pending?.kind).toBe("confirm_plan")
    mission = await h.engine.approve(mission.id, null)
    expect(mission.state).toBe("PARTIALLY_COMPLETED")
    expect(mission.outcome).toMatchObject({ completed: 1, blocked: 1 })
    expect(h.sor.current().project(projectId("PRJ-1"))?.status).toBe("COMPLETED")
    expect(h.sor.current().project(projectId("PRJ-2"))?.status).toBe("IN_PROGRESS")
    expect(h.sor.current().task(taskId("TSK-2"))?.status).toBe("TODO")
    expect(mission.blockers.some((b) => b.requiredChange.kind === "fix_data")).toBe(true)
    const blocks = renderMission(mission, h.sor.current(), h.events.forMission(mission.id))
    expect(bannedIn(blocks)).toEqual([])
    expect(blocks.some((b) => b.type === "partial_summary")).toBe(true)
  })

  it("a batch never solicits hours per task: targets needing time are reported blocked, not asked", async () => {
    const graph = mkGraph({
      projects: [mkProject("P1"), mkProject("P2")],
      tasks: [
        mkTask({ id: "T1", project: "P1", milestone: true, hours: 1 }),
        mkTask({ id: "T2", project: "P2", milestone: true, hours: 0 }),
      ],
    })
    const h = engineOn(graph)
    let mission = await h.engine.start(h.propose(owner, [pref("P1"), pref("P2")]), {
      datasetId: "qa",
    })
    mission = await h.engine.approve(mission.id, null)
    expect(mission.pending).toBeNull()
    expect(mission.outcome).toMatchObject({ completed: 1, blocked: 1 })
    expect(h.sor.current().task(taskId("T2"))?.status).toBe("TODO")
  })

  it("batch outcome buckets always sum to the number of targets", async () => {
    const h = engineOn(threeProjects())
    let mission = await h.engine.start(h.propose(owner, ALL), { datasetId: "qa" })
    mission = await h.engine.approve(mission.id, null)
    const o = mission.outcome!
    expect(
      o.completed + o.blocked + o.alreadyComplete + o.failed + o.cancelled + o.permissionDenied,
    ).toBe(3)
    expect(mission.state).toBe("COMPLETED")
    expect(h.sor.serialize().changeCount).toBe(6)
  })

  it("a batch where one project already completed and another fails twice: exact buckets", async () => {
    const graph = mkGraph({
      projects: [mkProject("P1", { status: "COMPLETED", rawStatus: "Completed" }), mkProject("P2")],
      tasks: [mkTask({ id: "T2", project: "P2", milestone: true, hours: 1 })],
    })
    const h = engineOn(graph)
    h.sor.injectFault({ kind: "fail_once", match: { ref: { kind: "task", id: taskId("T2") } } })
    h.sor.injectFault({ kind: "fail_once", match: { ref: { kind: "task", id: taskId("T2") } } })
    let mission = await h.engine.start(h.propose(owner, [pref("P1"), pref("P2")]), {
      datasetId: "qa",
    })
    if (mission.pending?.kind === "confirm_plan") mission = await h.engine.approve(mission.id, null)
    expect(mission.outcome).toMatchObject({ alreadyComplete: 1, failed: 1, completed: 0 })
    expect(mission.state).toBe("PARTIALLY_COMPLETED")
    expect(h.sor.current().project(projectId("P2"))?.status).toBe("IN_PROGRESS")
  })

  it("RoleBasedPermissions denies a project whose target project is missing from the graph", () => {
    const graph = mkGraph({})
    const check = new RoleBasedPermissions().check(owner, "complete_project", pref("GHOST"), graph)
    expect(check.allowed).toBe(false)
  })
})
