"use client"

import Link from "next/link"

import { ConversationIcon } from "@/components/conversation/ConversationIcon"
import type { Block, SemanticIcon } from "@/core/agent/conversation/blocks"
import { MISSION_LABEL } from "@/core/mission/labels"
import type { Mission } from "@/core/mission/mission"

/**
 * One line of mission history (final brief §26): outcome first, goal, when. Clicking reopens the
 * persisted mission, its decisions and evidence. Derived from the mission, never from a transcript.
 */
export function MissionHistoryRow({ mission, now }: { mission: Mission; now: number }) {
  const { icon, tone } = presentation(mission)
  return (
    <li>
      <Link
        href={`/m/${mission.id}`}
        className="hover:bg-muted group flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 transition-colors duration-[var(--motion-fast)]"
      >
        <span className="flex w-4 shrink-0 justify-center">
          <ConversationIcon name={icon} tone={tone} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-foreground truncate text-[13px]">{mission.goalText}</span>
          <span className="text-muted-foreground truncate text-[12px]">{summary(mission)}</span>
        </span>
        <span className="text-muted-foreground shrink-0 text-[12px] tabular-nums">
          {relative(mission.updatedAt, now)}
        </span>
      </Link>
    </li>
  )
}

function presentation(mission: Mission): { icon: SemanticIcon; tone: Block["tone"] } {
  switch (mission.state) {
    case "COMPLETED":
      return { icon: "landing", tone: "success" }
    case "PARTIALLY_COMPLETED":
      return { icon: "landing", tone: "waiting" }
    case "WAITING":
      return { icon: "person", tone: "waiting" }
    case "PAUSED":
    case "STALE":
      return { icon: "pause", tone: "paused" }
    case "BLOCKED":
    case "PERMISSION_DENIED":
      return { icon: "blocker", tone: "blocked" }
    case "FAILED":
      return { icon: "error", tone: "error" }
    case "CANCELLED":
      return { icon: "cancel", tone: "paused" }
    default:
      return { icon: "execution", tone: "neutral" }
  }
}

/** What happened, in the user's terms: exact buckets when the mission is over, the state otherwise. */
function summary(mission: Mission): string {
  const o = mission.outcome
  if (o) {
    const parts: string[] = []
    if (o.completed > 0) parts.push(`${o.completed} completed`)
    if (o.alreadyComplete > 0) parts.push(`${o.alreadyComplete} already complete`)
    if (o.blocked > 0) parts.push(`${o.blocked} blocked`)
    if (o.permissionDenied > 0) parts.push(`${o.permissionDenied} not permitted`)
    if (o.failed > 0) parts.push(`${o.failed} failed`)
    if (o.cancelled > 0) parts.push(`${o.cancelled} cancelled`)
    if (parts.length > 0) return `${MISSION_LABEL[mission.state]} · ${parts.join(" · ")}`
  }
  if (mission.pending?.kind === "input") return "Waiting for you · needs hours"
  if (mission.pending) return "Waiting for you · needs a decision"
  return MISSION_LABEL[mission.state]
}

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" })
const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })

function relative(at: number, now: number): string {
  const then = new Date(at)
  const today = new Date(now)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const dayMs = 86_400_000
  if (at >= startOfToday) return time.format(then)
  if (at >= startOfToday - dayMs) return "Yesterday"
  if (at >= startOfToday - 6 * dayMs) return weekday.format(then)
  return date.format(then)
}
