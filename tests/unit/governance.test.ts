import { describe, expect, it } from "vitest"

import type { WorkspaceGraph } from "@/core/domain/graph"
import type { EntityRef } from "@/core/domain/ids"
import { DEFAULT_GOVERNANCE_CONFIG, evaluateGovernance } from "@/core/governance/engine"
import { RoleBasedPermissions } from "@/core/governance/permissions"
import { ingestFixture } from "../helpers/fixtures"

const { graph } = ingestFixture("cascading-conflicts")

function byName(g: WorkspaceGraph, project: string, task?: string): EntityRef {
  const p = g.projects.find((x) => x.name === project)!
  if (!task) return { kind: "project", id: p.id }
  const t = g.tasksOf(p.id).find((x) => x.name === task)!
  return { kind: "task", id: t.id }
}

const failing = (target: EntityRef, g: WorkspaceGraph = graph) =>
  evaluateGovernance(g, { target, to: "COMPLETED" })
    .evaluations.filter((e) => e.triggerMatched && !e.allowed)
    .map((e) => e.policyId)

describe("evaluateGovernance — the four supplied policies", () => {
  it("P1 blocks project completion while milestones are incomplete, with evidence", () => {
    const decision = evaluateGovernance(graph, {
      target: byName(graph, "Acme Implementation"),
      to: "COMPLETED",
    })
    expect(decision.allowed).toBe(false)
    const p1 = decision.evaluations.find((e) => e.policyId === "P1_PROJECT_MILESTONES")!
    expect(p1.triggerMatched).toBe(true)
    expect(p1.blockingReasons).toEqual(["MILESTONES_INCOMPLETE"])
    expect(p1.evidence.map((e) => e.label).sort()).toEqual(["Go-Live", "Training Complete"])
    // Task-only policies do not fire on a project.
    expect(decision.evaluations.filter((e) => e.triggerMatched).map((e) => e.policyId)).toEqual([
      "P1_PROJECT_MILESTONES",
    ])
  })

  it("P1 allows a project whose milestones are all complete", () => {
    expect(failing(byName(graph, "Northwind Migration"))).toEqual([])
  })

  it("P2 blocks a milestone with an open subtask and does not fire on non-milestones", () => {
    expect(failing(byName(graph, "Acme Implementation", "Training Complete"))).toEqual([
      "P2_MILESTONE_SUBTASKS",
    ])
    const decision = evaluateGovernance(graph, {
      target: byName(graph, "Acme Implementation", "Documentation"),
      to: "COMPLETED",
    })
    const p2 = decision.evaluations.find((e) => e.policyId === "P2_MILESTONE_SUBTASKS")!
    expect(p2.triggerMatched).toBe(false)
  })

  it("P3 blocks a task whose predecessor is incomplete", () => {
    expect(failing(byName(graph, "Acme Implementation", "Go-Live"))).toEqual([
      "P3_TASK_PREDECESSORS",
    ])
    expect(failing(byName(graph, "Acme Implementation", "Deploy API"))).toEqual([
      "P3_TASK_PREDECESSORS",
    ])
  })

  it("P4 blocks a task with no time logged and passes once time exists", () => {
    expect(failing(byName(graph, "Acme Implementation", "QA Complete"))).toEqual(["P4_TASK_TIME"])
    const qa = graph
      .tasksOf(byName(graph, "Acme Implementation").id as never)
      .find((t) => t.name === "QA Complete")!
    const withTime = graph.with({
      tasks: [
        {
          ...qa,
          timeEntries: [
            { id: "te" as never, taskId: qa.id, hours: 2, actorId: "a" as never, at: null },
          ],
          version: 2,
        },
      ],
    })
    expect(failing({ kind: "task", id: qa.id }, withTime)).toEqual([])
  })

  it("is deterministic: identical input yields identical evaluation", () => {
    const target = byName(graph, "Acme Implementation", "Go-Live")
    const a = evaluateGovernance(graph, { target, to: "COMPLETED" })
    const b = evaluateGovernance(graph, { target, to: "COMPLETED" })
    expect(a).toEqual(b)
  })

  it("honours the NA interpretation switch (A-01)", () => {
    const training = graph
      .tasksOf(byName(graph, "Acme Implementation").id as never)
      .find((t) => t.name === "Train admins")!
    const asNa = graph.with({ tasks: [{ ...training, status: "NA", version: 2 }] })
    const target = byName(graph, "Acme Implementation", "Training Complete")
    expect(failing(target, asNa)).toEqual([])
    const strict = evaluateGovernance(
      asNa,
      { target, to: "COMPLETED" },
      { config: { ...DEFAULT_GOVERNANCE_CONFIG, interpretation: { naCountsAsOpen: true } } },
    )
    expect(strict.allowed).toBe(false)
  })
})

describe("RoleBasedPermissions (our abstract boundary, D-15)", () => {
  const permissions = new RoleBasedPermissions()
  const acme = graph.projects.find((p) => p.name === "Acme Implementation")!
  const owner = graph.actor(acme.ownerId!)!
  const mei = graph.actors.find((a) => a.name === "Mei Tanaka")!

  it("lets the owner complete the project and offers no escalation", () => {
    const check = permissions.check(
      owner,
      "complete_project",
      { kind: "project", id: acme.id },
      graph,
    )
    expect(check.allowed).toBe(true)
    expect(check.escalation).toBeNull()
  })

  it("denies a member completing the project and points to the owner", () => {
    const check = permissions.check(
      mei,
      "complete_project",
      { kind: "project", id: acme.id },
      graph,
    )
    expect(check.allowed).toBe(false)
    expect(check.escalation?.toName).toBe("Priya Raman")
  })

  it("lets a member act only on tasks assigned to them", () => {
    const qa = byName(graph, "Acme Implementation", "QA Complete")
    const deploy = byName(graph, "Acme Implementation", "Deploy API")
    expect(permissions.check(mei, "log_time", qa, graph).allowed).toBe(true)
    expect(permissions.check(mei, "complete_task", deploy, graph).allowed).toBe(false)
  })
})
