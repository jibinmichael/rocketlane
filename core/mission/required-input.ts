import { hoursTracked } from "@/core/domain/entities"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { GovernanceConfig } from "@/core/governance/policy"
import type { PlanStep, RequiredInput } from "@/core/mission/mission"

/**
 * Missing input is a generic mission capability (spec §8E: missing data → request required input).
 * A transition declares what it needs; the engine asks, validates against the declared schema,
 * checks permission, executes, verifies and continues. Adding a new kind of required input means
 * adding a case here and a sentence in the renderer, never a new component or a policy hack.
 */

/** Upper bound for one entry; larger values are almost certainly a typo, never silently accepted. */
export const MAX_HOURS_PER_ENTRY = 1000

export function requiredInputFor(
  step: Pick<PlanStep, "transition">,
  governance: GovernanceConfig,
): RequiredInput | null {
  switch (step.transition) {
    case "TIME_LOGGED":
      return {
        field: "hours",
        policyId: "P4_TASK_TIME",
        reasonCode: "NO_TIME_LOGGED",
        permission: "log_time",
        schema: {
          type: "number",
          exclusiveMinimum: governance.minimumHours,
          maximum: MAX_HOURS_PER_ENTRY,
        },
      }
    case "COMPLETED":
      return null
  }
}

export type InputValidation =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly reason: "not_a_number" | "too_small" | "too_large" }

/** Never guesses: "two hours" is not a number, "0" and "-2" are not positive, 5000 is not plausible. */
export function validateInput(input: RequiredInput, raw: unknown): InputValidation {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : Number.NaN
  if (!Number.isFinite(value)) return { ok: false, reason: "not_a_number" }
  if (value <= input.schema.exclusiveMinimum) return { ok: false, reason: "too_small" }
  if (value > input.schema.maximum) return { ok: false, reason: "too_large" }
  return { ok: true, value }
}

/** The world, re-read, now satisfies what the input was for. */
export function inputSatisfied(
  step: PlanStep,
  graph: WorkspaceGraph,
  governance: GovernanceConfig,
): boolean {
  const input = requiredInputFor(step, governance)
  if (!input) return false
  switch (input.field) {
    case "hours": {
      const task = step.ref.kind === "task" ? graph.task(step.ref.id) : null
      return task !== null && hoursTracked(task) > governance.minimumHours
    }
  }
}
