"use client"

import { ArrowDown } from "lucide-react"

import { ArtifactStateChip } from "@/components/artifacts/ArtifactStateChip"
import { MISSION_LABEL } from "@/core/mission/labels"
import type { Mission } from "@/core/mission/mission"
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

const WORKING: ReadonlySet<AgentSessionState> = new Set([
  "UNDERSTANDING",
  "PLANNING",
  "CHECKING",
  "EXECUTING",
  "VERIFYING",
  "RECHECKING",
  "PAUSING",
])

/**
 * One 52px band: the user's goal, anchored · what the agent is doing while it works · the mission
 * state chip, hairline below (spec §13 of the final pass, §26). No internal counts.
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
  const working = WORKING.has(session)
  const currentStep = mission.currentStepId
    ? mission.plan.find((s) => s.id === mission.currentStepId)
    : null
  const activity =
    session === "EXECUTING" && currentStep
      ? `In flight · Updating ${currentStep.label}`
      : SESSION_LABEL[session]

  return (
    <header className="border-border/70 bg-background/90 sticky top-0 z-10 border-b backdrop-blur">
      <div className="mx-auto flex h-10 w-full max-w-[680px] items-center gap-4 px-6">
        <h1 className="sr-only">{mission.goalText}</h1>
        <span
          aria-live="polite"
          className="text-muted-foreground min-w-0 flex-1 truncate text-[12px]"
        >
          {working ? activity : MISSION_LABEL[mission.state]}
        </span>
        {!pinned && (
          <button
            type="button"
            onClick={onJump}
            className="border-border text-muted-foreground hover:text-foreground hover:bg-muted flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[12px] transition-colors duration-[var(--motion-fast)]"
          >
            {MISSION_LABEL[mission.state]}
            <ArrowDown aria-hidden className="size-3" strokeWidth={2} />
          </button>
        )}
        <span title={interpretedNote ?? undefined}>
          <ArtifactStateChip state={mission.state} session={session} />
        </span>
      </div>
      <div className="relative h-px w-full overflow-hidden">
        {working && (
          <span
            aria-hidden
            className="absolute top-0 left-0 h-px w-1/3 animate-[flight-hairline_1.2s_var(--ease-in-out)_infinite]"
            style={{ background: "var(--vibe-gradient)" }}
          />
        )}
        {mission.state === "COMPLETED" && (
          <span aria-hidden className="bg-state-completed absolute top-0 left-0 h-px w-full" />
        )}
      </div>
    </header>
  )
}
