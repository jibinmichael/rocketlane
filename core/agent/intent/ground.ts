import {
  type Intent,
  type IntentProposal,
  IntentProposalSchema,
  spanText,
} from "@/core/agent/intent/intent"
import type { WorkspaceGraph } from "@/core/domain/graph"
import type { EntityRef, ProjectId } from "@/core/domain/ids"
import { resolveAny, resolveTask } from "@/core/resolver/target"

/**
 * Deterministic grounding: spans → entity refs (D-04). Runs on every proposal regardless of which
 * interpreter produced it. Ambiguity becomes a clarification; nothing is guessed.
 */
export function ground(
  rawProposal: unknown,
  utterance: string,
  graph: WorkspaceGraph,
  scope: { projectId?: ProjectId } = {},
): Intent {
  const parsed = IntentProposalSchema.safeParse(rawProposal)
  if (!parsed.success) {
    return {
      kind: "unsupported",
      reason: "out_of_scope",
      query: null,
      utterance,
      source: sourceOf(rawProposal),
    }
  }
  const proposal: IntentProposal = {
    ...parsed.data,
    targetSpans: parsed.data.targetSpans.filter((span) => !isPronoun(spanText(utterance, span))),
  }
  const source = proposal.source

  switch (proposal.kind) {
    case "cancel":
    case "continue":
    case "approve":
    case "decline":
    case "show_status":
      return { kind: proposal.kind, utterance, source }
    case "unsupported":
    case "ambiguous":
      return { kind: "unsupported", reason: "out_of_scope", query: null, utterance, source }
    case "log_time": {
      const hours = proposal.hours
      if (hours === null || !Number.isFinite(hours) || hours <= 0) {
        return { kind: "unsupported", reason: "no_target", query: null, utterance, source }
      }
      const span = proposal.targetSpans[0]
      if (!span) return { kind: "log_time", target: null, hours, utterance, source }
      const query = spanText(utterance, span)
      const resolved = resolveTask(query, graph, scope)
      if (resolved.status === "resolved")
        return { kind: "log_time", target: resolved.ref, hours, utterance, source }
      if (resolved.status === "ambiguous")
        return { kind: "ambiguous", query, candidates: resolved.candidates, utterance, source }
      return { kind: "unsupported", reason: "target_not_found", query, utterance, source }
    }
    case "change_scope": {
      const span = proposal.targetSpans[0]
      if (!span) return { kind: "unsupported", reason: "no_target", query: null, utterance, source }
      const query = spanText(utterance, span)
      const resolved = resolveAny(query, graph, scope)
      if (resolved.status === "resolved")
        return { kind: "change_scope", exclude: resolved.ref, utterance, source }
      if (resolved.status === "ambiguous")
        return { kind: "ambiguous", query, candidates: resolved.candidates, utterance, source }
      return { kind: "unsupported", reason: "target_not_found", query, utterance, source }
    }
    case "complete_target":
    case "complete_task":
    case "explain_blocker":
    case "show_path":
    case "create_routine": {
      if (proposal.all && proposal.kind === "complete_target") {
        const targets: EntityRef[] = graph.projects.map((p) => ({ kind: "project", id: p.id }))
        return { kind: "complete_target", targets, utterance, source }
      }
      const targets: EntityRef[] = []
      for (const span of proposal.targetSpans) {
        const query = spanText(utterance, span)
        const resolved = resolveAny(query, graph, scope)
        if (resolved.status === "resolved") targets.push(resolved.ref)
        else if (resolved.status === "ambiguous")
          return { kind: "ambiguous", query, candidates: resolved.candidates, utterance, source }
        else return { kind: "unsupported", reason: "target_not_found", query, utterance, source }
      }
      if (
        targets.length === 0 &&
        (proposal.kind === "complete_target" || proposal.kind === "complete_task")
      ) {
        return { kind: "unsupported", reason: "no_target", query: null, utterance, source }
      }
      return { kind: proposal.kind, targets, utterance, source }
    }
  }
}

/** "why is it blocked?" — a pronoun is a reference to the current mission, never a name to look up. */
function isPronoun(text: string): boolean {
  return /^(?:is\s+)?(?:it|this|that|the\s+(?:project|task|mission))?\s*(?:blocked|stuck)?\s*$/i.test(
    text.trim(),
  )
}

function sourceOf(raw: unknown): IntentProposal["source"] {
  if (typeof raw === "object" && raw !== null && "source" in raw) {
    const source = (raw as { source: unknown }).source
    if (source === "deterministic" || source === "model") return source
  }
  return "model"
}
