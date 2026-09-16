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

/** A round filled dot plus a softly tinted field, both from the state; text stays ink. */
const FIELD_CLASS: Record<Tone, string> = {
  ready: "bg-muted",
  working: "bg-muted",
  waiting: "bg-status-warning-soft",
  blocked: "bg-status-error-soft",
  paused: "bg-status-warning-soft",
  error: "bg-status-error-soft",
  completed: "bg-status-success-soft",
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
        "text-foreground/80 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium tabular-nums transition-colors duration-[var(--motion-normal)]",
        FIELD_CLASS[tone],
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full transition-colors duration-[var(--motion-normal)]",
          DOT_CLASS[tone],
          tone === "working" && "animate-pulse",
        )}
      />
      {MISSION_LABEL[state]}
    </span>
  )
}

export { MISSION_TONE }
