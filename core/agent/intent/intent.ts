import { z } from "zod"

import type { EntityRef } from "@/core/domain/ids"
import type { Candidate } from "@/core/resolver/target"

/**
 * The language boundary (D-04). An interpreter may only return an IntentProposal: a closed intent
 * plus SPANS over the user's utterance. It never returns entity names or ids. Grounding spans to
 * ids is deterministic (ground.ts). Nothing here can reach the executor.
 */

export const INTENT_KINDS = [
  "complete_target",
  "log_time",
  "complete_task",
  "explain_blocker",
  "show_path",
  "show_status",
  "cancel",
  "continue",
  "change_scope",
  "approve",
  "decline",
  "create_routine",
  "unsupported",
  "ambiguous",
] as const

export type IntentKind = (typeof INTENT_KINDS)[number]

export const SpanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
})
export type Span = z.infer<typeof SpanSchema>

export const IntentProposalSchema = z.object({
  kind: z.enum(INTENT_KINDS),
  /** Spans in the utterance that name the target(s). Empty when the intent has none. */
  targetSpans: z.array(SpanSchema).max(4),
  hours: z.number().positive().nullable(),
  /** "all projects" style requests. */
  all: z.boolean(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["deterministic", "model"]),
})
export type IntentProposal = z.infer<typeof IntentProposalSchema>

export type InterpretationContext = {
  /** Names in scope, for disambiguation only. Never copied into output. */
  readonly entityNames: readonly string[]
  readonly hasActiveMission: boolean
  readonly pendingDecision: "input_hours" | "confirm_step" | "confirm_plan" | null
}

export interface IntentInterpreter {
  interpret(utterance: string, ctx: InterpretationContext): Promise<IntentProposal> | IntentProposal
}

/** A grounded intent: spans have become explicit entity refs, or an explicit failure to ground. */
export type Intent =
  | {
      readonly kind:
        | "complete_target"
        | "complete_task"
        | "explain_blocker"
        | "show_path"
        | "create_routine"
      readonly targets: readonly EntityRef[]
      readonly utterance: string
      readonly source: IntentProposal["source"]
    }
  | {
      readonly kind: "log_time"
      readonly target: EntityRef | null
      readonly hours: number
      readonly utterance: string
      readonly source: IntentProposal["source"]
    }
  | {
      readonly kind: "change_scope"
      readonly exclude: EntityRef
      readonly utterance: string
      readonly source: IntentProposal["source"]
    }
  | {
      readonly kind: "show_status" | "cancel" | "continue" | "approve" | "decline"
      readonly utterance: string
      readonly source: IntentProposal["source"]
    }
  | {
      readonly kind: "ambiguous"
      readonly query: string
      readonly candidates: readonly Candidate[]
      readonly utterance: string
      readonly source: IntentProposal["source"]
    }
  | {
      readonly kind: "unsupported"
      readonly reason: "out_of_scope" | "target_not_found" | "no_target"
      readonly query: string | null
      readonly utterance: string
      readonly source: IntentProposal["source"]
    }

export function spanText(utterance: string, span: Span): string {
  return utterance.slice(span.start, span.end).trim()
}
