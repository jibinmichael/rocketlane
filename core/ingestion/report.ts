import type { TaskId } from "@/core/domain/ids"

export type RejectCode =
  | "MISSING_ID"
  | "UNKNOWN_STATUS"
  | "UNKNOWN_PROJECT"
  | "DUPLICATE_ID"
  | "NEGATIVE_HOURS"
  | "MALFORMED_ROW"
  | "MISSING_COLUMNS"

export type WarnCode = "MALFORMED_DATE" | "UNRESOLVED_PARENT" | "DUPLICATE_NAME" | "NON_STANDARD_ID"

export type FindingKind =
  | "HISTORICAL_POLICY_INCONSISTENCY"
  | "DUPLICATE_NAME"
  | "CYCLE"
  | "DEPENDENCY_UNRESOLVED"
  | "DEPENDENCY_AMBIGUOUS"
  | "PROJECT_WITHOUT_TASKS"

export type IngestionRejection = {
  readonly file: string
  readonly line: number
  readonly reason: RejectCode
  readonly detail: string
}

export type IngestionWarning = {
  readonly file: string
  readonly line: number
  readonly reason: WarnCode
  readonly detail: string
}

export type IngestionFinding = {
  readonly kind: FindingKind
  readonly entityIds: readonly string[]
  readonly detail: string
}

export type IngestionReport = {
  readonly datasetId: string
  readonly datasetVersion: string
  readonly source: "export-2" | "brief-5"
  readonly counts: {
    readonly projects: number
    readonly phases: number
    readonly tasks: number
    readonly dependencies: number
    readonly milestones: number
    readonly subtasks: number
    readonly actors: number
  }
  readonly rejected: readonly IngestionRejection[]
  readonly warnings: readonly IngestionWarning[]
  readonly findings: readonly IngestionFinding[]
  readonly timingMs: number
}

export type FlaggedTask = { readonly id: TaskId; readonly detail: string }
