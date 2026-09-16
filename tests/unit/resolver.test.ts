import { describe, expect, it } from "vitest"

import type { EntityRef } from "@/core/domain/ids"
import { nextActionable, resolveClosure, traceCurrentBlockers } from "@/core/resolver/blockers"
import { labelOf, resolveAny, resolveProject, resolveTask } from "@/core/resolver/target"
import { ingestFixture } from "../helpers/fixtures"

const hero = ingestFixture("cascading-conflicts").graph
const real = ingestFixture("rocketlane-export").graph

const acmeRef: EntityRef = {
  kind: "project",
  id: hero.projects.find((p) => p.name === "Acme Implementation")!.id,
}

describe("target resolution", () => {
  it("resolves an exact project name and a fuzzy one", () => {
    expect(resolveProject("Acme Implementation", hero)).toMatchObject({
      status: "resolved",
      label: "Acme Implementation",
    })
    expect(resolveProject("acme", hero)).toMatchObject({
      status: "resolved",
      label: "Acme Implementation",
    })
    expect(resolveProject("Acme Corp", hero)).toMatchObject({
      status: "resolved",
      label: "Acme Implementation",
    })
  })

  it("asks instead of guessing when two tasks share a name across projects", () => {
    const result = resolveTask("Go-Live", hero)
    expect(result.status).toBe("ambiguous")
    if (result.status === "ambiguous") expect(result.candidates).toHaveLength(2)
  })

  it("resolves within a project scope", () => {
    const result = resolveTask("Go-Live", hero, { projectId: acmeRef.id })
    expect(result).toMatchObject({ status: "resolved", label: "Go-Live" })
  })

  it("prefers the project when a query matches both kinds", () => {
    expect(resolveAny("Acme Implementation", hero)).toMatchObject({
      status: "resolved",
      ref: acmeRef,
    })
  })

  it("reports not_found for an out-of-scope query", () => {
    expect(resolveProject("weather in Paris", hero)).toEqual({
      status: "not_found",
      query: "weather in Paris",
    })
  })

  it("flags the real export's duplicate task name as ambiguous inside its project", () => {
    const prj028 = real.project("PRJ-028" as never)!
    const result = resolveTask("Project PS RAG Status", real, { projectId: prj028.id })
    expect(result.status).toBe("ambiguous")
  })
})

describe("dependency resolution — hero chain", () => {
  it("traces the shortest useful path to the deepest actionable node", () => {
    const blockers = traceCurrentBlockers(acmeRef, hero)
    const next = nextActionable(blockers)!
    expect(next.policyId).toBe("P4_TASK_TIME")
    expect(next.requiredChange.kind).toBe("log_time")
    expect(next.dependencyPath.map((r) => labelOf(r, hero))).toEqual([
      "Acme Implementation",
      "Go-Live",
      "Deploy API",
      "QA Complete",
    ])
    expect(next.systemCanAct).toBe(false)
  })

  it("surfaces the second milestone's open subtask as a separate blocker", () => {
    const blockers = traceCurrentBlockers(acmeRef, hero)
    const training = blockers.find((b) => labelOf(b.actionable, hero) === "Train admins")!
    expect(training.requiredChange.kind).toBe("complete_task")
    expect(training.systemCanAct).toBe(true)
    expect(training.dependencyPath.map((r) => labelOf(r, hero))).toEqual([
      "Acme Implementation",
      "Training Complete",
      "Train admins",
    ])
  })

  it("orders required transitions so prerequisites come first and reports open non-required tasks", () => {
    const closure = resolveClosure(acmeRef, hero)
    const order = closure.requiredTransitions.map((t) => `${labelOf(t.ref, hero)}:${t.to}`)
    expect(order.indexOf("QA Complete:TIME_LOGGED")).toBeLessThan(
      order.indexOf("QA Complete:COMPLETED"),
    )
    expect(order.indexOf("QA Complete:COMPLETED")).toBeLessThan(
      order.indexOf("Deploy API:COMPLETED"),
    )
    expect(order.indexOf("Deploy API:COMPLETED")).toBeLessThan(order.indexOf("Go-Live:COMPLETED"))
    expect(order.indexOf("Train admins:COMPLETED")).toBeLessThan(
      order.indexOf("Training Complete:COMPLETED"),
    )
    expect(order[order.length - 1]).toBe("Acme Implementation:COMPLETED")
    expect(closure.openButNotRequired.map((t) => t.name)).toEqual(["Documentation"])
  })

  it("has nothing to do for an already complete project", () => {
    const north: EntityRef = {
      kind: "project",
      id: hero.projects.find((p) => p.name === "Northwind Migration")!.id,
    }
    const closure = resolveClosure(north, hero)
    expect(closure.requiredTransitions).toEqual([])
    expect(traceCurrentBlockers(north, hero)).toEqual([])
  })
})

describe("dependency resolution — real export, arbitrary depth", () => {
  it("traverses PRJ-013's chain without knowing any names", () => {
    const prj013: EntityRef = { kind: "project", id: real.project("PRJ-013" as never)!.id }
    const closure = resolveClosure(prj013, real)
    expect(closure.requiredTransitions.length).toBeGreaterThan(5)
    const blockers = traceCurrentBlockers(prj013, real)
    expect(blockers.length).toBeGreaterThan(0)
    for (const b of blockers) expect(b.dependencyPath[0]).toEqual(prj013)
    const deepest = nextActionable(blockers)!
    expect(deepest.dependencyPath.length).toBeGreaterThanOrEqual(3)
  })
})

describe("an exact task name resolves even when a longer name starts with it", () => {
  it("'Legacy Migration' is not ambiguous against 'Legacy Migration scope, strategy and plan'", () => {
    const real = ingestFixture("rocketlane-export").graph
    const project = real.projects.find((p) => p.name.startsWith("Bowen-Chapman"))!
    const resolved = resolveAny("Legacy Migration", real, { projectId: project.id })
    expect(resolved.status).toBe("resolved")
    expect(resolved.status === "resolved" && resolved.label).toBe("Legacy Migration")
  })
})
