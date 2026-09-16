import type { ActorId, PhaseId, ProjectId, TaskId, TimeEntryId } from "@/core/domain/ids"
import type { ProjectStatus, TaskStatus } from "@/core/domain/status"

/** Every entity carries a version incremented by the system of record on write. */
export type Versioned = { readonly version: number }

export type Project = Versioned & {
  readonly id: ProjectId
  readonly name: string
  readonly status: ProjectStatus
  readonly rawStatus: string
  readonly ownerId: ActorId | null
  readonly ownerName: string | null
  readonly customerName: string | null
  readonly startDate: string | null
  readonly dueDate: string | null
  readonly teamMemberIds: readonly ActorId[]
  readonly region: string | null
}

export type Phase = Versioned & {
  readonly id: PhaseId
  readonly projectId: ProjectId
  readonly name: string
}

/** Data-quality flags raised at ingestion. A flagged task is non-completable until the data is fixed. */
export type TaskFlag = "DEPENDENCY_UNRESOLVED" | "DEPENDENCY_AMBIGUOUS" | "CYCLE"

export type TimeEntry = {
  readonly id: TimeEntryId
  readonly taskId: TaskId
  readonly hours: number
  readonly actorId: ActorId
  readonly at: string | null
}

export type Task = Versioned & {
  readonly id: TaskId
  readonly projectId: ProjectId
  readonly phaseId: PhaseId | null
  readonly name: string
  readonly status: TaskStatus
  readonly assigneeNames: readonly string[]
  readonly isMilestone: boolean
  readonly parentTaskId: TaskId | null
  readonly predecessorIds: readonly TaskId[]
  readonly timeEntries: readonly TimeEntry[]
  readonly flags: readonly TaskFlag[]
  readonly startDate: string | null
  readonly dueDate: string | null
  readonly completedAt: string | null
}

export type ActorRole = "owner" | "member" | "viewer"

export type Actor = {
  readonly id: ActorId
  readonly name: string
  readonly email: string | null
  readonly role: ActorRole
  readonly projectIds: readonly ProjectId[]
}

export function hoursTracked(task: Pick<Task, "timeEntries">): number {
  let total = 0
  for (const entry of task.timeEntries) total += entry.hours
  return total
}

export type Dataset = {
  readonly projects: readonly Project[]
  readonly phases: readonly Phase[]
  readonly tasks: readonly Task[]
  readonly actors: readonly Actor[]
}
