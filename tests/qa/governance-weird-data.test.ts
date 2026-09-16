import { describe, expect, it } from "vitest"

import { renderMission } from "@/core/agent/conversation/renderer"
import { hoursTracked } from "@/core/domain/entities"
import { taskId } from "@/core/domain/ids"
import { DEFAULT_GOVERNANCE_CONFIG, evaluateGovernance } from "@/core/governance/engine"
import type { GovernanceConfig } from "@/core/governance/policy"
import { resolveClosure, traceCurrentBlockers } from "@/core/resolver/blockers"
import {
  engineOn,
  ingestRows,
  mkGraph,
  mkProject,
  mkTask,
  owner,
  pref,
  projectRow,
  taskRow,
  tref,
} from "./_helpers"

const NA_OPEN: GovernanceConfig = { interpretation: { naCountsAsOpen: true }, minimumHours: 0 }

describe("governance — predecessor cycles", () => {
  it("A→B→A (unflagged, hand-built): evaluation blocks both and the closure terminates", () => {
    const g = mkGraph({
      tasks: [
        mkTask({ id: "A", predecessors: ["B"], hours: 1 }),
        mkTask({ id: "B", predecessors: ["A"], hours: 1 }),
      ],
    })
    expect(evaluateGovernance(g, { target: tref("A"), to: "COMPLETED" }).allowed).toBe(false)
    expect(evaluateGovernance(g, { target: tref("B"), to: "COMPLETED" }).allowed).toBe(false)
    const closure = resolveClosure(tref("A"), g)
    expect(closure.requiredTransitions.map((r) => r.ref.id).sort()).toEqual(["A", "B"])
    expect(g.predecessorCycles().size).toBe(2)
  })

  // FINDING: traceCurrentBlockers returns [] for an unflagged predecessor cycle. The walk hits the
  // `seen` guard and silently stops, so a BLOCKED mission carries zero blockers and the renderer has
  // nothing to explain. Fix (core/resolver/blockers.ts, traceCurrentBlockers): when `walk` reaches a
  // ref already in `seen` that is on the current path, push a DATA blocker
  // { reasonCode: "DATA_FLAGGED", requiredChange: { kind: "fix_data", flag: "CYCLE" } }.
  it("A→B→A (unflagged): blocker trace still names something actionable", () => {
    const g = mkGraph({
      tasks: [
        mkTask({ id: "A", predecessors: ["B"], hours: 1 }),
        mkTask({ id: "B", predecessors: ["A"], hours: 1 }),
      ],
    })
    expect(traceCurrentBlockers(tref("A"), g).length).toBeGreaterThan(0)
  })

  // FINDING (same root cause as above, surfaces in the renderer): a BLOCKED mission with empty
  // blockers renders "can be completed. N updates required." followed by "stays open" — two
  // contradictory outcome blocks. Fix (core/agent/conversation/renderer.ts): derive the outcome
  // block from mission.state (BLOCKED ⇒ outcome.blocked), not from `mission.blockers.length > 0`.
  it("A→B→A (unflagged) through the engine: BLOCKED, nothing written, no contradictory copy", async () => {
    const g = mkGraph({
      tasks: [
        mkTask({ id: "A", predecessors: ["B"], hours: 1 }),
        mkTask({ id: "B", predecessors: ["A"], hours: 1 }),
      ],
    })
    const h = engineOn(g)
    const mission = await h.engine.start(h.propose(owner, [tref("A")]), { datasetId: "qa" })
    expect(mission.state).toBe("BLOCKED")
    expect(h.sor.serialize().changeCount).toBe(0)
    const types = renderMission(mission, h.sor.current(), h.events.forMission(mission.id)).map(
      (b) => b.type,
    )
    expect(types).not.toContain("outcome.ready")
  })

  it("A→B→A via CSV is flagged CYCLE at ingestion and non-completable with a DATA blocker", () => {
    const { graph, report } = ingestRows(
      [projectRow({ ProjectId: "PRJ-1", ProjectName: "One" })],
      [
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-1", TaskName: "A", Dependency: "B" }),
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-2", TaskName: "B", Dependency: "A" }),
      ],
    )
    expect(report.findings.some((f) => f.kind === "CYCLE")).toBe(true)
    expect(graph.task(taskId("TSK-1"))?.flags).toContain("CYCLE")
    const decision = evaluateGovernance(graph, { target: tref("TSK-1"), to: "COMPLETED" })
    expect(decision.allowed).toBe(false)
    const blockers = traceCurrentBlockers(tref("TSK-1"), graph)
    expect(blockers.some((b) => b.requiredChange.kind === "fix_data")).toBe(true)
  })

  it("self-predecessor via CSV is a one-node cycle: flagged, blocked, closure terminates", () => {
    const { graph } = ingestRows(
      [projectRow({ ProjectId: "PRJ-1", ProjectName: "One" })],
      [taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-1", TaskName: "Loop", Dependency: "Loop" })],
    )
    const t = graph.task(taskId("TSK-1"))!
    expect(t.predecessorIds).toEqual(["TSK-1"])
    expect(t.flags).toContain("CYCLE")
    expect(evaluateGovernance(graph, { target: tref("TSK-1"), to: "COMPLETED" }).allowed).toBe(
      false,
    )
    // Flagged data fails closed: no write is planned; the blocker names the fix.
    const closure = resolveClosure(tref("TSK-1"), graph)
    expect(closure.requiredTransitions).toHaveLength(0)
    expect(closure.blockers.some((b) => b.requiredChange.kind === "fix_data")).toBe(true)
  })

  it("self-predecessor hand-built (no flag): closure terminates; task is permanently blocked", () => {
    const g = mkGraph({ tasks: [mkTask({ id: "A", predecessors: ["A"], hours: 1 })] })
    expect(resolveClosure(tref("A"), g).requiredTransitions).toHaveLength(1)
    expect(evaluateGovernance(g, { target: tref("A"), to: "COMPLETED" }).allowed).toBe(false)
  })
})

describe("governance — cross-project predecessor", () => {
  it("a Dependency naming a task in another project is DEPENDENCY_UNRESOLVED at ingestion", () => {
    const { graph, report } = ingestRows(
      [
        projectRow({ ProjectId: "PRJ-1", ProjectName: "One" }),
        projectRow({ ProjectId: "PRJ-2", ProjectName: "Two" }),
      ],
      [
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-1", TaskName: "Upstream" }),
        taskRow({
          ProjectId: "PRJ-2",
          TaskId: "TSK-2",
          TaskName: "Downstream",
          Dependency: "Upstream",
        }),
      ],
    )
    const t = graph.task(taskId("TSK-2"))!
    expect(t.predecessorIds).toEqual([])
    expect(t.flags).toContain("DEPENDENCY_UNRESOLVED")
    expect(report.findings.some((f) => f.kind === "DEPENDENCY_UNRESOLVED")).toBe(true)
    expect(report.counts.dependencies).toBe(0)
    expect(evaluateGovernance(graph, { target: tref("TSK-2"), to: "COMPLETED" }).allowed).toBe(
      false,
    )
    // Never expands scope into PRJ-1.
    const closure = resolveClosure(tref("TSK-2"), graph)
    expect(closure.entityIds.has("TSK-1")).toBe(false)
  })

  it("hand-built cross-project predecessor does not crash the closure", () => {
    const g = mkGraph({
      projects: [mkProject("P1"), mkProject("P2")],
      tasks: [
        mkTask({ id: "A", project: "P1", hours: 1 }),
        mkTask({ id: "B", project: "P2", predecessors: ["A"], hours: 1 }),
      ],
    })
    expect(() => resolveClosure(tref("B"), g)).not.toThrow()
    expect(() => traceCurrentBlockers(pref("P2"), g)).not.toThrow()
  })
})

describe("governance — NA interpretation switch (A-01)", () => {
  const graph = () =>
    mkGraph({
      tasks: [
        mkTask({ id: "M", milestone: true, hours: 1 }),
        mkTask({ id: "S", parent: "M", status: "NA" }),
      ],
    })

  it("default: NA subtask does not block the milestone and is not in the closure", () => {
    const g = graph()
    expect(evaluateGovernance(g, { target: tref("M"), to: "COMPLETED" }).allowed).toBe(true)
    const closure = resolveClosure(tref("M"), g)
    expect(closure.requiredTransitions.map((r) => `${r.ref.id}:${r.to}`)).toEqual(["M:COMPLETED"])
  })

  it("naCountsAsOpen: NA subtask blocks the milestone and joins the closure", () => {
    const g = graph()
    const d = evaluateGovernance(g, { target: tref("M"), to: "COMPLETED" }, { config: NA_OPEN })
    expect(d.allowed).toBe(false)
    expect(
      d.evaluations.find((e) => e.policyId === "P2_MILESTONE_SUBTASKS")?.blockingReasons,
    ).toEqual(["SUBTASKS_OPEN"])
    const closure = resolveClosure(tref("M"), g, NA_OPEN)
    expect(closure.requiredTransitions.map((r) => `${r.ref.id}:${r.to}`)).toEqual([
      "S:TIME_LOGGED",
      "S:COMPLETED",
      "M:COMPLETED",
    ])
  })

  // FINDING: A-01 says NA counts as CLOSED for policies 1–3 by default, but P1 and P3 test
  // `isTaskComplete` (COMPLETED only) instead of `!isTaskOpen(status, interpretation)`. A project
  // whose only milestone is NA is permanently blocked under the default interpretation, and the
  // closure would have the agent COMPLETE an NA task to satisfy P1. Fix
  // (core/governance/policies/supplied-policies.ts P1 + P3 and core/resolver/blockers.ts visitTask):
  // filter with `isTaskOpen(m.status, ctx.config.interpretation)`.
  it("default: an NA milestone does not block project completion (policy 1)", () => {
    const g = mkGraph({ tasks: [mkTask({ id: "M", milestone: true, status: "NA" })] })
    const d = evaluateGovernance(g, { target: pref("P1"), to: "COMPLETED" })
    expect(d.allowed).toBe(true)
    expect(resolveClosure(pref("P1"), g).requiredTransitions.map((r) => r.ref.id)).toEqual(["P1"])
  })

  // FINDING: same defect for policy 3 — an NA predecessor blocks its dependents forever by default.
  it("default: an NA predecessor does not block its dependent (policy 3)", () => {
    const g = mkGraph({
      tasks: [
        mkTask({ id: "A", status: "NA" }),
        mkTask({ id: "B", predecessors: ["A"], hours: 1 }),
      ],
    })
    expect(evaluateGovernance(g, { target: tref("B"), to: "COMPLETED" }).allowed).toBe(true)
  })

  it("naCountsAsOpen: an NA milestone blocks project completion", () => {
    const g = mkGraph({ tasks: [mkTask({ id: "M", milestone: true, status: "NA" })] })
    expect(
      evaluateGovernance(g, { target: pref("P1"), to: "COMPLETED" }, { config: NA_OPEN }).allowed,
    ).toBe(false)
  })
})

describe("governance — BLOCKED status tasks", () => {
  // FINDING: a task in status BLOCKED with time logged and no open predecessors passes all four
  // policies, so the engine completes it. The resolver emits an `unblock_task` blocker with
  // systemCanAct=false and the renderer says "(outside my authority)", so the system contradicts
  // itself: it declares the change outside its authority, then performs it. Fix
  // (core/execution/engine.ts execute()): precondition — if step.ref is a task whose status is
  // BLOCKED, markTargetBlocked with the resolver's unblock_task blocker instead of writing. Or, if
  // completing BLOCKED tasks is intended, drop the unblock_task blocker from blockers.ts.
  it("the engine never completes a task a human has marked BLOCKED", async () => {
    const g = mkGraph({ tasks: [mkTask({ id: "T", status: "BLOCKED", hours: 2 })] })
    const closure = resolveClosure(tref("T"), g)
    expect(closure.blockers.some((b) => b.requiredChange.kind === "unblock_task")).toBe(true)
    const h = engineOn(g)
    const mission = await h.engine.start(h.propose(owner, [tref("T")]), { datasetId: "qa" })
    expect(h.sor.current().task(taskId("T"))?.status).toBe("BLOCKED")
    expect(mission.state).toBe("BLOCKED")
  })

  it("a BLOCKED predecessor blocks its dependent under policy 3 with a path to it", () => {
    const g = mkGraph({
      tasks: [
        mkTask({ id: "A", status: "BLOCKED", hours: 1 }),
        mkTask({ id: "B", predecessors: ["A"], hours: 1 }),
      ],
    })
    expect(evaluateGovernance(g, { target: tref("B"), to: "COMPLETED" }).allowed).toBe(false)
    const blockers = traceCurrentBlockers(tref("B"), g)
    expect(blockers.length).toBeGreaterThan(0)
    expect(blockers[0]?.dependencyPath.map((r) => r.id)).toEqual(["B", "A"])
  })
})

describe("governance — degenerate projects", () => {
  it("a project with zero tasks is completable, high impact, and asks for confirmation", async () => {
    const g = mkGraph({ tasks: [] })
    expect(evaluateGovernance(g, { target: pref("P1"), to: "COMPLETED" }).allowed).toBe(true)
    const h = engineOn(g)
    let mission = await h.engine.start(h.propose(owner, [pref("P1")]), { datasetId: "qa" })
    expect(mission.state).toBe("WAITING")
    expect(mission.pending?.kind).toBe("confirm_step")
    expect(mission.plan[0]?.actionClass).toBe("HIGH_IMPACT")
    mission = await h.engine.approve(mission.id, mission.plan[0]!.id)
    expect(mission.state).toBe("COMPLETED")
    expect(h.sor.current().project(pref("P1").id as never)?.status).toBe("COMPLETED")
  })

  it("a project with only NA (non-milestone) tasks completes under both interpretations, listing them as open only when NA is open", async () => {
    const g = mkGraph({
      tasks: [mkTask({ id: "N1", status: "NA" }), mkTask({ id: "N2", status: "NA" })],
    })
    expect(resolveClosure(pref("P1"), g).openButNotRequired).toHaveLength(0)
    expect(resolveClosure(pref("P1"), g, NA_OPEN).openButNotRequired).toHaveLength(2)
    for (const config of [DEFAULT_GOVERNANCE_CONFIG, NA_OPEN]) {
      const h = engineOn(g, config)
      const mission = await h.engine.start(h.propose(owner, [pref("P1")]), { datasetId: "qa" })
      expect(mission.state).toBe("WAITING")
      expect(mission.plan.every((s) => s.ref.kind === "project")).toBe(true)
      expect(h.sor.current().task(taskId("N1"))?.status).toBe("NA")
    }
  })
})

describe("governance — absurd hours", () => {
  it.each([
    [-5, false],
    [0, false],
    [Number.NaN, false],
    [1e-9, true],
    [1e308, true],
    [Number.POSITIVE_INFINITY, true],
  ])("hours=%p ⇒ policy 4 allowed=%p", (hours, allowed) => {
    const g = mkGraph({ tasks: [mkTask({ id: "T", hours })] })
    expect(hoursTracked(g.task(taskId("T"))!)).toBe(hours)
    const d = evaluateGovernance(g, { target: tref("T"), to: "COMPLETED" })
    expect(d.allowed).toBe(allowed)
    expect(() => resolveClosure(tref("T"), g)).not.toThrow()
    expect(() => traceCurrentBlockers(tref("T"), g)).not.toThrow()
  })

  it("a task whose entries sum to zero (+5, -5) has no time under policy 4", () => {
    const base = mkTask({ id: "T", hours: 5 })
    const t = {
      ...base,
      timeEntries: [
        ...base.timeEntries,
        { id: taskId("x") as never, taskId: base.id, hours: -5, actorId: owner.id, at: null },
      ],
    }
    const g = mkGraph({ tasks: [t] })
    expect(evaluateGovernance(g, { target: tref("T"), to: "COMPLETED" }).allowed).toBe(false)
  })
})
