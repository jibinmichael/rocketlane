import { describe, expect, it } from "vitest"

import { hoursTracked } from "@/core/domain/entities"
import { projectId, taskId } from "@/core/domain/ids"
import { ingestFixture } from "../helpers/fixtures"

describe("ingestTwoFileExport — real Rocketlane export", () => {
  const { graph, report } = ingestFixture("rocketlane-export")

  it("accepts every row and reports the true counts", () => {
    expect(report.rejected).toEqual([])
    expect(report.counts).toMatchObject({
      projects: 31,
      tasks: 325,
      phases: 20,
      milestones: 9,
      subtasks: 39,
      dependencies: 53,
    })
    expect(report.source).toBe("export-2")
    expect(report.datasetVersion).toHaveLength(16)
  })

  it("resolves every name-based predecessor within its project", () => {
    expect(report.findings.filter((f) => f.kind === "DEPENDENCY_UNRESOLVED")).toEqual([])
    expect(report.findings.filter((f) => f.kind === "DEPENDENCY_AMBIGUOUS")).toEqual([])
    const signOff = graph.task(taskId("TSK-0201"))!
    expect(graph.predecessorsOf(signOff.id).map((t) => t.name)).toEqual([
      "BRD Sign-off",
      "Peer Review - Project Plan",
    ])
  })

  it("surfaces the real anomalies as findings instead of hiding them", () => {
    const kinds = report.findings.map((f) => f.kind)
    expect(kinds).toContain("DUPLICATE_NAME")
    expect(kinds).toContain("HISTORICAL_POLICY_INCONSISTENCY")
    expect(kinds).toContain("PROJECT_WITHOUT_TASKS")
    expect(kinds).not.toContain("CYCLE")

    const duplicate = report.findings.find((f) => f.kind === "DUPLICATE_NAME")!
    expect([...duplicate.entityIds].sort()).toEqual(["TSK-0312", "TSK-0313"])

    const historical = report.findings.find((f) => f.kind === "HISTORICAL_POLICY_INCONSISTENCY")!
    expect(historical.entityIds).toHaveLength(76)

    const empty = report.findings.find((f) => f.kind === "PROJECT_WITHOUT_TASKS")!
    expect(empty.entityIds).toHaveLength(28)
  })

  it("derives hours from a synthetic import time entry", () => {
    const configured = graph.task(taskId("TSK-0002"))!
    expect(hoursTracked(configured)).toBe(1445.25)
    expect(configured.timeEntries[0]?.actorId).toBe("import")
    expect(hoursTracked(graph.task(taskId("TSK-0003"))!)).toBe(0)
  })

  it("builds owners and team members as actors", () => {
    const acmeLike = graph.project(projectId("PRJ-028"))!
    expect(acmeLike.ownerName).toBe("Erin Warner")
    expect(graph.actor(acmeLike.ownerId!)?.role).toBe("owner")
    expect(acmeLike.teamMemberIds.length).toBeGreaterThan(0)
  })
})

describe("ingestTwoFileExport — hero fixture through the same normalizer", () => {
  const { graph, report } = ingestFixture("cascading-conflicts")

  it("builds the cascading chain from data, not code", () => {
    expect(report.rejected).toEqual([])
    const acme = graph.projects.find((p) => p.name === "Acme Implementation")!
    expect(
      graph
        .milestonesOf(acme.id)
        .map((t) => t.name)
        .sort(),
    ).toEqual(["Go-Live", "Training Complete"])
    const goLive = graph.tasksOf(acme.id).find((t) => t.name === "Go-Live")!
    const deployApi = graph.predecessorsOf(goLive.id)[0]!
    expect(deployApi.name).toBe("Deploy API")
    const qaComplete = graph.predecessorsOf(deployApi.id)[0]!
    expect(qaComplete.name).toBe("QA Complete")
    expect(hoursTracked(qaComplete)).toBe(0)

    const training = graph.tasksOf(acme.id).find((t) => t.name === "Training Complete")!
    expect(graph.subtasksOf(training.id).map((t) => t.name)).toEqual(["Train admins"])
  })

  it("reports the already-complete project without tasks left open", () => {
    const north = graph.projects.find((p) => p.name === "Northwind Migration")!
    expect(north.status).toBe("COMPLETED")
    expect(graph.tasksOf(north.id).every((t) => t.status === "COMPLETED")).toBe(true)
  })
})
