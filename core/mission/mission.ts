import type { ActorId, EntityRef } from "@/core/domain/ids"
import type { Blocker } from "@/core/resolver/blockers"

/**
 * The durable unit of work (spec §4, §34). Conversation rendering reads this; it never owns it.
 */

export type MissionState =
  | "READY"
  | "ACTIVE"
  | "WAITING"
  | "EXECUTING"
  | "VERIFYING"
  | "COMPLETED"
  | "BLOCKED"
  | "FAILED"
  | "STALE"
  | "PERMISSION_DENIED"
  | "CANCELLED"
  | "PARTIALLY_COMPLETED"

export type ActionClass = "READ" | "SAFE_WRITE" | "DECISION_REQUIRED" | "BLOCKED" | "HIGH_IMPACT"

export type StepStatus =
  | "pending"
  | "waiting_input"
  | "waiting_confirm"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked"
  | "skipped"
  | "cancelled"
  | "already_complete"
  | "permission_denied"

export type VerificationStatus = "UNVERIFIED" | "VERIFIED" | "MISMATCH"

export type FailureClass =
  | "timeout"
  | "api_failure"
  | "conflict"
  | "duplicate"
  | "partial_execution"

export type PlanStep = {
  /** Stable: hash(missionId, ref, transition). Doubles as the idempotency key (D-20). */
  readonly id: string
  readonly ref: EntityRef
  readonly label: string
  readonly transition: "COMPLETED" | "TIME_LOGGED"
  /** The mission target this step serves (batch aggregation). */
  readonly forTarget: EntityRef
  readonly actionClass: ActionClass
  readonly status: StepStatus
  readonly verification: VerificationStatus
  readonly failureClass: FailureClass | null
  readonly retries: number
  readonly observedVersion: number | null
  readonly blockers: readonly Blocker[]
  readonly note: string | null
}

export type Decision = {
  readonly at: number
  readonly stepId: string | null
  readonly kind: "approve" | "decline" | "input" | "cancel" | "change_scope" | "continue"
  readonly detail: string
}

export type TargetOutcome =
  | "completed"
  | "blocked"
  | "already_complete"
  | "failed"
  | "cancelled"
  | "permission_denied"
  | "pending"
  | "completed_before_scope_change"

export type MissionOutcome = {
  readonly perTarget: ReadonlyArray<{
    readonly ref: EntityRef
    readonly label: string
    readonly outcome: TargetOutcome
  }>
  readonly completed: number
  readonly blocked: number
  readonly alreadyComplete: number
  readonly failed: number
  readonly cancelled: number
  readonly permissionDenied: number
  readonly completedBeforeScopeChange: number
}

export type PendingDecision =
  | { readonly kind: "input_hours"; readonly stepId: string }
  | { readonly kind: "confirm_step"; readonly stepId: string }
  | { readonly kind: "confirm_plan" }
  | null

export type StateChangeNotice = {
  readonly at: number
  readonly ref: EntityRef
  readonly summary: string
  readonly actorId: ActorId
  readonly affectedStepIds: readonly string[]
}

export type Mission = {
  readonly id: string
  readonly correlationId: string
  readonly datasetId: string
  readonly actorId: ActorId
  readonly goalText: string
  readonly targets: readonly EntityRef[]
  readonly targetLabels: readonly string[]
  /** Refs the user asked to leave alone (scope reduction). */
  readonly excluded: readonly EntityRef[]
  readonly state: MissionState
  readonly plan: readonly PlanStep[]
  readonly pending: PendingDecision
  readonly planConfirmed: boolean
  readonly currentStepId: string | null
  readonly blockers: readonly Blocker[]
  /** Open tasks in scope not required by policy (consequence, D-07). */
  readonly openButNotRequired: ReadonlyArray<{ readonly ref: EntityRef; readonly label: string }>
  readonly decisions: readonly Decision[]
  readonly stateChanges: readonly StateChangeNotice[]
  readonly outcome: MissionOutcome | null
  readonly interpretedBy: "deterministic" | "model" | null
  readonly createdAt: number
  readonly updatedAt: number
  readonly landedAt: number | null
}

export type MissionSummary = Pick<
  Mission,
  "id" | "goalText" | "state" | "targetLabels" | "updatedAt" | "createdAt" | "pending" | "landedAt"
> & { readonly progress: { readonly done: number; readonly total: number } }

export function summarize(mission: Mission): MissionSummary {
  const writes = mission.plan.filter((s) => s.transition === "COMPLETED")
  return {
    id: mission.id,
    goalText: mission.goalText,
    state: mission.state,
    targetLabels: mission.targetLabels,
    updatedAt: mission.updatedAt,
    createdAt: mission.createdAt,
    pending: mission.pending,
    landedAt: mission.landedAt,
    progress: {
      done: writes.filter((s) => s.status === "succeeded" || s.status === "already_complete")
        .length,
      total: writes.length,
    },
  }
}

export const TERMINAL_STATES: ReadonlySet<MissionState> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "PARTIALLY_COMPLETED",
  "PERMISSION_DENIED",
])

export function isTerminal(mission: Mission): boolean {
  return TERMINAL_STATES.has(mission.state)
}
