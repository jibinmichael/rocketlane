import type { MissionState } from "@/core/mission/mission"

/** Human labels for mission states. Used by chips and by copy; never the raw enum. */
export const MISSION_LABEL: Record<MissionState, string> = {
  READY: "Ready",
  ACTIVE: "Working",
  WAITING: "Waiting for you",
  EXECUTING: "In flight",
  VERIFYING: "Verifying",
  PAUSED: "Paused",
  COMPLETED: "Landed",
  BLOCKED: "Blocked",
  FAILED: "Could not complete",
  STALE: "Paused — project changed",
  PERMISSION_DENIED: "Not permitted",
  CANCELLED: "Stopped",
  PARTIALLY_COMPLETED: "Landed with exceptions",
}
