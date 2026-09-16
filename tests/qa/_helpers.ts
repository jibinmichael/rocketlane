import type { Block, Inline } from "@/core/agent/conversation/blocks"
import type { Actor, Project, Task } from "@/core/domain/entities"
import { WorkspaceGraph } from "@/core/domain/graph"
import { actorId, projectId, taskId, timeEntryId } from "@/core/domain/ids"
import type { EntityRef } from "@/core/domain/ids"
import type { TaskStatus } from "@/core/domain/status"
import { MissionEngine } from "@/core/execution/engine"
import type { ProposedPlan } from "@/core/execution/flight-plan"
import type { GovernanceConfig } from "@/core/governance/policy"
import { RoleBasedPermissions } from "@/core/governance/permissions"
import { ingestTwoFileExport, type IngestionResult } from "@/core/ingestion/export-two-file"
import { MemoryMissionStore } from "@/core/mission/store"
import { VirtualClock } from "@/core/system/clock"
import { InMemorySystemOfRecord } from "@/core/system/in-memory"
import { EventLog } from "@/core/telemetry/events"

/** QA-only helpers. Hand-built graphs bypass ingestion so we can feed the engine data ingestion would normally flag. */

export const OWNER_ID = actorId("ACT-OWNER")
export const STRANGER_ID = actorId("ACT-STRANGER")

export const owner: Actor = {
  id: OWNER_ID,
  name: "Owner One",
  email: "owner@example.com",
  role: "owner",
  projectIds: [],
}

export const stranger: Actor = {
  id: STRANGER_ID,
  name: "Stranger",
  email: "stranger@example.com",
  role: "member",
  projectIds: [],
}

export function mkProject(id: string, over: Partial<Project> = {}): Project {
  return {
    id: projectId(id),
    name: id,
    status: "IN_PROGRESS",
    rawStatus: "In progress",
    ownerId: OWNER_ID,
    ownerName: owner.name,
    customerName: null,
    startDate: null,
    dueDate: null,
    teamMemberIds: [],
    region: null,
    version: 1,
    ...over,
  }
}

export type TaskSpec = {
  id: string
  project?: string
  name?: string
  status?: TaskStatus
  hours?: number
  milestone?: boolean
  parent?: string | null
  predecessors?: string[]
  flags?: Task["flags"]
  assignees?: string[]
}

export function mkTask(spec: TaskSpec): Task {
  const id = taskId(spec.id)
  const hours = spec.hours ?? 0
  return {
    id,
    projectId: projectId(spec.project ?? "P1"),
    phaseId: null,
    name: spec.name ?? spec.id,
    status: spec.status ?? "TODO",
    assigneeNames: spec.assignees ?? [],
    isMilestone: spec.milestone ?? false,
    parentTaskId: spec.parent ? taskId(spec.parent) : null,
    predecessorIds: (spec.predecessors ?? []).map(taskId),
    timeEntries:
      hours === 0
        ? []
        : [{ id: timeEntryId(`${spec.id}:qa`), taskId: id, hours, actorId: OWNER_ID, at: null }],
    flags: spec.flags ?? [],
    startDate: null,
    dueDate: null,
    completedAt: spec.status === "COMPLETED" ? "2026-01-01" : null,
    version: 1,
  }
}

export function mkGraph(input: {
  projects?: Project[]
  tasks?: Task[]
  actors?: Actor[]
}): WorkspaceGraph {
  const projects = input.projects ?? [mkProject("P1")]
  const actors = input.actors ?? [{ ...owner, projectIds: projects.map((p) => p.id) }, stranger]
  return new WorkspaceGraph({ projects, phases: [], tasks: input.tasks ?? [], actors })
}

export const pref = (id: string): EntityRef => ({ kind: "project", id: projectId(id) })
export const tref = (id: string): EntityRef => ({ kind: "task", id: taskId(id) })

let counter = 0

export function engineOn(graph: WorkspaceGraph, governance?: GovernanceConfig) {
  const clock = new VirtualClock()
  const sor = new InMemorySystemOfRecord(graph, { clock })
  const store = new MemoryMissionStore()
  const events = new EventLog()
  const engine = new MissionEngine({
    sor,
    permissions: new RoleBasedPermissions(),
    store,
    events,
    clock,
    ...(governance ? { governance } : {}),
    resolveActor: (id) => sor.current().actor(id),
  })
  const propose = (
    actor: Actor,
    targets: EntityRef[],
    excluded: EntityRef[] = [],
    goalText = "qa goal",
  ): ProposedPlan => {
    counter += 1
    return { missionId: `qa-${counter}`, goalText, targets, excluded, actor }
  }
  return { engine, sor, store, events, clock, propose }
}

export const flat = (lines: readonly (readonly Inline[])[]): string =>
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

export function allText(blocks: readonly Block[]): string {
  return blocks
    .map((b) => {
      const parts = [flat(b.lines)]
      if (b.detail) parts.push(flat(b.detail))
      for (const a of b.actions) parts.push(a.label)
      if (b.path) parts.push(b.path.map((p) => p.label).join(" > "))
      return parts.join("\n")
    })
    .join("\n")
}

export const BANNED_WORDS = [/\bthinking\b/i, /\boops\b/i, /\bgreat news\b/i, /\bsnag\b/i]

export function bannedIn(blocks: readonly Block[]): string[] {
  const text = allText(blocks)
  return BANNED_WORDS.filter((re) => re.test(text)).map((re) => re.source)
}

// ---------------------------------------------------------------------------------------------
// CSV builders (two-file export shape)

export const PROJECT_HEADER = [
  "ProjectId",
  "ProjectName",
  "ProjectStatus",
  "ProjectOwner",
  "ProjectOwnerId",
  "ProjectOwnerEmail",
  "TeamMembers",
] as const

export const TASK_HEADER = [
  "ProjectId",
  "TaskId",
  "TaskName",
  "Status",
  "HoursTracked",
  "Is this a Billing Milestone?",
  "Dependency",
  "ParentTaskId",
  "Assignee",
] as const

type ProjectCol = (typeof PROJECT_HEADER)[number]
type TaskCol = (typeof TASK_HEADER)[number]

function quote(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function csv(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  eol = "\n",
): string {
  return [header.join(","), ...rows.map((r) => r.map(quote).join(","))].join(eol) + eol
}

export function projectRow(v: Partial<Record<ProjectCol, string>>): string[] {
  return PROJECT_HEADER.map((c) => v[c] ?? defaultProject[c] ?? "")
}

const defaultProject: Partial<Record<ProjectCol, string>> = {
  ProjectStatus: "In progress",
  ProjectOwner: "Owner One",
  ProjectOwnerId: "ACT-OWNER",
  ProjectOwnerEmail: "owner@example.com",
}

export function taskRow(v: Partial<Record<TaskCol, string>>): string[] {
  return TASK_HEADER.map(
    (c) => v[c] ?? (c === "Status" ? "To do" : c === "HoursTracked" ? "1" : ""),
  )
}

export function ingestRows(
  projects: readonly (readonly string[])[],
  tasks: readonly (readonly string[])[],
  datasetId = "qa",
): IngestionResult {
  return ingestTwoFileExport({
    datasetId,
    projectsCsv: csv(PROJECT_HEADER, projects),
    tasksCsv: csv(TASK_HEADER, tasks),
  })
}

export function ingestStrings(projectsCsv: string, tasksCsv: string): IngestionResult {
  return ingestTwoFileExport({ datasetId: "qa", projectsCsv, tasksCsv })
}
