import type { Actor, Phase, Project, Task, TaskFlag, TimeEntry } from "@/core/domain/entities"
import { hoursTracked } from "@/core/domain/entities"
import { WorkspaceGraph } from "@/core/domain/graph"
import { actorId, phaseId, projectId, taskId, timeEntryId } from "@/core/domain/ids"
import type { ActorId, PhaseId, ProjectId, TaskId } from "@/core/domain/ids"
import { parseProjectStatus, parseTaskStatus } from "@/core/domain/status"
import { parseCsv, type CsvRow } from "@/core/ingestion/csv"
import { fnv1a } from "@/core/ingestion/hash"
import type {
  IngestionFinding,
  IngestionRejection,
  IngestionReport,
  IngestionWarning,
} from "@/core/ingestion/report"

/**
 * Normalizer for the real Rocketlane export: projects.csv + tasks.csv with phases, predecessors
 * (by task name), subtasks, milestones and hours embedded in the tasks file.
 * See docs/agent-context/07-data-contract.md (source shape A).
 */

const PROJECT_COLUMNS = ["ProjectId", "ProjectName", "ProjectStatus"] as const
const TASK_COLUMNS = ["ProjectId", "TaskId", "TaskName", "Status"] as const

const IMPORT_ACTOR = actorId("import")
const ID_PATTERN = /^[A-Z]+-\d+$/

export type IngestionResult = {
  readonly graph: WorkspaceGraph
  readonly report: IngestionReport
}

export function ingestTwoFileExport(input: {
  readonly projectsCsv: string
  readonly tasksCsv: string
  readonly datasetId: string
}): IngestionResult {
  const started = Date.now()
  const rejected: IngestionRejection[] = []
  const warnings: IngestionWarning[] = []
  const findings: IngestionFinding[] = []

  const projectsParsed = parseCsv(input.projectsCsv)
  const tasksParsed = parseCsv(input.tasksCsv)
  for (const m of projectsParsed.malformed)
    rejected.push({ file: "projects.csv", line: m.line, reason: "MALFORMED_ROW", detail: m.reason })
  for (const m of tasksParsed.malformed)
    rejected.push({ file: "tasks.csv", line: m.line, reason: "MALFORMED_ROW", detail: m.reason })

  const missingProjectCols = PROJECT_COLUMNS.filter((c) => !projectsParsed.header.includes(c))
  const missingTaskCols = TASK_COLUMNS.filter((c) => !tasksParsed.header.includes(c))
  if (missingProjectCols.length > 0)
    rejected.push({
      file: "projects.csv",
      line: 1,
      reason: "MISSING_COLUMNS",
      detail: missingProjectCols.join(", "),
    })
  if (missingTaskCols.length > 0)
    rejected.push({
      file: "tasks.csv",
      line: 1,
      reason: "MISSING_COLUMNS",
      detail: missingTaskCols.join(", "),
    })

  const actors = new Map<ActorId, Actor>()
  const projects: Project[] = []
  const projectIds = new Set<ProjectId>()

  if (missingProjectCols.length === 0) {
    projectsParsed.rows.forEach((row, index) => {
      const line = projectsParsed.lineNumbers[index]!
      const rawId = row["ProjectId"] ?? ""
      if (rawId.trim() === "") {
        rejected.push({
          file: "projects.csv",
          line,
          reason: "MISSING_ID",
          detail: "empty ProjectId",
        })
        return
      }
      const id = projectId(rawId)
      if (projectIds.has(id)) {
        rejected.push({ file: "projects.csv", line, reason: "DUPLICATE_ID", detail: id })
        return
      }
      if (!ID_PATTERN.test(id))
        warnings.push({ file: "projects.csv", line, reason: "NON_STANDARD_ID", detail: id })
      projectIds.add(id)

      const owner = upsertActor(
        actors,
        row["ProjectOwnerId"],
        row["ProjectOwner"],
        row["ProjectOwnerEmail"],
        "owner",
        id,
      )
      const teamMemberIds: ActorId[] = []
      for (const member of splitTeamMembers(row["TeamMembers"] ?? "")) {
        const actor = upsertActor(actors, null, member.name, member.email, "member", id)
        if (actor && !teamMemberIds.includes(actor.id)) teamMemberIds.push(actor.id)
      }

      projects.push({
        id,
        name: (row["ProjectName"] ?? "").trim(),
        status: parseProjectStatus(row["ProjectStatus"] ?? ""),
        rawStatus: (row["ProjectStatus"] ?? "").trim(),
        ownerId: owner?.id ?? null,
        ownerName: owner?.name ?? null,
        customerName: emptyToNull(row["CustomerName"]),
        startDate: parseDate(row["StartDate"], "projects.csv", line, warnings),
        dueDate: parseDate(row["DueDate"], "projects.csv", line, warnings),
        teamMemberIds,
        region: emptyToNull(row["Region"]),
        version: 1,
      })
    })
  }

  // First pass over tasks: accept rows, build name index per project.
  type RawTask = { row: CsvRow; line: number; id: TaskId; projectId: ProjectId }
  const rawTasks: RawTask[] = []
  const taskIds = new Set<TaskId>()
  const namesByProject = new Map<ProjectId, Map<string, TaskId[]>>()
  const phases = new Map<PhaseId, Phase>()

  if (missingTaskCols.length === 0) {
    tasksParsed.rows.forEach((row, index) => {
      const line = tasksParsed.lineNumbers[index]!
      const rawTaskId = row["TaskId"] ?? ""
      const rawProjectId = row["ProjectId"] ?? ""
      if (rawTaskId.trim() === "" || rawProjectId.trim() === "") {
        rejected.push({
          file: "tasks.csv",
          line,
          reason: "MISSING_ID",
          detail: "empty TaskId or ProjectId",
        })
        return
      }
      const id = taskId(rawTaskId)
      const pid = projectId(rawProjectId)
      if (!projectIds.has(pid)) {
        rejected.push({
          file: "tasks.csv",
          line,
          reason: "UNKNOWN_PROJECT",
          detail: `${id} → ${pid}`,
        })
        return
      }
      if (taskIds.has(id)) {
        rejected.push({ file: "tasks.csv", line, reason: "DUPLICATE_ID", detail: id })
        return
      }
      if (parseTaskStatus(row["Status"] ?? "") === null) {
        rejected.push({
          file: "tasks.csv",
          line,
          reason: "UNKNOWN_STATUS",
          detail: `${id}: "${row["Status"]}"`,
        })
        return
      }
      const hours = Number.parseFloat(row["HoursTracked"] ?? "0")
      if (Number.isFinite(hours) && hours < 0) {
        rejected.push({
          file: "tasks.csv",
          line,
          reason: "NEGATIVE_HOURS",
          detail: `${id}: ${hours}`,
        })
        return
      }
      if (!ID_PATTERN.test(id))
        warnings.push({ file: "tasks.csv", line, reason: "NON_STANDARD_ID", detail: id })
      taskIds.add(id)
      rawTasks.push({ row, line, id, projectId: pid })

      const name = (row["TaskName"] ?? "").trim()
      const names = namesByProject.get(pid) ?? new Map<string, TaskId[]>()
      const existing = names.get(name) ?? []
      existing.push(id)
      names.set(name, existing)
      namesByProject.set(pid, names)

      const rawPhaseId = (row["PhaseId"] ?? "").trim()
      if (rawPhaseId !== "") {
        const phid = phaseId(rawPhaseId)
        if (!phases.has(phid))
          phases.set(phid, {
            id: phid,
            projectId: pid,
            name: (row["Phase"] ?? "").trim(),
            version: 1,
          })
      }
    })
  }

  for (const [pid, names] of namesByProject) {
    for (const [name, ids] of names) {
      if (ids.length > 1) {
        findings.push({
          kind: "DUPLICATE_NAME",
          entityIds: ids,
          detail: `Project ${pid} has ${ids.length} tasks named "${name}"; name-based references to it are ambiguous.`,
        })
      }
    }
  }

  // Second pass: resolve dependencies (longest match, fail closed), parents, time entries.
  const tasks: Task[] = []
  let dependencyCount = 0
  for (const raw of rawTasks) {
    const { row, line, id, projectId: pid } = raw
    const flags: TaskFlag[] = []
    const names = namesByProject.get(pid) ?? new Map<string, TaskId[]>()

    const predecessorIds: TaskId[] = []
    const rawDependency = (row["Dependency"] ?? "").trim()
    if (rawDependency !== "") {
      const resolution = resolveDependencyNames(rawDependency, names)
      for (const match of resolution.resolved) {
        if (match.length === 1) {
          predecessorIds.push(match[0]!)
        } else {
          flags.push("DEPENDENCY_AMBIGUOUS")
          findings.push({
            kind: "DEPENDENCY_AMBIGUOUS",
            entityIds: [id, ...match],
            detail: `${id} depends on a name that matches ${match.length} tasks in ${pid}. Task is non-completable until resolved.`,
          })
        }
      }
      if (resolution.unresolved.length > 0) {
        flags.push("DEPENDENCY_UNRESOLVED")
        findings.push({
          kind: "DEPENDENCY_UNRESOLVED",
          entityIds: [id],
          detail: `${id} depends on "${resolution.unresolved.join('", "')}" which matches no task in ${pid}. Task is non-completable until resolved.`,
        })
      }
    }
    dependencyCount += predecessorIds.length

    let parentTaskId: TaskId | null = null
    const rawParent = (row["ParentTaskId"] ?? "").trim()
    if (rawParent !== "") {
      const candidate = taskId(rawParent)
      if (taskIds.has(candidate)) parentTaskId = candidate
      else
        warnings.push({
          file: "tasks.csv",
          line,
          reason: "UNRESOLVED_PARENT",
          detail: `${id} → ${candidate}`,
        })
    }

    const completedAt = parseDate(row["CompletedAt"], "tasks.csv", line, warnings)
    const startDate = parseDate(row["StartDate"], "tasks.csv", line, warnings)
    const hours = Number.parseFloat(row["HoursTracked"] ?? "0")
    const timeEntries: TimeEntry[] =
      Number.isFinite(hours) && hours > 0
        ? [
            {
              id: timeEntryId(`${id}:import`),
              taskId: id,
              hours,
              actorId: IMPORT_ACTOR,
              at: completedAt ?? parseDate(row["ActualStartDate"], "tasks.csv", line, []) ?? null,
            },
          ]
        : []

    const rawPhaseId = (row["PhaseId"] ?? "").trim()
    const status = parseTaskStatus(row["Status"] ?? "")!
    tasks.push({
      id,
      projectId: pid,
      phaseId: rawPhaseId === "" ? null : phaseId(rawPhaseId),
      name: (row["TaskName"] ?? "").trim(),
      status,
      assigneeNames: splitList(row["Assignee"] ?? ""),
      isMilestone: (row["Is this a Billing Milestone?"] ?? "").trim().toLowerCase() === "true",
      parentTaskId,
      predecessorIds,
      timeEntries,
      flags,
      startDate,
      dueDate: parseDate(row["DueDate"], "tasks.csv", line, warnings),
      completedAt,
      version: 1,
    })
  }

  // Graph-level findings: cycles, historical inconsistencies, projects without tasks.
  let graph = new WorkspaceGraph({
    projects,
    phases: [...phases.values()],
    tasks,
    actors: [...actors.values()],
  })
  const cycleIds = graph.predecessorCycles()
  if (cycleIds.size > 0) {
    findings.push({
      kind: "CYCLE",
      entityIds: [...cycleIds],
      detail: `${cycleIds.size} tasks are on a predecessor cycle and are non-completable.`,
    })
    graph = graph.with({
      tasks: tasks
        .filter((t) => cycleIds.has(t.id))
        .map((t) => ({ ...t, flags: [...t.flags, "CYCLE" as const] })),
    })
  }

  const historical = tasks.filter((t) => t.status === "COMPLETED" && hoursTracked(t) === 0)
  if (historical.length > 0) {
    findings.push({
      kind: "HISTORICAL_POLICY_INCONSISTENCY",
      entityIds: historical.map((t) => t.id),
      detail: `${historical.length} tasks are Completed with no time logged. Policy 4 evaluates transitions, so these are reported, not blocked (D-06).`,
    })
  }

  const withoutTasks = projects.filter((p) => graph.tasksOf(p.id).length === 0)
  if (withoutTasks.length > 0) {
    findings.push({
      kind: "PROJECT_WITHOUT_TASKS",
      entityIds: withoutTasks.map((p) => p.id),
      detail: `${withoutTasks.length} projects have no tasks on record; they have no milestones and are trivially completable under policy 1. Completing one is high impact.`,
    })
  }

  const report: IngestionReport = {
    datasetId: input.datasetId,
    datasetVersion: fnv1a(input.projectsCsv) + fnv1a(input.tasksCsv),
    source: "export-2",
    counts: {
      projects: projects.length,
      phases: phases.size,
      tasks: tasks.length,
      dependencies: dependencyCount,
      milestones: tasks.filter((t) => t.isMilestone).length,
      subtasks: tasks.filter((t) => t.parentTaskId !== null).length,
      actors: actors.size,
    },
    rejected,
    warnings,
    findings,
    timingMs: Date.now() - started,
  }
  return { graph, report }
}

/**
 * Longest-match segmentation of a comma-joined list of task names against known names.
 * Task names may themselves contain ", ", so naive splitting is unsafe. Dynamic programming over
 * split points: prefer the segmentation that leaves the fewest unresolved *parts* (so a known name
 * is never swallowed into an unknown fragment), then the fewest segments.
 */
export function resolveDependencyNames(
  raw: string,
  namesToIds: ReadonlyMap<string, readonly TaskId[]>,
): { resolved: ReadonlyArray<readonly TaskId[]>; unresolved: readonly string[] } {
  const parts = raw.split(", ").map((p) => p.trim())
  const n = parts.length
  type Best = { unresolved: number; segments: number; cuts: number[] }
  const best: Array<Best | null> = new Array(n + 1).fill(null)
  best[0] = { unresolved: 0, segments: 0, cuts: [] }

  for (let end = 1; end <= n; end += 1) {
    for (let start = 0; start < end; start += 1) {
      const prev = best[start]
      if (!prev) continue
      const candidate = parts.slice(start, end).join(", ")
      const known = namesToIds.has(candidate)
      const next: Best = {
        unresolved: prev.unresolved + (known ? 0 : end - start),
        segments: prev.segments + 1,
        cuts: [...prev.cuts, end],
      }
      const current = best[end]
      if (
        !current ||
        next.unresolved < current.unresolved ||
        (next.unresolved === current.unresolved && next.segments < current.segments)
      ) {
        best[end] = next
      }
    }
  }

  const chosen = best[n]!
  const resolved: Array<readonly TaskId[]> = []
  const unresolved: string[] = []
  let start = 0
  for (const cut of chosen.cuts) {
    const segment = parts.slice(start, cut).join(", ")
    const ids = namesToIds.get(segment)
    if (ids) resolved.push(ids)
    else unresolved.push(segment)
    start = cut
  }
  return { resolved, unresolved }
}

function upsertActor(
  actors: Map<ActorId, Actor>,
  rawId: string | null | undefined,
  rawName: string | null | undefined,
  rawEmail: string | null | undefined,
  role: Actor["role"],
  project: ProjectId,
): Actor | null {
  const name = (rawName ?? "").trim()
  const email = emptyToNull(rawEmail)
  const idSource = (rawId ?? "").trim() !== "" ? (rawId ?? "").trim() : (email ?? name)
  if (idSource === "") return null
  const id = actorId(idSource)
  const existing = actors.get(id)
  if (existing) {
    const merged: Actor = {
      ...existing,
      role: existing.role === "owner" || role === "owner" ? "owner" : existing.role,
      projectIds: existing.projectIds.includes(project)
        ? existing.projectIds
        : [...existing.projectIds, project],
    }
    actors.set(id, merged)
    return merged
  }
  const created: Actor = { id, name, email, role, projectIds: [project] }
  actors.set(id, created)
  return created
}

function splitTeamMembers(raw: string): ReadonlyArray<{ name: string; email: string | null }> {
  if (raw.trim() === "") return []
  return raw.split(",").map((entry) => {
    const [name = "", email] = entry.split("|").map((s) => s.trim())
    return { name, email: email && email !== "" ? email : null }
  })
}

function splitList(raw: string): readonly string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim()
  return trimmed === "" ? null : trimmed
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseDate(
  value: string | undefined,
  file: string,
  line: number,
  warnings: IngestionWarning[],
): string | null {
  const trimmed = (value ?? "").trim()
  if (trimmed === "") return null
  if (DATE_PATTERN.test(trimmed)) return trimmed
  warnings.push({ file, line, reason: "MALFORMED_DATE", detail: trimmed })
  return null
}
