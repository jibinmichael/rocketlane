import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { hoursTracked } from "@/core/domain/entities"
import type { WorkspaceGraph } from "@/core/domain/graph"
import { projectId, refKey, taskId } from "@/core/domain/ids"
import type { EntityRef } from "@/core/domain/ids"
import { DEFAULT_GOVERNANCE_CONFIG } from "@/core/governance/engine"
import { ingestTwoFileExport, type IngestionResult } from "@/core/ingestion/export-two-file"
import type { FindingKind, IngestionReport } from "@/core/ingestion/report"
import {
  nextActionable,
  resolveClosure,
  traceCurrentBlockers,
  type ClosureResult,
} from "@/core/resolver/blockers"

const stressRoot = fileURLToPath(new URL("../../fixtures/stress/", import.meta.url))

const STRESS_FIXTURES = [
  "deep-chain",
  "wide-fanin",
  "diamond",
  "cycle",
  "comma-names",
  "subtasks-nested",
  "many-projects",
  "malformed",
  "unicode-and-quotes",
  "scale-sample",
] as const

type StressFixture = (typeof STRESS_FIXTURES)[number]

function readStressFixture(name: StressFixture, file: string): string {
  return readFileSync(`${stressRoot}${name}/${file}`, "utf8")
}

function ingestStressFixture(name: StressFixture): IngestionResult {
  return ingestTwoFileExport({
    datasetId: `stress/${name}`,
    projectsCsv: readStressFixture(name, "projects.csv"),
    tasksCsv: readStressFixture(name, "tasks.csv"),
  })
}

function findingsOfKind(report: IngestionReport, kind: FindingKind) {
  return report.findings.filter((f) => f.kind === kind)
}

function soleProjectRef(graph: WorkspaceGraph): EntityRef {
  expect(graph.projects).toHaveLength(1)
  return { kind: "project", id: graph.projects[0]!.id }
}

function completedOrder(closure: ClosureResult): Map<string, number> {
  const order = new Map<string, number>()
  closure.requiredTransitions.forEach((t, index) => {
    if (t.to === "COMPLETED") {
      expect(order.has(refKey(t.ref))).toBe(false)
      order.set(refKey(t.ref), index)
    }
  })
  return order
}

function expectDependencyOrdered(closure: ClosureResult, graph: WorkspaceGraph): void {
  const order = completedOrder(closure)
  for (const [key, index] of order) {
    if (!key.startsWith("task:")) continue
    const task = graph.task(taskId(key.slice("task:".length)))!
    for (const predecessor of graph.predecessorsOf(task.id)) {
      if (predecessor.status === "COMPLETED") continue
      expect(order.get(refKey({ kind: "task", id: predecessor.id }))).toBeLessThan(index)
    }
  }
  for (const t of closure.requiredTransitions) {
    if (t.to !== "TIME_LOGGED") continue
    expect(closure.requiredTransitions.indexOf(t)).toBeLessThan(order.get(refKey(t.ref))!)
  }
}

describe("every stress fixture", () => {
  it.each(STRESS_FIXTURES)("%s ingests without throwing", (name) => {
    let result: IngestionResult | undefined
    expect(() => {
      result = ingestStressFixture(name)
    }).not.toThrow()
    expect(result!.report.source).toBe("export-2")
    expect(result!.report.datasetVersion).toHaveLength(16)
    expect(result!.report.counts.projects).toBe(result!.graph.projects.length)
    expect(result!.report.counts.tasks).toBe(result!.graph.tasks.length)
  })
})

describe("deep-chain", () => {
  const { graph, report } = ingestStressFixture("deep-chain")
  const project = soleProjectRef(graph)

  it("reports exact counts and nothing else", () => {
    expect(report.counts).toEqual({
      projects: 1,
      phases: 4,
      tasks: 17,
      dependencies: 15,
      milestones: 1,
      subtasks: 0,
      actors: 3,
    })
    expect(report.rejected).toEqual([])
    expect(report.warnings).toEqual([])
    expect(report.findings).toEqual([])
  })

  it("orders the closure so every predecessor completes before its dependent", () => {
    const closure = resolveClosure(project, graph)
    expectDependencyOrdered(closure, graph)
    expect(closure.requiredTransitions).toHaveLength(18)
    expect(closure.requiredTransitions[0]).toEqual({
      ref: { kind: "task", id: "TSK-1015" },
      to: "TIME_LOGGED",
    })
    expect(closure.requiredTransitions.at(-1)).toEqual({ ref: project, to: "COMPLETED" })
    expect(closure.openButNotRequired).toEqual([])
  })

  it("traces to the leaf with no time at depth 17", () => {
    const blockers = traceCurrentBlockers(project, graph)
    expect(blockers).toHaveLength(1)
    const next = nextActionable(blockers)!
    expect(next.dependencyPath.length).toBeGreaterThanOrEqual(15)
    expect(next.dependencyPath).toHaveLength(17)
    expect(next.requiredChange).toEqual({ kind: "log_time", taskId: "TSK-1015" })
    expect(next.policyId).toBe("P4_TASK_TIME")
    expect(next.systemCanAct).toBe(false)
  })
})

describe("wide-fanin", () => {
  const { graph, report } = ingestStressFixture("wide-fanin")
  const project = soleProjectRef(graph)

  it("resolves a 40-name dependency cell and reports the zero-hour completions", () => {
    expect(report.counts).toEqual({
      projects: 1,
      phases: 2,
      tasks: 41,
      dependencies: 40,
      milestones: 1,
      subtasks: 0,
      actors: 7,
    })
    expect(report.rejected).toEqual([])
    expect(report.warnings).toEqual([])
    expect(report.findings.map((f) => f.kind)).toEqual(["HISTORICAL_POLICY_INCONSISTENCY"])
    expect([...report.findings[0]!.entityIds].sort()).toEqual([
      "TSK-2001",
      "TSK-2005",
      "TSK-2009",
      "TSK-2013",
      "TSK-2017",
    ])
    expect(graph.predecessorsOf(taskId("TSK-2000"))).toHaveLength(40)
  })

  it("requires each open predecessor once, before the milestone", () => {
    const closure = resolveClosure(project, graph)
    expectDependencyOrdered(closure, graph)
    const completed = closure.requiredTransitions.filter((t) => t.to === "COMPLETED")
    const timeLogged = closure.requiredTransitions.filter((t) => t.to === "TIME_LOGGED")
    expect(completed).toHaveLength(22)
    expect(timeLogged.map((t) => t.ref.id).sort()).toEqual([
      "TSK-2022",
      "TSK-2026",
      "TSK-2030",
      "TSK-2034",
      "TSK-2038",
    ])
    for (const t of completed) {
      if (t.ref.kind === "task") expect(graph.task(t.ref.id)!.status).not.toBe("COMPLETED")
    }
  })

  it("surfaces one blocker per open predecessor at the same depth", () => {
    const blockers = traceCurrentBlockers(project, graph)
    expect(blockers).toHaveLength(20)
    expect(blockers.filter((b) => b.requiredChange.kind === "log_time")).toHaveLength(5)
    expect(blockers.filter((b) => b.requiredChange.kind === "complete_task")).toHaveLength(15)
    for (const b of blockers) expect(b.dependencyPath).toHaveLength(3)
    expect(nextActionable(blockers)?.dependencyPath).toHaveLength(3)
  })
})

describe("diamond", () => {
  const { graph, report } = ingestStressFixture("diamond")
  const project = soleProjectRef(graph)

  it("reports exact counts and no findings", () => {
    expect(report.counts).toEqual({
      projects: 1,
      phases: 3,
      tasks: 6,
      dependencies: 6,
      milestones: 2,
      subtasks: 0,
      actors: 2,
    })
    expect(report.rejected).toEqual([])
    expect(report.warnings).toEqual([])
    expect(report.findings).toEqual([])
  })

  it("visits the shared predecessor once and keeps dependency order", () => {
    const closure = resolveClosure(project, graph)
    expectDependencyOrdered(closure, graph)
    expect(closure.requiredTransitions).toHaveLength(8)
    const order = completedOrder(closure)
    const at = (id: string) => order.get(`task:${id}`)!
    expect(at("TSK-3002")).toBeLessThan(at("TSK-3003"))
    expect(at("TSK-3002")).toBeLessThan(at("TSK-3004"))
    expect(at("TSK-3002")).toBeLessThan(at("TSK-3006"))
    expect(closure.requiredTransitions[0]).toEqual({
      ref: { kind: "task", id: "TSK-3001" },
      to: "TIME_LOGGED",
    })
  })

  it("dedupes blockers reached via several paths", () => {
    const blockers = traceCurrentBlockers(project, graph)
    expect(blockers).toHaveLength(1)
    const next = nextActionable(blockers)!
    expect(next.requiredChange).toEqual({ kind: "log_time", taskId: "TSK-3001" })
    expect(next.dependencyPath).toHaveLength(5)
  })
})

describe("cycle", () => {
  const { graph, report } = ingestStressFixture("cycle")
  const project = soleProjectRef(graph)

  it("flags exactly the cycle members", () => {
    expect(report.counts).toEqual({
      projects: 1,
      phases: 3,
      tasks: 6,
      dependencies: 4,
      milestones: 1,
      subtasks: 0,
      actors: 1,
    })
    expect(report.rejected).toEqual([])
    expect(report.warnings).toEqual([])
    expect(report.findings.map((f) => f.kind)).toEqual(["CYCLE"])
    expect([...report.findings[0]!.entityIds].sort()).toEqual(["TSK-4001", "TSK-4002", "TSK-4003"])
    expect(graph.predecessorCycles().size).toBe(3)
    for (const id of ["TSK-4001", "TSK-4002", "TSK-4003"]) {
      expect(graph.task(taskId(id))!.flags).toContain("CYCLE")
    }
    expect(graph.task(taskId("TSK-4004"))!.flags).toEqual([])
  })

  it("terminates and reports data blockers for every cycle member", () => {
    const closure = resolveClosure(project, graph)
    const fixes = closure.blockers.filter((b) => b.requiredChange.kind === "fix_data")
    expect(fixes.map((b) => b.actionable.id).sort()).toEqual(["TSK-4001", "TSK-4002", "TSK-4003"])
    for (const b of fixes) {
      expect(b.systemCanAct).toBe(false)
      expect(b.requiredChange).toMatchObject({ flag: "CYCLE" })
    }
    expect(closure.openButNotRequired.map((t) => t.name)).toEqual(["Independent"])
    const blockers = traceCurrentBlockers(project, graph)
    expect(blockers.every((b) => b.reasonCode === "DATA_FLAGGED")).toBe(true)
    expect(nextActionable(blockers)!.dependencyPath).toHaveLength(5)
  })
})

describe("comma-names", () => {
  const { graph, report } = ingestStressFixture("comma-names")
  const predecessorIds = (id: string) => graph.task(taskId(id))!.predecessorIds

  it("reports the unresolved, ambiguous and duplicate names", () => {
    expect(report.counts).toEqual({
      projects: 1,
      phases: 2,
      tasks: 13,
      dependencies: 8,
      milestones: 1,
      subtasks: 0,
      actors: 2,
    })
    expect(report.rejected).toEqual([])
    expect(report.warnings).toEqual([])
    expect(report.findings.map((f) => f.kind).sort()).toEqual([
      "DEPENDENCY_AMBIGUOUS",
      "DEPENDENCY_UNRESOLVED",
      "DUPLICATE_NAME",
    ])
    expect([...findingsOfKind(report, "DUPLICATE_NAME")[0]!.entityIds].sort()).toEqual([
      "TSK-5007",
      "TSK-5008",
    ])
    const unresolved = findingsOfKind(report, "DEPENDENCY_UNRESOLVED")[0]!
    expect(unresolved.entityIds).toEqual(["TSK-5006"])
    expect(unresolved.detail).toContain('"Nonexistent Task"')
    expect([...findingsOfKind(report, "DEPENDENCY_AMBIGUOUS")[0]!.entityIds].sort()).toEqual([
      "TSK-5007",
      "TSK-5008",
      "TSK-5009",
    ])
  })

  it("segments comma-containing names by longest match and fails closed", () => {
    expect(predecessorIds("TSK-5004")).toEqual(["TSK-5001"])
    expect(predecessorIds("TSK-5005")).toEqual(["TSK-5001", "TSK-5002", "TSK-5003"])
    expect(predecessorIds("TSK-5006")).toEqual(["TSK-5003"])
    expect(graph.task(taskId("TSK-5006"))!.flags).toEqual(["DEPENDENCY_UNRESOLVED"])
    expect(predecessorIds("TSK-5009")).toEqual([])
    expect(graph.task(taskId("TSK-5009"))!.flags).toEqual(["DEPENDENCY_AMBIGUOUS"])
    expect(predecessorIds("TSK-5010")).toEqual(["TSK-5005", "TSK-5004"])
    expect(predecessorIds("TSK-5013")).toEqual(["TSK-5002"])
  })
})

describe("subtasks-nested", () => {
  const { graph, report } = ingestStressFixture("subtasks-nested")
  const project = soleProjectRef(graph)

  it("ingests NA, Blocked and grand-child subtasks", () => {
    expect(report.counts).toEqual({
      projects: 1,
      phases: 1,
      tasks: 7,
      dependencies: 0,
      milestones: 1,
      subtasks: 6,
      actors: 1,
    })
    expect(report.rejected).toEqual([])
    expect(report.warnings).toEqual([])
    expect(report.findings).toEqual([])
    expect(graph.subtasksOf(taskId("TSK-6001"))).toHaveLength(5)
    expect(graph.subtasksOf(taskId("TSK-6005")).map((t) => t.id)).toEqual(["TSK-6006"])
  })

  it("requires only direct open subtasks under the default interpretation", () => {
    const closure = resolveClosure(project, graph)
    const completed = closure.requiredTransitions.filter((t) => t.to === "COMPLETED")
    expect(completed.map((t) => t.ref.id)).toEqual([
      "TSK-6002",
      "TSK-6004",
      "TSK-6005",
      "TSK-6001",
      "PRJ-600",
    ])
    expect(closure.openButNotRequired.map((t) => t.name)).toEqual(["Grandchild"])
    const unblock = closure.blockers.find((b) => b.requiredChange.kind === "unblock_task")!
    expect(unblock.actionable.id).toBe("TSK-6004")
    expect(unblock.systemCanAct).toBe(false)
  })

  it("requires the NA subtask when NA counts as open", () => {
    const closure = resolveClosure(project, graph, {
      ...DEFAULT_GOVERNANCE_CONFIG,
      interpretation: { naCountsAsOpen: true },
    })
    const ids = closure.requiredTransitions.map((t) => t.ref.id)
    expect(ids).toContain("TSK-6003")
    expect(ids).not.toContain("TSK-6006")
  })
})

describe("many-projects", () => {
  const { graph, report } = ingestStressFixture("many-projects")
  const ref = (id: string): EntityRef => ({ kind: "project", id: projectId(id) })

  it("reports the empty projects honestly and keeps owners distinct", () => {
    expect(report.counts).toEqual({
      projects: 25,
      phases: 10,
      tasks: 22,
      dependencies: 3,
      milestones: 10,
      subtasks: 2,
      actors: 10,
    })
    expect(report.rejected).toEqual([])
    expect(report.warnings).toEqual([])
    expect(report.findings.map((f) => f.kind)).toEqual(["PROJECT_WITHOUT_TASKS"])
    const empty = report.findings[0]!.entityIds
    expect(empty).toHaveLength(15)
    expect([...empty].sort()).toEqual(
      Array.from({ length: 15 }, (_, i) => `PRJ-7${String(i + 1).padStart(2, "0")}`),
    )
    expect(graph.projects.filter((p) => p.status === "COMPLETED").map((p) => p.id)).toEqual([
      "PRJ-716",
      "PRJ-717",
      "PRJ-718",
      "PRJ-719",
      "PRJ-720",
    ])
    const owners = new Set(graph.projects.map((p) => p.ownerId))
    expect(owners.size).toBe(4)
    for (const id of owners) expect(graph.actor(id!)?.role).toBe("owner")
  })

  it("produces a different next action per mixed-state project", () => {
    const next = (id: string) => nextActionable(traceCurrentBlockers(ref(id), graph))!
    expect(next("PRJ-721").requiredChange).toEqual({ kind: "complete_task", taskId: "TSK-7213" })
    expect(next("PRJ-721").systemCanAct).toBe(true)
    expect(next("PRJ-722").requiredChange).toEqual({ kind: "log_time", taskId: "TSK-7221" })
    expect(
      resolveClosure(ref("PRJ-723"), graph).blockers.some(
        (b) => b.requiredChange.kind === "unblock_task" && b.actionable.id === "TSK-7231",
      ),
    ).toBe(true)
    expect(next("PRJ-724").requiredChange).toEqual({ kind: "complete_task", taskId: "TSK-7243" })
    expect(resolveClosure(ref("PRJ-725"), graph).requiredTransitions).toEqual([
      { ref: ref("PRJ-725"), to: "COMPLETED" },
    ])
    for (const id of ["PRJ-716", "PRJ-717", "PRJ-718", "PRJ-719", "PRJ-720"]) {
      expect(resolveClosure(ref(id), graph).requiredTransitions).toEqual([])
    }
  })
})

describe("malformed", () => {
  const { graph, report } = ingestStressFixture("malformed")
  const byPosition = <T extends { file: string; line: number; detail: string }>(
    items: readonly T[],
  ) =>
    [...items].sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.detail.localeCompare(b.detail),
    )

  it("rejects exactly the broken rows with the right codes and line numbers", () => {
    expect(byPosition(report.rejected)).toEqual([
      { file: "projects.csv", line: 4, reason: "MISSING_ID", detail: "empty ProjectId" },
      { file: "projects.csv", line: 5, reason: "DUPLICATE_ID", detail: "PRJ-800" },
      {
        file: "projects.csv",
        line: 6,
        reason: "MALFORMED_ROW",
        detail: "expected 39 fields, found 38",
      },
      {
        file: "tasks.csv",
        line: 3,
        reason: "MALFORMED_ROW",
        detail: "expected 26 fields, found 25",
      },
      {
        file: "tasks.csv",
        line: 4,
        reason: "MALFORMED_ROW",
        detail: "expected 26 fields, found 27",
      },
      { file: "tasks.csv", line: 5, reason: "UNKNOWN_STATUS", detail: 'TSK-8004: "Waiting"' },
      { file: "tasks.csv", line: 6, reason: "NEGATIVE_HOURS", detail: "TSK-8005: -2" },
      { file: "tasks.csv", line: 7, reason: "UNKNOWN_PROJECT", detail: "TSK-8006 → PRJ-999" },
      { file: "tasks.csv", line: 8, reason: "DUPLICATE_ID", detail: "TSK-8001" },
      { file: "tasks.csv", line: 9, reason: "MISSING_ID", detail: "empty TaskId or ProjectId" },
      { file: "tasks.csv", line: 10, reason: "MISSING_ID", detail: "empty TaskId or ProjectId" },
      {
        file: "tasks.csv",
        line: 19,
        reason: "MALFORMED_ROW",
        detail: "quote inside unquoted field",
      },
      { file: "tasks.csv", line: 20, reason: "MALFORMED_ROW", detail: "unterminated quoted field" },
    ])
  })

  it("warns without rejecting on dates, ids and parents", () => {
    expect(byPosition(report.warnings)).toEqual([
      { file: "projects.csv", line: 3, reason: "MALFORMED_DATE", detail: "someday" },
      { file: "projects.csv", line: 7, reason: "NON_STANDARD_ID", detail: "prj_lower" },
      { file: "tasks.csv", line: 13, reason: "MALFORMED_DATE", detail: "31/12/2026" },
      { file: "tasks.csv", line: 13, reason: "MALFORMED_DATE", detail: "not-a-date" },
      { file: "tasks.csv", line: 14, reason: "NON_STANDARD_ID", detail: "task-x10" },
      { file: "tasks.csv", line: 15, reason: "UNRESOLVED_PARENT", detail: "TSK-8011 → TSK-9999" },
      {
        file: "tasks.csv",
        line: 16,
        reason: "MALFORMED_HOURS",
        detail: 'TSK-8012: "abc" is not a number of hours; treated as no time logged',
      },
      { file: "tasks.csv", line: 18, reason: "MALFORMED_DATE", detail: "2026-13-45" },
    ])
    expect(graph.task(taskId("TSK-8014"))!.completedAt).toBeNull()
    expect(graph.task(taskId("TSK-8009"))).toMatchObject({ startDate: null, dueDate: null })
    expect(graph.task(taskId("TSK-8011"))!.parentTaskId).toBeNull()
  })

  it("keeps the surviving rows and counts", () => {
    expect(report.counts).toEqual({
      projects: 3,
      phases: 1,
      tasks: 8,
      dependencies: 0,
      milestones: 0,
      subtasks: 0,
      actors: 2,
    })
    expect(report.findings.map((f) => f.kind)).toEqual(["PROJECT_WITHOUT_TASKS"])
    expect([...report.findings[0]!.entityIds].sort()).toEqual(["PRJ-801", "prj_lower"])
    expect(graph.task(taskId("TSK-8001"))!.status).toBe("COMPLETED")
    expect(graph.task(taskId("TSK-8008"))!.name).toBe("Line one\nLine two")
    expect(hoursTracked(graph.task(taskId("TSK-8012"))!)).toBe(0)
    expect(graph.task(taskId("TSK-8013"))!.status).toBe("COMPLETED")
    expect(graph.task(taskId("task-x10"))).not.toBeNull()
  })

  it("strips the BOM and handles CRLF", () => {
    const tasksCsv = readStressFixture("malformed", "tasks.csv")
    expect(tasksCsv.charCodeAt(0)).toBe(0xfeff)
    expect(tasksCsv).toContain("\r\n")
    expect(graph.project(projectId("PRJ-800"))).not.toBeNull()
    expect(graph.task(taskId("TSK-8001"))!.projectId).toBe("PRJ-800")
  })
})

describe("unicode-and-quotes", () => {
  const { graph, report } = ingestStressFixture("unicode-and-quotes")
  const name = (id: string) => graph.task(taskId(id))!.name

  it("round-trips every name and resolves them as predecessors", () => {
    expect(report.counts).toEqual({
      projects: 1,
      phases: 2,
      tasks: 9,
      dependencies: 8,
      milestones: 1,
      subtasks: 0,
      actors: 3,
    })
    expect(report.rejected).toEqual([])
    expect(report.findings).toEqual([])
    expect(report.warnings).toEqual([
      { file: "tasks.csv", line: 9, reason: "NON_STANDARD_ID", detail: "TSK-Ü08" },
    ])
    expect(name("TSK-9001")).toBe("Café Réunion – Phase 1")
    expect(name("TSK-9002")).toBe("日本語のタスク")
    expect(name("TSK-9003")).toBe("🚀 Launch 🎉")
    expect(name("TSK-9004")).toBe('Say "Hello" to the team')
    expect(name("TSK-9005")).toBe('Alpha, Beta "Gamma"')
    expect(name("TSK-9006")).toHaveLength(300)
    expect(name("TSK-9007")).toBe("Padded Name")
    expect(graph.task(taskId("TSK-9009"))!.predecessorIds).toEqual([
      "TSK-9001",
      "TSK-9002",
      "TSK-9003",
      "TSK-9004",
      "TSK-9005",
      "TSK-9006",
      "TSK-9007",
      "TSK-Ü08",
    ])
    expect(graph.task(taskId("TSK-9001"))!.assigneeNames).toEqual(["Zoë Åberg", "李雷"])
    const project = graph.projects[0]!
    expect(project.name).toBe("Zoë & Søren GmbH - Größere Integration")
    expect(project.customerName).toBe("Zoë & Søren GmbH")
    expect(project.ownerName).toBe("José Núñez")
  })
})

describe("scale-sample", () => {
  const projectsCsv = readStressFixture("scale-sample", "projects.csv")
  const tasksCsv = readStressFixture("scale-sample", "tasks.csv")

  it("matches the generator byte for byte", () => {
    const out = mkdtempSync(join(tmpdir(), "rocketlane-scale-"))
    execFileSync(process.execPath, [
      `${stressRoot}scale/generate.mjs`,
      "--seed",
      "7",
      "--projects",
      "200",
      "--tasks",
      "4000",
      "--depth",
      "12",
      "--width",
      "6",
      "--out",
      out,
    ])
    expect(readFileSync(join(out, "projects.csv"), "utf8")).toBe(projectsCsv)
    expect(readFileSync(join(out, "tasks.csv"), "utf8")).toBe(tasksCsv)
  })

  it("ingests 200 projects and 4000 tasks in under 300ms", () => {
    const started = performance.now()
    const { graph, report } = ingestTwoFileExport({
      datasetId: "stress/scale-sample",
      projectsCsv,
      tasksCsv,
    })
    const elapsed = performance.now() - started
    expect(elapsed).toBeLessThan(300)
    expect(report.timingMs).toBeLessThan(300)

    expect(report.counts).toEqual({
      projects: 200,
      phases: 701,
      tasks: 4000,
      dependencies: 5579,
      milestones: 321,
      subtasks: 90,
      actors: 52,
    })
    expect(report.rejected).toEqual([])
    expect(report.warnings).toEqual([])
    expect(report.findings.map((f) => f.kind).sort()).toEqual([
      "HISTORICAL_POLICY_INCONSISTENCY",
      "PROJECT_WITHOUT_TASKS",
    ])
    expect(findingsOfKind(report, "HISTORICAL_POLICY_INCONSISTENCY")[0]!.entityIds).toHaveLength(
      393,
    )
    expect(findingsOfKind(report, "PROJECT_WITHOUT_TASKS")[0]!.entityIds).toHaveLength(20)
    expect(graph.predecessorCycles().size).toBe(0)

    const depths = new Map<string, number>()
    const depthOf = (id: string): number => {
      const known = depths.get(id)
      if (known !== undefined) return known
      const task = graph.task(taskId(id))!
      const depth =
        task.predecessorIds.length === 0 ? 1 : 1 + Math.max(...task.predecessorIds.map(depthOf))
      depths.set(id, depth)
      return depth
    }
    expect(Math.max(...graph.tasks.map((t) => depthOf(t.id)))).toBe(12)
    expect(Math.max(...graph.tasks.map((t) => t.predecessorIds.length))).toBe(6)
  })
})
