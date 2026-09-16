import type { AgentSessionState } from "@/lib/runtime"

/** What the agent is doing right now, in flight language (spec §25): never an operation count. */
export const SESSION_LABEL: Record<AgentSessionState, string> = {
  READY: "Ready",
  UNDERSTANDING: "Preparing mission",
  PLANNING: "Preparing mission",
  CHECKING: "Checking governance",
  WAITING_FOR_USER: "Waiting for you",
  EXECUTING: "In flight",
  VERIFYING: "Verifying",
  RECHECKING: "Course correction",
  PAUSING: "Pausing · finishing the current update",
  PAUSED: "Paused",
  COMPLETED: "Landed",
  ERROR: "Could not continue",
  CANCELLED: "Stopped",
}

export const WORKING_STATES: ReadonlySet<AgentSessionState> = new Set([
  "UNDERSTANDING",
  "PLANNING",
  "CHECKING",
  "EXECUTING",
  "VERIFYING",
  "RECHECKING",
  "PAUSING",
])
