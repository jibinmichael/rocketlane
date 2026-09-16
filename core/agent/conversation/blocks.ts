import type { EntityRef } from "@/core/domain/ids"
import type { PolicyId } from "@/core/governance/policy"

/**
 * Typed agent output (spec §14, §42; contract in docs/agent-context/04). Copy is generated from
 * structured state. Entity references are slots, never interpolated text, so project content can
 * never read as agent prose.
 */

export type Inline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "entity"; readonly ref: EntityRef; readonly label: string }
  | { readonly kind: "policy"; readonly policyId: PolicyId | "DATA"; readonly label: string }
  | { readonly kind: "count"; readonly value: number }
  | { readonly kind: "time"; readonly at: number }

export type BlockAction =
  | {
      readonly kind: "approve"
      readonly stepId: string | null
      readonly label: string
      readonly impact: "high" | "safe"
    }
  | { readonly kind: "decline"; readonly stepId: string | null; readonly label: string }
  | { readonly kind: "log_time"; readonly stepId: string; readonly label: string }
  | { readonly kind: "continue"; readonly label: string }
  | { readonly kind: "cancel"; readonly label: string }
  | { readonly kind: "view_activity"; readonly label: string }
  | { readonly kind: "ask_owner"; readonly ownerName: string; readonly label: string }
  | { readonly kind: "pick_candidate"; readonly ref: EntityRef; readonly label: string }

export type BlockType =
  | "outcome.blocked"
  | "outcome.ready"
  | "already_complete"
  | "blocker"
  | "resolution_path"
  | "action_request.input"
  | "action_request.confirm"
  | "action_request.batch_confirm"
  | "declined"
  | "consequence"
  | "result.verified"
  | "result.mismatch"
  | "timeout_reconciled"
  | "state_change"
  | "replanned"
  | "stale_on_resume"
  | "scope_change"
  | "cancelled"
  | "partial_summary"
  | "permission_denied"
  | "clarification"
  | "boundary"
  | "landing"
  | "status"

export type PathNode = {
  readonly ref: EntityRef
  readonly label: string
  readonly state: "complete" | "open" | "actionable" | "target"
}

export type Block = {
  readonly id: string
  readonly type: BlockType
  readonly lines: readonly (readonly Inline[])[]
  readonly actions: readonly BlockAction[]
  /** Expandable detail, rendered in place (full dependency path, per-target list, evidence). */
  readonly detail: readonly (readonly Inline[])[] | null
  readonly path: readonly PathNode[] | null
  readonly tone: "neutral" | "blocked" | "waiting" | "success" | "paused" | "error"
}

export const text = (t: string): Inline => ({ kind: "text", text: t })
export const entity = (ref: EntityRef, label: string): Inline => ({ kind: "entity", ref, label })
export const policy = (policyId: PolicyId | "DATA", label: string): Inline => ({
  kind: "policy",
  policyId,
  label,
})
export const count = (value: number): Inline => ({ kind: "count", value })
export const time = (at: number): Inline => ({ kind: "time", at })

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return n === 1 ? singular : pluralForm
}
