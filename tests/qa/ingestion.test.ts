import { describe, expect, it } from "vitest"

import { projectId, taskId } from "@/core/domain/ids"
import { parseCsv } from "@/core/ingestion/csv"
import { ingestTwoFileExport } from "@/core/ingestion/export-two-file"
import { resolveTask } from "@/core/resolver/target"
import {
  csv,
  ingestRows,
  ingestStrings,
  PROJECT_HEADER,
  projectRow,
  TASK_HEADER,
  taskRow,
} from "./_helpers"

describe("ingestion — encodings and quoting", () => {
  it("BOM + CRLF files parse identically to plain LF", () => {
    const projects = [projectRow({ ProjectId: "PRJ-1", ProjectName: "One" })]
    const tasks = [
      taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-1", TaskName: "A" }),
      taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-2", TaskName: "B", Dependency: "A" }),
    ]
    const plain = ingestStrings(csv(PROJECT_HEADER, projects), csv(TASK_HEADER, tasks))
    const bom = ingestStrings(
      "﻿" + csv(PROJECT_HEADER, projects, "\r\n"),
      "﻿" + csv(TASK_HEADER, tasks, "\r\n"),
    )
    expect(bom.report.rejected).toEqual([])
    expect(bom.report.counts).toEqual(plain.report.counts)
    expect(bom.report.counts.dependencies).toBe(1)
    expect(bom.graph.project(projectId("PRJ-1"))?.name).toBe("One")
    expect(bom.graph.task(taskId("TSK-2"))?.predecessorIds).toEqual(["TSK-1"])
  })

  it("quoted names with commas and embedded quotes survive, and dependencies on them resolve", () => {
    const name = 'Deploy "prod", region A, B'
    const { graph, report } = ingestRows(
      [projectRow({ ProjectId: "PRJ-1", ProjectName: 'Acme, "The Big One"' })],
      [
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-1", TaskName: name }),
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-2", TaskName: "Plain" }),
        taskRow({
          ProjectId: "PRJ-1",
          TaskId: "TSK-3",
          TaskName: "After",
          Dependency: `${name}, Plain`,
        }),
      ],
    )
    expect(report.rejected).toEqual([])
    expect(graph.project(projectId("PRJ-1"))?.name).toBe('Acme, "The Big One"')
    expect(graph.task(taskId("TSK-1"))?.name).toBe(name)
    expect([...(graph.task(taskId("TSK-3"))?.predecessorIds ?? [])].sort()).toEqual([
      "TSK-1",
      "TSK-2",
    ])
    expect(graph.task(taskId("TSK-3"))?.flags).toEqual([])
  })

  it("a field with an embedded newline inside quotes stays one row", () => {
    const parsed = parseCsv('a,b\n"line1\nline2",2\n')
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]?.["a"]).toBe("line1\nline2")
    expect(parsed.malformed).toEqual([])
  })

  // FINDING (medium): `normalize()` in core/resolver/target.ts strips everything outside [a-z0-9], so
  // every non-Latin name normalizes to "" and scores 0.98 against every other non-Latin name. An exact
  // query for "配置完成 ✅" comes back `ambiguous` against the Arabic task. Names survive ingestion; it is
  // grounding that breaks. Fix: normalize with a Unicode-aware class (`/[^\p{L}\p{N}]+/gu`) and treat an
  // empty normalized form as non-matching (score 0), never as equal.
  it("unicode task names round-trip and resolve by exact name", () => {
    const names = [
      "Déploiement — étape 1",
      "配置完成 ✅",
      "Übergabe (Phase Ⅱ)",
      "🚀 Go-Live",
      "مراجعة التصميم",
    ]
    const rows = names.map((n, i) =>
      taskRow({ ProjectId: "PRJ-1", TaskId: `TSK-${i + 1}`, TaskName: n }),
    )
    rows.push(
      taskRow({
        ProjectId: "PRJ-1",
        TaskId: "TSK-9",
        TaskName: "Last",
        Dependency: names.join(", "),
      }),
    )
    const { graph, report } = ingestRows(
      [projectRow({ ProjectId: "PRJ-1", ProjectName: "Uni" })],
      rows,
    )
    expect(report.rejected).toEqual([])
    names.forEach((n, i) => expect(graph.task(taskId(`TSK-${i + 1}`))?.name).toBe(n))
    expect(graph.task(taskId("TSK-9"))?.predecessorIds).toHaveLength(names.length)
    for (const n of names) {
      const r = resolveTask(n, graph, { projectId: projectId("PRJ-1") })
      expect(r.status, n).toBe("resolved")
    }
  })
})

describe("ingestion — structural rejections", () => {
  it("missing required columns reject the file with MISSING_COLUMNS and never throw", () => {
    const r = ingestStrings(
      "ProjectId,ProjectName\nPRJ-1,One\n",
      "ProjectId,TaskId,TaskName\nPRJ-1,TSK-1,A\n",
    )
    expect(r.report.rejected.map((x) => x.reason)).toEqual(["MISSING_COLUMNS", "MISSING_COLUMNS"])
    expect(r.report.rejected[0]?.detail).toBe("ProjectStatus")
    expect(r.report.rejected[1]?.detail).toBe("Status")
    expect(r.report.counts.projects).toBe(0)
    expect(r.report.counts.tasks).toBe(0)
  })

  it("empty files and header-only files yield an empty graph and a report", () => {
    for (const [p, t] of [
      ["", ""],
      ["\n", "\n"],
      [PROJECT_HEADER.join(",") + "\n", TASK_HEADER.join(",") + "\n"],
    ]) {
      const r = ingestStrings(p!, t!)
      expect(r.graph.projects).toEqual([])
      expect(r.graph.tasks).toEqual([])
    }
  })

  it("duplicate project and task ids: first wins, later ones are rejected with DUPLICATE_ID", () => {
    const { graph, report } = ingestRows(
      [
        projectRow({ ProjectId: "PRJ-1", ProjectName: "First" }),
        projectRow({ ProjectId: "PRJ-1", ProjectName: "Second" }),
      ],
      [
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-1", TaskName: "A" }),
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-1", TaskName: "A dup" }),
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-2", TaskName: "B", Dependency: "A dup" }),
      ],
    )
    expect(graph.project(projectId("PRJ-1"))?.name).toBe("First")
    expect(graph.task(taskId("TSK-1"))?.name).toBe("A")
    expect(report.rejected.filter((r) => r.reason === "DUPLICATE_ID")).toHaveLength(2)
    // The rejected duplicate's name is not a valid dependency target.
    expect(graph.task(taskId("TSK-2"))?.flags).toContain("DEPENDENCY_UNRESOLVED")
  })

  it("a task referencing an unknown project is rejected with UNKNOWN_PROJECT and is absent from the graph", () => {
    const { graph, report } = ingestRows(
      [projectRow({ ProjectId: "PRJ-1", ProjectName: "One" })],
      [taskRow({ ProjectId: "PRJ-404", TaskId: "TSK-1", TaskName: "Orphan" })],
    )
    expect(report.rejected.map((r) => r.reason)).toEqual(["UNKNOWN_PROJECT"])
    expect(graph.task(taskId("TSK-1"))).toBeNull()
    expect(graph.tasks).toHaveLength(0)
  })

  it("rows with the wrong field count are MALFORMED_ROW, others still load", () => {
    const tasksCsv =
      csv(TASK_HEADER, [taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-1", TaskName: "A" })]) +
      "PRJ-1,TSK-2,B\n"
    const r = ingestStrings(
      csv(PROJECT_HEADER, [projectRow({ ProjectId: "PRJ-1", ProjectName: "One" })]),
      tasksCsv,
    )
    expect(r.report.rejected.map((x) => x.reason)).toEqual(["MALFORMED_ROW"])
    expect(r.report.counts.tasks).toBe(1)
  })

  it("negative hours reject the row; empty and zero hours produce no time entry", () => {
    const { graph, report } = ingestRows(
      [projectRow({ ProjectId: "PRJ-1", ProjectName: "One" })],
      [
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-1", TaskName: "Neg", HoursTracked: "-1" }),
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-2", TaskName: "Zero", HoursTracked: "0" }),
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-3", TaskName: "Empty", HoursTracked: "" }),
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-4", TaskName: "Big", HoursTracked: "1e6" }),
      ],
    )
    expect(report.rejected.map((r) => r.reason)).toEqual(["NEGATIVE_HOURS"])
    expect(graph.task(taskId("TSK-2"))?.timeEntries).toEqual([])
    expect(graph.task(taskId("TSK-3"))?.timeEntries).toEqual([])
    expect(graph.task(taskId("TSK-4"))?.timeEntries[0]?.hours).toBe(1e6)
  })

  // FINDING (low): non-numeric or non-finite HoursTracked ("abc", "Infinity", "1e400") is silently
  // coerced to "no time logged". The architecture contract forbids ingestion from silently dropping
  // data. Fix (core/ingestion/export-two-file.ts): when `HoursTracked` is non-empty and
  // `!Number.isFinite(parseFloat(...))`, push a warning (new WarnCode "MALFORMED_HOURS") or reject
  // the row.
  it("non-numeric / non-finite HoursTracked is reported, not silently treated as zero", () => {
    const { report } = ingestRows(
      [projectRow({ ProjectId: "PRJ-1", ProjectName: "One" })],
      [
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-1", TaskName: "Text", HoursTracked: "abc" }),
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-2", TaskName: "Inf", HoursTracked: "Infinity" }),
        taskRow({
          ProjectId: "PRJ-1",
          TaskId: "TSK-3",
          TaskName: "Overflow",
          HoursTracked: "1e400",
        }),
      ],
    )
    const mentioned = [...report.rejected, ...report.warnings].filter((r) => r.file === "tasks.csv")
    expect(mentioned.length).toBeGreaterThanOrEqual(3)
  })

  // FINDING (low): a task that names itself as ParentTaskId passes the existence check and becomes its
  // own subtask. If it is a milestone, policy 2 blocks it on itself forever and traceCurrentBlockers
  // returns [] (self-loop hits `seen`). Fix (core/ingestion/export-two-file.ts): treat
  // ParentTaskId === TaskId as UNRESOLVED_PARENT (warning) and set parentTaskId null.
  it("a task that is its own parent is not accepted as its own subtask", () => {
    const { graph, report } = ingestRows(
      [projectRow({ ProjectId: "PRJ-1", ProjectName: "One" })],
      [
        taskRow({
          ProjectId: "PRJ-1",
          TaskId: "TSK-1",
          TaskName: "Self",
          ParentTaskId: "TSK-1",
          "Is this a Billing Milestone?": "true",
        }),
      ],
    )
    expect(graph.task(taskId("TSK-1"))?.parentTaskId).toBeNull()
    expect(report.warnings.some((w) => w.reason === "UNRESOLVED_PARENT")).toBe(true)
  })

  // FINDING (low): docs/agent-context/07-data-contract.md says ParentTaskId "must exist in same project
  // else UNRESOLVED_PARENT", but ingestion only checks global existence, so a cross-project parent link
  // is accepted and a milestone in PRJ-1 can be blocked by a subtask in PRJ-2 (scope leak across
  // projects). Fix (core/ingestion/export-two-file.ts): require the parent's projectId to equal the
  // task's projectId.
  it("a ParentTaskId in another project is UNRESOLVED_PARENT, not a cross-project subtask", () => {
    const { graph, report } = ingestRows(
      [
        projectRow({ ProjectId: "PRJ-1", ProjectName: "One" }),
        projectRow({ ProjectId: "PRJ-2", ProjectName: "Two" }),
      ],
      [
        taskRow({
          ProjectId: "PRJ-1",
          TaskId: "TSK-1",
          TaskName: "Milestone",
          "Is this a Billing Milestone?": "true",
        }),
        taskRow({
          ProjectId: "PRJ-2",
          TaskId: "TSK-2",
          TaskName: "Foreign child",
          ParentTaskId: "TSK-1",
        }),
      ],
    )
    expect(graph.task(taskId("TSK-2"))?.parentTaskId).toBeNull()
    expect(report.warnings.some((w) => w.reason === "UNRESOLVED_PARENT")).toBe(true)
    expect(graph.subtasksOf(taskId("TSK-1"))).toHaveLength(0)
  })

  it("unknown status rejects the row; every accepted status maps to the closed vocabulary", () => {
    const { graph, report } = ingestRows(
      [projectRow({ ProjectId: "PRJ-1", ProjectName: "One" })],
      [
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-1", TaskName: "A", Status: "Wontfix" }),
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-2", TaskName: "B", Status: "  N/A " }),
        taskRow({ ProjectId: "PRJ-1", TaskId: "TSK-3", TaskName: "C", Status: "DONE" }),
      ],
    )
    expect(report.rejected.map((r) => r.reason)).toEqual(["UNKNOWN_STATUS"])
    expect(graph.task(taskId("TSK-2"))?.status).toBe("NA")
    expect(graph.task(taskId("TSK-3"))?.status).toBe("COMPLETED")
  })
})

describe("ingestion — scale", () => {
  it("a synthetic 5,000-task / 50-project export ingests in under 500ms with every dependency resolved", () => {
    const projects: string[][] = []
    const tasks: string[][] = []
    for (let p = 0; p < 50; p += 1) {
      const pid = `PRJ-${String(p).padStart(3, "0")}`
      projects.push(projectRow({ ProjectId: pid, ProjectName: `Project ${p}, "Phase ${p % 3}"` }))
      for (let t = 0; t < 100; t += 1) {
        const n = p * 100 + t
        const name = `Task ${t}, step ${t % 7}`
        tasks.push(
          taskRow({
            ProjectId: pid,
            TaskId: `TSK-${String(n).padStart(5, "0")}`,
            TaskName: name,
            Status: t % 5 === 0 ? "Completed" : t % 11 === 0 ? "NA" : "To do",
            HoursTracked: String(t % 4),
            "Is this a Billing Milestone?": t % 10 === 9 ? "true" : "",
            Dependency: t > 0 ? `Task ${t - 1}, step ${(t - 1) % 7}` : "",
            ParentTaskId: t % 10 === 8 ? `TSK-${String(n + 1).padStart(5, "0")}` : "",
          }),
        )
      }
    }
    const projectsCsv = csv(PROJECT_HEADER, projects)
    const tasksCsv = csv(TASK_HEADER, tasks)
    const started = performance.now()
    const { graph, report } = ingestTwoFileExport({ datasetId: "scale", projectsCsv, tasksCsv })
    const elapsed = performance.now() - started
    expect(elapsed).toBeLessThan(500)
    expect(report.counts.projects).toBe(50)
    expect(report.counts.tasks).toBe(5000)
    expect(report.counts.dependencies).toBe(50 * 99)
    expect(report.counts.milestones).toBe(500)
    expect(report.rejected).toEqual([])
    expect(
      report.findings.filter(
        (f) => f.kind === "DEPENDENCY_UNRESOLVED" || f.kind === "DEPENDENCY_AMBIGUOUS",
      ),
    ).toEqual([])
    expect(graph.predecessorCycles().size).toBe(0)
    expect(graph.tasks.every((t) => t.flags.length === 0)).toBe(true)
  })
})
