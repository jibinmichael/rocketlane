import { MISSION_LABEL } from "@/core/mission/labels"
import type { MissionState } from "@/core/mission/mission"
import type { AgentSessionState } from "@/lib/runtime"
import { StateChip } from "@/components/shared/StateChip"
import { cn } from "@/lib/utils"

type Tone = "ready" | "working" | "waiting" | "blocked" | "paused" | "error" | "completed"

const MISSION_TONE: Record<MissionState, Tone> = {
  READY: "ready",
  ACTIVE: "working",
  WAITING: "waiting",
  EXECUTING: "working",
  VERIFYING: "working",
  COMPLETED: "completed",
  BLOCKED: "blocked",
  FAILED: "error",
  STALE: "paused",
  PAUSED: "paused",
  PERMISSION_DENIED: "blocked",
  CANCELLED: "paused",
  PARTIALLY_COMPLETED: "completed",
}

const SESSION_TONE: Record<AgentSessionState, Tone> = {
  READY: "ready",
  UNDERSTANDING: "working",
  PLANNING: "working",
  CHECKING: "working",
  WAITING_FOR_USER: "waiting",
  EXECUTING: "working",
  VERIFYING: "working",
  RECHECKING: "paused",
  PAUSING: "working",
  PAUSED: "paused",
  COMPLETED: "completed",
  ERROR: "error",
  CANCELLED: "paused",
}

const CHIP_TONE: Record<
  Tone,
  "completed" | "waiting" | "blocked" | "paused" | "error" | "neutral"
> = {
  ready: "neutral",
  working: "neutral",
  waiting: "waiting",
  blocked: "blocked",
  paused: "paused",
  error: "error",
  completed: "completed",
}

export function ArtifactStateChip({
  state,
  session,
  className,
}: {
  state: MissionState
  session?: AgentSessionState
  className?: string
}) {
  const tone =
    session && session !== "READY" && session !== "WAITING_FOR_USER"
      ? SESSION_TONE[session]
      : MISSION_TONE[state]
  return (
    <StateChip
      tone={CHIP_TONE[tone]}
      className={cn("h-6 px-2.5 text-[12px] tabular-nums", className)}
    >
      {MISSION_LABEL[state]}
    </StateChip>
  )
}
