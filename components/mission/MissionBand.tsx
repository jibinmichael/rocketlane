"use client"

import { ArtifactStateChip } from "@/components/artifacts/ArtifactStateChip"
import { MISSION_LABEL } from "@/core/mission/labels"
import type { Mission } from "@/core/mission/mission"
import { summarize } from "@/core/mission/mission"
import type { AgentSessionState } from "@/lib/runtime"
import { cn } from "@/lib/utils"

const SESSION_LABEL: Record<AgentSessionState, string> = {
  READY: "Ready",
  UNDERSTANDING: "Finding the target",
  PLANNING: "Planning",
  CHECKING: "Checking governance",
  WAITING_FOR_USER: "Waiting for you",
  EXECUTING: "Updating",
  VERIFYING: "Verifying",
  RECHECKING: "Rechecking",
  COMPLETED: "Landed",
  ERROR: "Could not continue",
  CANCELLED: "Stopped",
}

const WORKING: ReadonlySet<AgentSessionState> = new Set([
  "UNDERSTANDING",
  "PLANNING",
  "CHECKING",
  "EXECUTING",
  "VERIFYING",
  "RECHECKING",
])

/**
 * One 52px band: goal · progress · what the agent is doing · state chip, hairline below
 * (spec §26 "keep the goal anchored"). Nothing else is pinned above the thread.
 */
export function MissionBand({
  mission,
  session,
  interpretedNote,
  pinned,
  onJump,
}: {
  mission: Mission
  session: AgentSessionState
  interpretedNote: string | null
  pinned: boolean
  onJump: () => void
}) {
  const { progress } = summarize(mission)
  const working = WORKING.has(session)
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const currentStep = mission.currentStepId
    ? mission.plan.find((s) => s.id === mission.currentStepId)
    : null
  const activity =
    session === "EXECUTING" && currentStep
      ? `Updating ${currentStep.label}`
      : SESSION_LABEL[session]
  const showActivity = working

  return (
    <header className="border-border bg-background/95 sticky top-0 z-10 border-b backdrop-blur">
      <div className="mx-auto flex h-[52px] w-full max-w-[720px] items-center gap-4 px-6">
        <h1 className="text-foreground min-w-0 flex-1 truncate text-[14px] font-medium tracking-[-0.005em]">
          {mission.goalText}
        </h1>
        {showActivity && (
          <span aria-live="polite" className="text-muted-foreground shrink-0 text-[12px]">
            {activity}
          </span>
        )}
        {!pinned && (
          <button
            type="button"
            onClick={onJump}
            className="border-border text-muted-foreground hover:text-foreground h-6 shrink-0 rounded-full border px-2 text-[12px] transition-colors duration-[var(--motion-fast)]"
          >
            {MISSION_LABEL[mission.state]} ↓
          </button>
        )}
        <span className="text-muted-foreground shrink-0 text-[12px] tabular-nums">
          {progress.done} of {progress.total} {progress.total === 1 ? "update" : "updates"}
        </span>
        <span title={interpretedNote ?? undefined}>
          <ArtifactStateChip state={mission.state} session={session} />
        </span>
      </div>
      <div className="relative h-px w-full overflow-hidden">
        {working && progress.total === 0 && (
          <span
            aria-hidden
            className="bg-state-working absolute top-0 left-0 h-px w-1/3 animate-[flight-hairline_1.2s_var(--ease-in-out)_infinite]"
          />
        )}
        {progress.total > 0 && (
          <span
            aria-hidden
            className={cn(
              "absolute top-0 left-0 h-px transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-out)]",
              mission.state === "COMPLETED"
                ? "bg-state-completed"
                : working
                  ? "bg-state-working"
                  : "bg-foreground/30",
            )}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </header>
  )
}
