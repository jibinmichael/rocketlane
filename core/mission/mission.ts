import type { ActorId, EntityRef } from "@/core/domain/ids"
import type { PermissionAction } from "@/core/governance/permissions"
import type { PolicyId, ReasonCode } from "@/core/governance/policy"
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
  /** The user asked to stop scheduling; resumable, nothing rolled back. */
  | "PAUSED"
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

/** Closed set of step annotations. Rendering and aggregation branch on these, never on prose. */
export type StepNote =
  | "confirmed"
  | "declined by user"
  | "completed before scope change"
  | "blocked upstream"
  | "failed upstream"

export type PlanStep = {
  /** Stable: hash(missionId, ref, transition). Doubles as the idempotency key (D-20). */
  readonly id: string
  readonly ref: EntityRef
  readonly label: string
  readonly transition: "COMPLETED" | "TIME_LOGGED" | "REVERTED" | "TIME_REMOVED"
  /** The mission target this step serves (batch aggregation). */
  readonly forTarget: EntityRef
  readonly actionClass: ActionClass
  readonly status: StepStatus
  readonly verification: VerificationStatus
  readonly failureClass: FailureClass | null
  readonly retries: number
  readonly observedVersion: number | null
  readonly blockers: readonly Blocker[]
  readonly note: StepNote | null
  /** The status the entity held before this step wrote it (task status, or the project's raw status); an undo restores exactly this. */
  readonly before: string | null
  /** For a reverse step: the id of the step it undoes. */
  readonly reverts: string | null
}

export type Decision = {
  readonly at: number
  readonly stepId: string | null
  readonly kind: "approve" | "decline" | "input" | "cancel" | "pause" | "change_scope" | "continue"
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

/**
 * A legitimate human input a governance rule requires before a step can run. Generic: the field,
 * the rule that demands it, the permission it needs and the value's schema. Conversation collects
 * it; the engine validates against `schema`, never guesses, never fabricates.
 */
export type RequiredInput = {
  readonly field: "hours"
  readonly policyId: PolicyId
  readonly reasonCode: ReasonCode
  readonly permission: PermissionAction
  readonly schema: {
    readonly type: "number"
    readonly exclusiveMinimum: number
    readonly maximum: number
  }
}

export type PendingDecision =
  | { readonly kind: "input"; readonly stepId: string; readonly input: RequiredInput }
  | { readonly kind: "confirm_step"; readonly stepId: string }
  | { readonly kind: "confirm_plan" }
  | null

export type StateChangeNotice = {
  readonly at: number
  readonly ref: EntityRef
  readonly summary: string
  readonly actorId: ActorId | null
  readonly affectedStepIds: readonly string[]
  /** Filled in by the replan that followed the pause; stable so the thread never re-renders it. */
  readonly replan: { readonly kept: number; readonly planned: number } | null
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
  /** A pause was asked for while an update was in flight; it takes effect once that update is reconciled. */
  readonly pauseRequested: boolean
  readonly planConfirmed: boolean
  readonly currentStepId: string | null
  readonly blockers: readonly Blocker[]
  /** Open tasks in scope not required by policy (consequence, D-07). */
  readonly openButNotRequired: ReadonlyArray<{ readonly ref: EntityRef; readonly label: string }>
  readonly decisions: readonly Decision[]
  readonly stateChanges: readonly StateChangeNotice[]
  readonly outcome: MissionOutcome | null
  readonly interpretedBy: "deterministic" | "model" | null
  /** Who started it: a person in the conversation, or a routine check (spec §13). Same engine, same rules. */
  readonly origin: "user" | "routine" | "undo"
  /** For an undo mission: the mission whose verified writes it reverses. */
  readonly reverts: string | null
  readonly createdAt: number
  readonly updatedAt: number
  readonly landedAt: number | null
}

export type MissionSummary = Pick<
  Mission,
  "id" | "goalText" | "state" | "targetLabels" | "updatedAt" | "createdAt" | "pending" | "landedAt"
>

export function summarize(mission: Mission): MissionSummary {
  return {
    id: mission.id,
    goalText: mission.goalText,
    state: mission.state,
    targetLabels: mission.targetLabels,
    updatedAt: mission.updatedAt,
    createdAt: mission.createdAt,
    pending: mission.pending,
    landedAt: mission.landedAt,
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
