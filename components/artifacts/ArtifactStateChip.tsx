import { MISSION_LABEL } from "@/core/mission/labels"
import type { MissionState } from "@/core/mission/mission"
import type { AgentSessionState } from "@/lib/runtime"
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
  COMPLETED: "completed",
  ERROR: "error",
  CANCELLED: "paused",
}

const TONE_CLASS: Record<Tone, string> = {
  ready: "text-state-ready bg-muted",
  working: "text-state-working bg-status-info-soft",
  waiting: "text-state-waiting bg-status-warning-soft",
  blocked: "text-state-blocked bg-status-error-soft",
  paused: "text-state-paused bg-status-warning-soft",
  error: "text-state-error bg-status-error-soft",
  completed: "text-state-completed bg-status-success-soft",
}

const DOT_CLASS: Record<Tone, string> = {
  ready: "bg-state-ready",
  working: "bg-state-working",
  waiting: "bg-state-waiting",
  blocked: "bg-state-blocked",
  paused: "bg-state-paused",
  error: "bg-state-error",
  completed: "bg-state-completed",
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
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium tabular-nums transition-colors duration-[var(--motion-normal)]",
        TONE_CLASS[tone],
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", DOT_CLASS[tone])} />
      {MISSION_LABEL[state]}
    </span>
  )
}

export { MISSION_TONE }
