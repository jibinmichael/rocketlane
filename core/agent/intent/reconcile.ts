import type { Intent } from "@/core/agent/intent/intent"

/**
 * The model proposes; the grammar can veto (spec §3: the model is not the authority).
 *
 * Both interpreters see the same utterance and both results are grounded before this runs. The
 * grounded grammar result wins in exactly two cases, both deterministic and both about losing
 * information the sentence plainly carries:
 *
 * 1. The model found nothing usable (unsupported or ambiguous) and the grammar found an intent.
 * 2. The sentence names a target ("actually leave Handover open", "log 2h on QA Complete") and the
 *    model reduced it to a bare decision (continue, approve, decline, cancel, status).
 *
 * Everything else is the model's call. Free text the grammar cannot parse still reaches the model.
 */
export function reconcile(remote: Intent | null, local: Intent): Intent {
  if (!remote) return local
  const localActs = local.kind !== "unsupported" && local.kind !== "ambiguous"
  const remoteEmpty = remote.kind === "unsupported" || remote.kind === "ambiguous"
  if (remoteEmpty && localActs) return local
  if (isTargeted(local) && BARE_DECISIONS.has(remote.kind)) return local
  // The grammar found and grounded a name the model missed: a grounded reading beats a bare one.
  if (isTargeted(local) && !isTargeted(remote) && local.kind === remote.kind) return local
  // The grammar found the name ambiguous in the workspace: a clarification beats a guess.
  if (local.kind === "ambiguous") return local
  // The grammar saw what looks like a name (capitals, hyphens, digits) that is not in the
  // workspace: "did you mean" beats a bare reply. Free-text tails stay with the model.
  if (
    local.kind === "unsupported" &&
    local.reason === "target_not_found" &&
    !isTargeted(remote) &&
    /[A-Z\-\d]/.test(local.query ?? "")
  )
    return local
  return remote
}

const BARE_DECISIONS: ReadonlySet<Intent["kind"]> = new Set([
  "approve",
  "decline",
  "continue",
  "pause",
  "cancel",
  "show_status",
])

function isTargeted(intent: Intent): boolean {
  if ("exclude" in intent) return true
  if ("targets" in intent) return intent.targets.length > 0
  if ("target" in intent) return intent.target !== null
  return false
}
