export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "COMPLETED", "BLOCKED", "NA"] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const PROJECT_STATUSES = ["IN_PROGRESS", "COMPLETED", "OTHER"] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

/**
 * Interpretation switches the brief does not settle (assumptions A-01 … A-04 in
 * docs/agent-context/03-decisions-locked.md). They are configuration, never constants.
 */
export type StatusInterpretation = {
  /** A-01: does a task in status NA count as open for policies 1–3? Default false. */
  readonly naCountsAsOpen: boolean
}

export const DEFAULT_STATUS_INTERPRETATION: StatusInterpretation = {
  naCountsAsOpen: false,
}

export function isTaskOpen(status: TaskStatus, interpretation: StatusInterpretation): boolean {
  switch (status) {
    case "COMPLETED":
      return false
    case "NA":
      return interpretation.naCountsAsOpen
    case "TODO":
    case "IN_PROGRESS":
    case "BLOCKED":
      return true
  }
}

export function isTaskComplete(status: TaskStatus): boolean {
  return status === "COMPLETED"
}

const TASK_STATUS_BY_RAW: Readonly<Record<string, TaskStatus>> = {
  "to do": "TODO",
  todo: "TODO",
  "in progress": "IN_PROGRESS",
  completed: "COMPLETED",
  done: "COMPLETED",
  blocked: "BLOCKED",
  na: "NA",
  "n/a": "NA",
}

export function parseTaskStatus(raw: string): TaskStatus | null {
  return TASK_STATUS_BY_RAW[raw.trim().toLowerCase()] ?? null
}

export function parseProjectStatus(raw: string): ProjectStatus {
  const normalized = raw.trim().toLowerCase()
  if (normalized === "completed" || normalized === "done") return "COMPLETED"
  if (normalized === "in progress") return "IN_PROGRESS"
  return "OTHER"
}
