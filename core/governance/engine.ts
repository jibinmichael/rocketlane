import type { WorkspaceGraph } from "@/core/domain/graph"
import type { TaskId } from "@/core/domain/ids"
import { DEFAULT_STATUS_INTERPRETATION } from "@/core/domain/status"
import { SUPPLIED_POLICIES } from "@/core/governance/policies/supplied-policies"
import type {
  Evidence,
  GovernanceConfig,
  GovernanceDecision,
  Policy,
  PolicyEvaluation,
  ReasonCode,
  Transition,
  ValidationResult,
} from "@/core/governance/policy"

export const DEFAULT_GOVERNANCE_CONFIG: GovernanceConfig = {
  interpretation: DEFAULT_STATUS_INTERPRETATION,
  minimumHours: 0,
}

/**
 * Deterministic governance evaluation (spec §32). Returns structured results; never copy.
 * Policies whose trigger does not match are reported with `triggerMatched: false` so the
 * evidence trail shows what was and was not evaluated (spec §8A).
 */
export function evaluateGovernance(
  graph: WorkspaceGraph,
  transition: Transition,
  options: { policies?: readonly Policy[]; config?: GovernanceConfig } = {},
): GovernanceDecision {
  const policies = options.policies ?? SUPPLIED_POLICIES
  const config = options.config ?? DEFAULT_GOVERNANCE_CONFIG
  const ctx = { graph, transition, config }

  const evaluations: PolicyEvaluation[] = policies.map((policy) => {
    const triggerMatched =
      policy.trigger.targetKind === transition.target.kind &&
      policy.trigger.to === transition.to &&
      (policy.trigger.when?.(ctx) ?? true)

    if (!triggerMatched) {
      return {
        policyId: policy.id,
        policyVersion: policy.version,
        targetRef: transition.target,
        triggerMatched: false,
        validations: [],
        allowed: true,
        blockingReasons: [],
        evidence: [],
      }
    }

    const validations: ValidationResult[] = policy.validations.map((validation) => {
      const outcome = validation.run(ctx)
      return {
        id: validation.id,
        passed: outcome.passed,
        reasonCode: outcome.passed ? "OK" : validation.reasonCode,
        evidence: outcome.evidence,
      }
    })
    const failed = validations.filter((v) => !v.passed)
    const blockingReasons: ReasonCode[] = failed.map((v) => v.reasonCode)
    const evidence: Evidence[] = failed.flatMap((v) => v.evidence)
    return {
      policyId: policy.id,
      policyVersion: policy.version,
      targetRef: transition.target,
      triggerMatched: true,
      validations,
      allowed: failed.length === 0,
      blockingReasons,
      evidence,
    }
  })

  const dataFlags: Array<{ taskId: TaskId; flag: string }> = []
  if (transition.target.kind === "task") {
    const task = graph.task(transition.target.id)
    for (const flag of task?.flags ?? []) dataFlags.push({ taskId: transition.target.id, flag })
  }

  return {
    transition,
    allowed: evaluations.every((e) => e.allowed) && dataFlags.length === 0,
    evaluations,
    dataFlags,
  }
}
