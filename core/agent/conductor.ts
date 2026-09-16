import type { Intent } from "@/core/agent/intent/intent"
import { type Proposal, proposeFromIntent } from "@/core/agent/planner"
import type { Actor } from "@/core/domain/entities"
import type { EntityRef } from "@/core/domain/ids"
import type { Mission } from "@/core/mission/mission"

/**
 * One turn, one place (spec §3, §27). A grounded intent becomes exactly one engine command, or a
 * reply. The live runtime and the scenario runner both call this, so they cannot drift apart.
 *
 * The conductor never sees model output: `Intent` is already grounded to entity refs, and the
 * engine still validates, permission-checks and governs every write it is asked to make.
 */

/** The commands the mission engine exposes to a turn. Structural, so `core/agent` needs no engine import. */
export type MissionCommands = {
  start(
    proposal: Proposal,
    options: { readonly datasetId: string; readonly interpretedBy?: Mission["interpretedBy"] },
  ): Promise<Mission>
  provideHours(missionId: string, stepId: string, hours: number): Promise<Mission>
  approve(missionId: string, stepId: string | null): Promise<Mission>
  decline(missionId: string, stepId: string | null): Promise<Mission>
  cancel(missionId: string): Mission
  resume(missionId: string): Promise<Mission>
  changeScope(missionId: string, exclude: EntityRef): Promise<Mission>
}

export type SessionHint = "PLANNING" | "EXECUTING" | "RECHECKING"

export type ConductorOutcome =
  | { readonly kind: "started"; readonly missionId: string }
  | { readonly kind: "applied"; readonly session: SessionHint | null }
  /** Nothing to execute; the surface renders `intent` as a reply. */
  | { readonly kind: "reply"; readonly intent: Intent }

export type ConductorInput = {
  readonly intent: Intent
  readonly current: Mission | null
  readonly actor: Actor
  readonly datasetId: string
  readonly interpretedBy: "deterministic" | "model"
  /** Called only when a new mission is about to start; the id is the mission's. */
  readonly nextMissionId: () => string
  /** Fired before the engine acts, so a surface can show state (busy label, announcement). */
  readonly onBeforeApply?: (session: SessionHint | null, intent: Intent) => void
}

export async function conduct(
  engine: MissionCommands,
  input: ConductorInput,
): Promise<ConductorOutcome> {
  const { intent, current } = input
  const before = (session: SessionHint | null) => input.onBeforeApply?.(session, intent)

  if (intent.kind === "complete_target" || intent.kind === "complete_task") {
    const missionId = input.nextMissionId()
    before("PLANNING")
    await engine.start(proposeFromIntent(intent, input.actor, missionId), {
      datasetId: input.datasetId,
      interpretedBy: input.interpretedBy,
    })
    return { kind: "started", missionId }
  }

  if (!current) return { kind: "reply", intent }
  const pendingStepId = current.pending?.kind === "confirm_step" ? current.pending.stepId : null

  switch (intent.kind) {
    case "log_time": {
      const pending = current.pending
      if (pending?.kind === "input_hours") {
        const step = current.plan.find((s) => s.id === pending.stepId)
        const matches =
          intent.target === null || (step !== undefined && step.ref.id === intent.target.id)
        if (matches) {
          before("EXECUTING")
          await engine.provideHours(current.id, pending.stepId, intent.hours)
          return { kind: "applied", session: "EXECUTING" }
        }
      }
      return {
        kind: "reply",
        intent: {
          kind: "unsupported",
          reason: "no_target",
          query: null,
          utterance: intent.utterance,
          source: intent.source,
        },
      }
    }
    case "approve":
      before("EXECUTING")
      await engine.approve(current.id, pendingStepId)
      return { kind: "applied", session: "EXECUTING" }
    case "decline":
      before(null)
      await engine.decline(current.id, pendingStepId)
      return { kind: "applied", session: null }
    case "cancel":
      before(null)
      engine.cancel(current.id)
      return { kind: "applied", session: null }
    case "continue":
      before("RECHECKING")
      await engine.resume(current.id)
      return { kind: "applied", session: "RECHECKING" }
    case "change_scope":
      before("RECHECKING")
      await engine.changeScope(current.id, intent.exclude)
      return { kind: "applied", session: "RECHECKING" }
    default:
      return { kind: "reply", intent }
  }
}
