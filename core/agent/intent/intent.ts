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
  "help",
  "cancel",
  "pause",
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
  /** "my projects": limit `all` to projects the acting user owns. Never widens scope. */
  mine: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
  source: z.enum(["deterministic", "model"]),
})
export type IntentProposal = z.infer<typeof IntentProposalSchema>

export type InterpretationContext = {
  /** Names in scope, for disambiguation only. Never copied into output. */
  readonly entityNames: readonly string[]
  readonly hasActiveMission: boolean
  readonly pendingDecision: "input" | "confirm_step" | "confirm_plan" | null
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
      /** "2 hours each": a standing answer for every task in this mission that still needs hours. */
      readonly each: boolean
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
      readonly kind:
        | "show_status"
        | "help"
        | "cancel"
        | "pause"
        | "continue"
        | "approve"
        | "decline"
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
      readonly reason:
        | "out_of_scope"
        | "target_not_found"
        | "no_target"
        /** In scope for the product, not supported yet: scoping by assignee or date. */
        | "unsupported_scope"
        /** "my projects" resolved to nothing the actor owns. */
        | "none_owned"
        /** A value was expected for a pending input and this was not a valid one. */
        | "invalid_input"
      readonly query: string | null
      readonly utterance: string
      readonly source: IntentProposal["source"]
    }

const WORD = /[\p{L}\p{N}]/u

/**
 * Text of a span, snapped outward to word boundaries. A model that returns an off-by-one span
 * ("Acme Implementatio") still grounds to the intended name; grounding stays deterministic.
 */
export function spanText(utterance: string, span: Span): string {
  let start = Math.max(0, Math.min(span.start, utterance.length))
  let end = Math.max(start, Math.min(span.end, utterance.length))
  while (start > 0 && WORD.test(utterance[start - 1]!) && WORD.test(utterance[start] ?? ""))
    start -= 1
  while (
    end < utterance.length &&
    WORD.test(utterance[end]!) &&
    WORD.test(utterance[end - 1] ?? "")
  )
    end += 1
  return utterance.slice(start, end).trim()
}
