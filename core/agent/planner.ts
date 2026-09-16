import type { Intent } from "@/core/agent/intent/intent"
import type { Actor } from "@/core/domain/entities"
import type { EntityRef } from "@/core/domain/ids"

/**
 * The agent proposes WHAT, never HOW (D-18). A ProposedPlan is targets + exclusions; the system
 * derives every step from the dependency closure in core/execution/flight-plan.ts.
 * This type is duplicated structurally here so core/agent never imports core/execution.
 */
export type Proposal = {
  readonly missionId: string
  readonly goalText: string
  readonly targets: readonly EntityRef[]
  readonly excluded: readonly EntityRef[]
  readonly actor: Actor
}

export function proposeFromIntent(
  intent: Intent & { readonly kind: "complete_target" | "complete_task" },
  actor: Actor,
  missionId: string,
): Proposal {
  return {
    missionId,
    goalText: intent.utterance,
    targets: intent.targets,
    excluded: [],
    actor,
  }
}
