"use server"

import type { IntentProposal, InterpretationContext } from "@/core/agent/intent/intent"

/**
 * Model interpreter server action (D-04). Built at hour 7; until then this returns null so the
 * runtime falls back to the deterministic interpreter, visibly. The browser never sees the key.
 */
export async function interpretUtterance(
  utterance: string,
  ctx: InterpretationContext,
): Promise<IntentProposal | null> {
  void utterance
  void ctx
  return null
}

export async function modelInterpreterAvailable(): Promise<boolean> {
  return (
    Boolean(process.env["ANTHROPIC_API_KEY"]) &&
    process.env["AGENT_INTERPRETER"] !== "deterministic"
  )
}
