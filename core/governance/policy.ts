import type { WorkspaceGraph } from "@/core/domain/graph"
import type { EntityRef, TaskId } from "@/core/domain/ids"
import type { StatusInterpretation } from "@/core/domain/status"

/**
 * Policy contract (spec §8A). Preserves the brief's trigger → validation → allow/block structure.
 * The model may explain an evaluation; it may never alter one.
 */

export type PolicyId =
  | "P1_PROJECT_MILESTONES"
  | "P2_MILESTONE_SUBTASKS"
  | "P3_TASK_PREDECESSORS"
  | "P4_TASK_TIME"

/**
 * The supplied policies govern COMPLETED only. Reverse transitions (an undo mission) pass through
 * the same evaluation so the evidence trail shows every policy as "not triggered by this action".
 */
export type Transition = {
  readonly target: EntityRef
  readonly to: "COMPLETED" | "REVERTED" | "TIME_REMOVED"
}

export type PolicyTrigger = {
  readonly targetKind: EntityRef["kind"]
  readonly to: Transition["to"]
  /** Extra predicate on the target entity (e.g. "is a milestone"). */
  readonly when?: (ctx: EvaluationContext) => boolean
}

export type Evidence = {
  readonly ref: EntityRef
  readonly label: string
  readonly detail: string
}

export type ValidationResult = {
  readonly id: string
  readonly passed: boolean
  readonly reasonCode: ReasonCode
  readonly evidence: readonly Evidence[]
}

export type ReasonCode =
  | "MILESTONES_INCOMPLETE"
  | "SUBTASKS_OPEN"
  | "PREDECESSORS_INCOMPLETE"
  | "NO_TIME_LOGGED"
  | "DATA_FLAGGED"
  | "OK"

export type Validation = {
  readonly id: string
  readonly reasonCode: Exclude<ReasonCode, "OK">
  readonly run: (ctx: EvaluationContext) => { passed: boolean; evidence: readonly Evidence[] }
}

export type Policy = {
  readonly id: PolicyId
  readonly name: string
  /** Sentence used in blocker copy, e.g. "predecessor {name} is incomplete". */
  readonly rule: string
  readonly version: string
  readonly source: "brief"
  readonly severity: "blocking"
  readonly trigger: PolicyTrigger
  readonly validations: readonly Validation[]
}

export type GovernanceConfig = {
  readonly interpretation: StatusInterpretation
  /** A-02: hours must be logged on the task itself. Threshold in hours, exclusive. */
  readonly minimumHours: number
}

export type EvaluationContext = {
  readonly graph: WorkspaceGraph
  readonly transition: Transition
  readonly config: GovernanceConfig
}

export type PolicyEvaluation = {
  readonly policyId: PolicyId
  readonly policyVersion: string
  readonly targetRef: EntityRef
  readonly triggerMatched: boolean
  readonly validations: readonly ValidationResult[]
  readonly allowed: boolean
  readonly blockingReasons: readonly ReasonCode[]
  readonly evidence: readonly Evidence[]
}

export type GovernanceDecision = {
  readonly transition: Transition
  readonly allowed: boolean
  readonly evaluations: readonly PolicyEvaluation[]
  /** Task-level data flags (unresolved dependency, cycle) also block, independent of policy. */
  readonly dataFlags: readonly { taskId: TaskId; flag: string }[]
}
