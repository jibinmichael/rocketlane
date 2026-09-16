import type { WorkspaceGraph } from "@/core/domain/graph"
import type { ActorId, EntityRef, ProjectId, TaskId, TimeEntryId } from "@/core/domain/ids"
import type { TaskStatus } from "@/core/domain/status"

/**
 * The system-of-record port (ADR 0006). Every read and write of project state goes through here.
 * Only core/execution may call `write`; the world (second tab, scripted scenario) uses
 * `externalWrite`, which bypasses governance because the world is not the agent.
 */

export type WriteCommand =
  | { readonly kind: "complete_task"; readonly taskId: TaskId }
  | { readonly kind: "complete_project"; readonly projectId: ProjectId }
  | {
      readonly kind: "add_time_entry"
      readonly taskId: TaskId
      readonly hours: number
      readonly actorId: ActorId
    }
  /** World-only. Not reachable from any user intent. */
  | { readonly kind: "set_task_status"; readonly taskId: TaskId; readonly status: TaskStatus }
  /**
   * Undo only. Reachable solely through an undo mission whose plan is derived from a prior
   * mission's verified writes; never from an intent that names an arbitrary status.
   */
  | { readonly kind: "revert_task_status"; readonly taskId: TaskId; readonly status: TaskStatus }
  | {
      readonly kind: "revert_project_status"
      readonly projectId: ProjectId
      readonly rawStatus: string
    }
  | { readonly kind: "remove_time_entry"; readonly taskId: TaskId; readonly entryId: TimeEntryId }

export type WriteMeta = {
  readonly idempotencyKey: string
  readonly expectedVersion: number | null
  readonly actorId: ActorId
  readonly correlationId: string
}

export type WriteResult = {
  readonly applied: boolean
  /** True when this key had already been applied; the original result is returned. */
  readonly deduplicated: boolean
  readonly ref: EntityRef
  readonly version: number
}

export type StateChange = {
  readonly ref: EntityRef
  /** Project the changed entity belongs to; lets the engine scope revalidation without peeking at the store. */
  readonly projectId: ProjectId | null
  /** "remote" when adopted from another tab; never re-persisted or re-broadcast. */
  readonly origin: "local" | "remote"
  readonly previousVersion: number
  readonly version: number
  readonly correlationId: string
  readonly actorId: ActorId
  readonly cause: "agent" | "external"
  readonly at: number
  readonly summary: string
}

export class TimeoutError extends Error {
  override readonly name = "TimeoutError"
  constructor(readonly idempotencyKey: string) {
    super(`write ${idempotencyKey} timed out; it may or may not have applied`)
  }
}

export class ConflictError extends Error {
  override readonly name = "ConflictError"
  constructor(
    readonly ref: EntityRef,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(
      `version conflict on ${ref.kind}:${ref.id}: expected ${expectedVersion}, found ${actualVersion}`,
    )
  }
}

export class ApiError extends Error {
  override readonly name = "ApiError"
  constructor(message: string) {
    super(message)
  }
}

export type Unsubscribe = () => void

export interface SystemOfRecord {
  snapshot(): Promise<WorkspaceGraph>
  read(ref: EntityRef): Promise<{ readonly version: number } | null>
  write(cmd: WriteCommand, meta: WriteMeta): Promise<WriteResult>
  externalWrite(cmd: WriteCommand, actorId: ActorId, summary?: string): Promise<WriteResult>
  subscribe(listener: (change: StateChange) => void): Unsubscribe
}

export function refOf(cmd: WriteCommand): EntityRef {
  switch (cmd.kind) {
    case "complete_project":
    case "revert_project_status":
      return { kind: "project", id: cmd.projectId }
    case "complete_task":
    case "add_time_entry":
    case "set_task_status":
    case "revert_task_status":
    case "remove_time_entry":
      return { kind: "task", id: cmd.taskId }
  }
}
